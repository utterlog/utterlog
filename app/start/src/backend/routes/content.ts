import { createHash } from 'node:crypto';
import { existsSync, readdirSync, rmSync, statfsSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { config, table } from '../config';
import { sql } from '../db/client';
import { exec, intParam, many, nowUnix, one, pageParams } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';
import { nonEmptyString, parseJson } from '../http/validation';
import { ephemeral } from '../store/ephemeral';
import { runtimePaths } from '../paths';
import { SUPPORTED_BLOG_THEMES, normalizeBlogTheme, resolveBlogTheme } from '../blog-themes';
import { resolveThemePreviewUrl } from '../theme-assets';
import { sendConfiguredEmail } from '../email';
import { sendPostPublishedTelegram } from '../telegram';
import { assertPublicHttpUrl } from '../http/public-url';
import { lookupGeoIp, normalizeGeoProvider } from '../geoip';
import { appVersion, getCpuPercent, getHostUptimeLabel, getHostUptimeSeconds } from '../system/metrics';
import { getHostOsInfo, parsePostgresVersion, resolveHostPublicIp } from '../system/host';
import { isBotUa } from '../bot-detect';
import {
  allowedMediaExts,
  detectMediaCategory,
  imageExts,
  mediaExt,
  mediaMimeByExt,
  mediaMimeType,
  processableImageExts,
  storeUploadedBytes,
  storeUploadedBytesAt,
  testS3Connection,
  validUploadFolders,
} from '../media/storage';
import { BrandingUploadError, storeBrandingUpload } from '../services/branding';
import { deleteMetaRecord, saveMetaRecord } from '../services/metas';
import { listMediaRecords, mediaStorageStats } from '../services/media';
import { parsePermalinkPath } from '../services/permalink';
import {
  adminCommentPendingCounts,
  approveAdminComment,
  batchAdminComments,
  deleteAdminComment,
  replyToAdminComment,
  updateAdminComment,
} from '../services/comments';
import { readResolvedOptionMap, writeOptionMap } from '../services/options';
import {
  createCommentCaptchaChallenge,
  createCommentImageCaptcha,
} from '../services/comment-captcha';
import { createPublicComment } from '../services/public-comments';
import { PublicWriteError } from '../services/public-write';
import { listComments as listCommentsDirect } from '../public-read';
import { localeFiles, readLocale } from '../services/i18n';
import { searchPosts } from '../services/search';
import { visitorGeo } from '../services/analytics';
import { MusicProxyError, proxyMusicAsset, searchMusic } from '../services/music-proxy';
import { publicOnlineVisitors, trackDuration, trackPageView } from '../services/tracking';
import { requestIp } from '../request-ip';

const contentTables = new Set(['moments', 'music', 'movies', 'books', 'games', 'videos', 'goods', 'links', 'playlists']);
const writableTables = new Set([...contentTables, 'posts', 'comments', 'media', 'albums', 'notifications']);
const readableTables = new Set([...writableTables]);

const linkApplySchema = z.object({
  name: nonEmptyString(150),
  url: z.string().trim().url().max(500),
  description: z.string().trim().max(500).optional(),
  logo: z.string().trim().max(500).optional(),
  avatar: z.string().trim().max(500).optional(),
  rss_url: z.string().trim().url().max(500).optional().or(z.literal('')),
  email: z.string().trim().email().max(150).optional().or(z.literal('')),
});

function searchParams(c: any) {
  return new URL(c.req.url).searchParams as URLSearchParams;
}

async function isAdmin(userId: number) {
  if (!userId) return false;
  const row = await one<{ role: string }>(`select role from ${table('users')} where id = $1`, [userId]);
  return row?.role?.toLowerCase() === 'admin';
}

async function optionMap(includeSensitive: boolean) {
  return readResolvedOptionMap(includeSensitive);
}

function gravatarUrlForEmail(email: string, size = 64) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  const hash = createHash('md5').update(normalized).digest('hex');
  return `https://gravatar.bluecdn.com/avatar/${hash}?s=${size}&d=mp`;
}

function utterlogAvatarUrlForEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  const hash = createHash('md5').update(normalized).digest('hex');
  return `https://id.utterlog.com/avatar/${hash}`;
}

async function ownerPublicPayload(user: Record<string, unknown> | null) {
  if (!user) return {};
  const email = String(user.email || '');
  const profileAvatar = String(user.avatar || '');
  const utterlogAvatar = String(user.utterlog_avatar || '') || utterlogAvatarUrlForEmail(email);
  const gravatarUrl = gravatarUrlForEmail(email, 128);
  const avatarSource = await optionValue('avatar_source', 'auto');
  const ownerAvatarOption = await optionValue('owner_avatar', '');

  let avatar = '';
  switch (avatarSource) {
    case 'profile':
      avatar = profileAvatar;
      break;
    case 'utterlog':
      avatar = utterlogAvatar;
      break;
    case 'gravatar':
      avatar = gravatarUrl;
      break;
    default:
      avatar = profileAvatar || utterlogAvatar || gravatarUrl || ownerAvatarOption;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    bio: user.bio,
    role: user.role,
    url: user.url || '',
    avatar: avatar || null,
    gravatar_url: gravatarUrl,
    utterlog_avatar: utterlogAvatar,
  };
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

function xmlEscape(value: string) {
  return htmlEscape(value);
}

function boolOptionValue(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
  }
  return fallback;
}

function siteOrigin(opts: Record<string, string>) {
  return String(opts.site_url || config.appUrl || '').replace(/\/+$/, '');
}

function oneLine(value: string, limit = 240) {
  let text = String(value || '').trim().replace(/\r?\n/g, ' ');
  while (text.includes('  ')) text = text.replaceAll('  ', ' ');
  return [...text].length > limit ? `${[...text].slice(0, limit).join('')}...` : text;
}

const RSS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseNaiveWallClock(text: string, timeZone: string): Date | null {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const s = Number(m[6] ?? 0);
  const target = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!timeZone || timeZone === 'UTC') return new Date(target);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  let ts = target;
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(ts));
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    const got = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'));
    const diff = target - got;
    if (diff === 0) break;
    ts += diff;
  }
  return new Date(ts);
}

function parsePostPublishedDate(
  post: { published_at?: unknown; created_at?: unknown },
  timeZone = 'UTC',
): Date {
  const raw = post.published_at ?? post.created_at ?? 0;
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const n = Number(raw);
    const date = new Date(n > 1e9 && n < 1e10 ? n * 1000 : n);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const text = String(raw).trim();
  if (!text) return new Date();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const naive = parseNaiveWallClock(text, timeZone);
  if (naive) return naive;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatTimezoneOffset(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date);
  const tzName = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return '+0000';
  const sign = match[1];
  const hh = String(match[2]).padStart(2, '0');
  const mm = String(match[3] || '00').padStart(2, '0');
  return `${sign}${hh}${mm}`;
}

function formatRfc822InTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const month = RSS_MONTHS[Number(pick('month')) - 1] || 'Jan';
  const offset = formatTimezoneOffset(date, timeZone);
  return `${weekday}, ${pick('day')} ${month} ${pick('year')} ${pick('hour')}:${pick('minute')}:${pick('second')} ${offset}`;
}

function formatIso8601Date(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function postDateParts(
  post: { published_at?: unknown; created_at?: unknown },
  timeZone = 'UTC',
) {
  const date = parsePostPublishedDate(post, timeZone);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    iso: date.toISOString(),
  };
}

function formatRssPubDate(
  post: { published_at?: unknown; created_at?: unknown },
  timeZone = 'UTC',
) {
  return formatRfc822InTimeZone(parsePostPublishedDate(post, timeZone), timeZone);
}

function rssItemLimit(opts: Record<string, string>) {
  const configured = Number(String(opts.rss_items || '').trim());
  if (Number.isFinite(configured) && configured > 0) return Math.min(100, Math.max(1, Math.floor(configured)));
  return 20;
}

function cdata(value: string) {
  return `<![CDATA[${String(value || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

async function loadPublishedPostsForFeed(limit = 50) {
  return many<Record<string, unknown>>(
    `select p.id, p.slug, p.display_id, p.title, p.excerpt, p.content, p.created_at, p.published_at,
            coalesce((
              select m.slug from ${table('relationships')} r
              join ${table('metas')} m on m.id = r.meta_id and m.type = 'category'
              where r.post_id = p.id order by m.id asc limit 1
            ), '') as category_slug
     from ${table('posts')} p
     where p.status = 'publish' and p.type = 'post'
     order by coalesce(p.published_at, to_timestamp(p.created_at)) desc nulls last, p.id desc
     limit $1`,
    [limit],
  ).catch(() => []);
}

function buildRssFeedXml(opts: Record<string, string>, posts: Record<string, unknown>[]) {
  const site = siteOrigin(opts);
  const timeZone = String(opts.site_timezone || 'UTC').trim() || 'UTC';
  const channelTitle = String(opts.site_title || 'Utterlog').trim() || 'Utterlog';
  const channelDescription = String(opts.site_description || opts.seo_default_description || channelTitle).trim();
  const permalink = opts.permalink_structure || '/posts/%postname%';
  const feedUrl = `${site}/feed`;
  const now = new Date();
  const lastBuildDate = formatRfc822InTimeZone(now, timeZone);
  const items = posts.map((post) => {
    const path = buildPostPath(post, permalink, timeZone);
    const link = `${site}${path}`;
    const guid = `${site}/?p=${post.id}`;
    const publishedAt = parsePostPublishedDate(post, timeZone);
    const description = oneLine(String(post.excerpt || post.content || '').trim(), 500);
    return [
      '  <item>',
      `    <title>${cdata(String(post.title || ''))}</title>`,
      `    <link>${xmlEscape(link)}</link>`,
      `    <guid isPermaLink="false">${xmlEscape(guid)}</guid>`,
      `    <pubDate>${formatRssPubDate(post, timeZone)}</pubDate>`,
      `    <dc:date>${formatIso8601Date(publishedAt)}</dc:date>`,
      `    <description>${cdata(description)}</description>`,
      '  </item>',
    ].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${xmlEscape(channelTitle)}</title>
<link>${xmlEscape(site)}</link>
<description>${xmlEscape(channelDescription)}</description>
<language>zh-CN</language>
<lastBuildDate>${lastBuildDate}</lastBuildDate>
<ttl>60</ttl>
<atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`;
}

export async function publicFeedResponse(request: Request) {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  const posts = await loadPublishedPostsForFeed(rssItemLimit(opts));
  const xml = buildRssFeedXml(opts, posts);
  const etag = `"${createHash('sha1').update(xml).digest('hex')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': 'public, max-age=300, must-revalidate' } });
  }
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8',
    'cache-control': 'public, max-age=300, must-revalidate', etag } });
}

function buildPostPath(
  post: { id?: unknown; display_id?: unknown; slug?: unknown; category_slug?: unknown; published_at?: unknown; created_at?: unknown },
  template = '',
  timeZone = 'UTC',
) {
  const tpl = template.trim() || '/posts/%postname%';
  const parts = postDateParts(post, timeZone);
  const category = encodeURIComponent(String(post.category_slug || 'uncategorized'));
  const path = tpl
    .replace(/%postname%/g, encodeURIComponent(String(post.slug || post.id || '')))
    .replace(/%post_id%/g, String(post.id || ''))
    .replace(/%display_id%/g, String(post.display_id || post.id || ''))
    .replace(/%year%/g, parts.year)
    .replace(/%month%/g, parts.month)
    .replace(/%day%/g, parts.day)
    .replace(/%category%/g, category);
  return path.startsWith('/') ? path : `/${path}`;
}

const aiBotUserAgents = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Bytespider',
  'FacebookBot',
  'Meta-ExternalAgent',
  'Applebot-Extended',
  'DuckAssistBot',
  'Diffbot',
];

let activeUploads = 0;
const maxConcurrentUploads = 5;

async function maxUploadBytes(multiplier = 1) {
  const raw = Number.parseInt(await optionValue('max_upload_size', '50'), 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : 50;
  return mb * multiplier * 1024 * 1024;
}

async function allowedUploadExts() {
  const raw = await optionValue('allowed_extensions', '');
  const configured = raw
    .split(/[\s,，]+/)
    .map((value) => value.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
  if (!configured.length) return allowedMediaExts;
  return new Set(configured);
}

async function assertStorageBudget(incomingBytes: number) {
  const raw = Number(await optionValue('storage_limit_gb', '0'));
  if (!Number.isFinite(raw) || raw <= 0) return;
  const limit = raw * 1024 * 1024 * 1024;
  const used = await one<{ size: string }>(`select coalesce(sum(size),0)::text as size from ${table('media')}`).catch(() => null);
  if (Number(used?.size || 0) + incomingBytes > limit) {
    throw new Error(`空间容量超过 ${raw}GB 限制`);
  }
}

function acquireUploadSlot() {
  if (activeUploads >= maxConcurrentUploads) return null;
  activeUploads += 1;
  return () => {
    activeUploads = Math.max(0, activeUploads - 1);
  };
}

function imageExifFromMetadata(metadata: Record<string, any>) {
  const exif: Record<string, unknown> = {};
  for (const key of ['format', 'width', 'height', 'space', 'density', 'orientation']) {
    if (metadata[key] !== undefined && metadata[key] !== null) exif[key] = metadata[key];
  }
  if (metadata.hasAlpha !== undefined) exif.has_alpha = Boolean(metadata.hasAlpha);
  return Object.keys(exif).length ? JSON.stringify(exif) : '';
}

async function processUploadedImage(bytes: Buffer, ext: string, folder = '') {
  if (!processableImageExts.has(ext)) {
    return {
      bytes,
      ext,
      mimeType: mediaMimeType(ext),
      exifData: '',
      thumbnails: {},
      thumbnailBuffers: {},
      converted: false,
      compressed: false,
    };
  }
  const sharpModule = await (new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>)('sharp').catch(() => null);
  const sharp = (sharpModule as any)?.default || sharpModule;
  if (!sharp) {
    return {
      bytes,
      ext,
      mimeType: mediaMimeType(ext),
      exifData: '',
      thumbnails: {},
      thumbnailBuffers: {},
      converted: false,
      compressed: false,
    };
  }

  const stripExif = ['true', '1'].includes((await optionValue('image_strip_exif', '')).toLowerCase());
  const requestedFormat = (await optionValue('image_convert_format', '')).toLowerCase();
  const finalExt = ['webp', 'jpg', 'jpeg', 'png', 'avif'].includes(requestedFormat)
    ? (requestedFormat === 'jpeg' ? 'jpg' : requestedFormat)
    : (ext === 'jpeg' ? 'jpg' : ext);
  const qualityRaw = Number.parseInt(await optionValue('image_quality', '82'), 10);
  const quality = Number.isFinite(qualityRaw) && qualityRaw > 0 && qualityRaw <= 100 ? qualityRaw : 82;
  const maxWidthRaw = Number.parseInt(await optionValue('image_max_width', '0'), 10);
  const maxWidth = Number.isFinite(maxWidthRaw) && maxWidthRaw > 0 ? maxWidthRaw : 0;
  const metadata = await sharp(bytes).metadata().catch(() => ({}));
  let pipeline = sharp(bytes, { animated: false }).rotate();
  if (maxWidth > 0) pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  if (!stripExif) pipeline = pipeline.withMetadata();

  switch (finalExt) {
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality });
      break;
    case 'png':
      pipeline = pipeline.png();
      break;
    default:
      pipeline = pipeline.jpeg({ quality });
      break;
  }

  const output = await pipeline.toBuffer().catch(() => bytes);
  const thumbs: Record<string, string> = {};
  const thumbnailBuffers: Record<string, Buffer> = {};
  const thumbSizes = [
    ['large', 1200, 630],
    ['medium', 480, 300],
    ['small', 300, 300],
  ] as const;
  for (const [name, width, height] of thumbSizes) {
    const thumb = await sharp(bytes)
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .webp({ quality: Math.min(quality, 80) })
      .toBuffer()
      .catch(() => null);
    if (!thumb) continue;
    thumbnailBuffers[name] = thumb;
  }

  return {
    bytes: output,
    ext: finalExt,
    mimeType: mediaMimeType(finalExt),
    exifData: stripExif ? '' : imageExifFromMetadata(metadata),
    thumbnails: thumbs,
    thumbnailBuffers,
    converted: finalExt !== ext && !(finalExt === 'jpg' && ext === 'jpeg'),
    compressed: output.length < bytes.length,
  };
}

async function isManagedMediaUrl(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) return true;
  if (value.startsWith('/uploads/')) return true;
  if (value.startsWith('/logo.') || value.startsWith('/dark-logo.') || value.startsWith('/favicon.')) return true;
  const prefixes = [
    config.appUrl,
    config.s3PublicUrl,
    await optionValue('s3_custom_domain', ''),
  ].map((item) => item.trim().replace(/\/+$/, '')).filter(Boolean);
  return prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

function mediaExtFromContentTypeOrUrl(contentType: string, url: string) {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const fromMime = Object.entries(mediaMimeByExt).find(([, value]) => value === mime)?.[0];
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  const fromUrl = mediaExt(new URL(url).pathname, '');
  return fromUrl || 'jpg';
}

async function syncContentMedia(contentType: string, contentId: number, coverUrl: unknown) {
  const rawUrl = String(coverUrl || '').trim();
  if (!contentType || !contentId || !rawUrl || await isManagedMediaUrl(rawUrl)) return;
  try {
    const safeUrl = await assertPublicHttpUrl(rawUrl);
    const res = await fetch(safeUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return;
    const contentTypeHeader = res.headers.get('content-type') || '';
    let ext = mediaExtFromContentTypeOrUrl(contentTypeHeader, safeUrl);
    if (ext === 'jpeg') ext = 'jpg';
    if (!imageExts.has(ext)) return;
    const maxBytes = await maxUploadBytes(2);
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > maxBytes) return;
    const originalBytes = Buffer.from(await res.arrayBuffer());
    if (!originalBytes.length || originalBytes.length > maxBytes) return;

    let finalBytes = originalBytes;
    let finalExt = ext;
    let finalMime = contentTypeHeader || mediaMimeType(ext);
    if (processableImageExts.has(ext)) {
      const processed = await processUploadedImage(originalBytes, ext);
      finalBytes = processed.bytes;
      finalExt = processed.ext;
      finalMime = processed.mimeType;
    }
    const stored = await storeUploadedBytes(finalBytes, finalExt, finalMime);
    await genericCreate('media', {
      name: `${contentType}-${contentId}-cover.${finalExt}`,
      filename: stored.relativePath,
      url: stored.url,
      mime_type: finalMime,
      size: finalBytes.length,
      driver: stored.driver,
      category: 'resource',
      source_type: contentType,
      source_id: contentId,
    });
    await exec(`update ${table(contentType)} set cover_url = $1, updated_at = $2 where id = $3`, [stored.url, nowUnix(), contentId]).catch(() => {});
  } catch {
    // Cover sync is best-effort; content creation/update should not fail because a remote image is unavailable.
  }
}

function normalizeMomentCreateSource(data: Record<string, unknown>) {
  const source = String(data.source || '').trim();
  if (!source || ['local', 'web', 'browser'].includes(source.toLowerCase())) data.source = '网页';
  else data.source = source;
}

async function mergeMomentTagOption(mood: unknown) {
  const tag = String(mood || '').trim();
  if (!tag) return;
  const current = (await optionValue('moment_tags', '')).split(',').map((item) => item.trim()).filter(Boolean);
  if (current.includes(tag)) return;
  await saveOption('moment_tags', [...current, tag].join(','));
}

function normalizeOrder(input: string | null, fallback: string) {
  const allowed = new Set(['id', 'created_at', 'updated_at', 'published_at', 'display_id', 'view_count', 'comment_count', 'title', 'name', 'order_num', 'sort_order', 'random']);
  return input && allowed.has(input) ? input : fallback;
}

function normalizeDirection(input: string | null) {
  return input?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

function diskStats(path = '/') {
  try {
    const stat = statfsSync(path);
    const total = Number(stat.blocks) * Number(stat.bsize);
    const free = Number(stat.bavail) * Number(stat.bsize);
    const used = Math.max(0, total - free);
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;
    return { total, free, used, percent, path };
  } catch {
    return { total: 0, free: 0, used: 0, percent: 0, path };
  }
}

function removeLocalUpload(relativePath: string) {
  const clean = relativePath.replace(/^\/+/, '');
  if (!clean || clean.includes('\0')) return;
  const root = resolve(config.uploadDir);
  const removeOne = (candidate: string) => {
    const fullPath = resolve(root, candidate);
    if (fullPath !== root && fullPath.startsWith(`${root}/`)) {
      rmSync(fullPath, { force: true });
    }
  };
  removeOne(clean);
  const base = clean.replace(/\.[^/.]+$/, '');
  for (const name of ['large', 'medium', 'small']) {
    removeOne(`${base}-${name}.webp`);
  }
}

function clientIp(c: any) {
  return requestIp(c.req.raw);
}

function maskIp(ip: string) {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    if (parts.length > 1) return `${parts[0]}:${parts[1]}::*`;
  }
  return ip;
}

function parseUa(ua: string) {
  const lower = ua.toLowerCase();
  const device = /mobile|iphone|android/.test(lower) ? 'Mobile' : /ipad|tablet/.test(lower) ? 'Tablet' : 'Desktop';
  const browser = lower.includes('edg/') ? 'Edge'
    : lower.includes('chrome/') ? 'Chrome'
      : lower.includes('safari/') && !lower.includes('chrome/') ? 'Safari'
        : lower.includes('firefox/') ? 'Firefox'
          : lower.includes('curl') ? 'curl'
            : '';
  const os = lower.includes('iphone') || lower.includes('ipad') ? 'iOS'
    : lower.includes('windows') ? 'Windows'
      : lower.includes('mac os') || lower.includes('macintosh') ? 'macOS'
        : lower.includes('android') ? 'Android'
          : lower.includes('linux') ? 'Linux'
            : 'Other';
  return { device, browser, os };
}

function geoHeaders(c: any) {
  const country = String(c.req.header('cf-ipcountry') || c.req.header('x-vercel-ip-country') || '').trim().toUpperCase().slice(0, 10);
  const region = String(c.req.header('x-vercel-ip-country-region') || c.req.header('cf-region') || '').trim().slice(0, 100);
  const city = decodeURIComponent(String(c.req.header('x-vercel-ip-city') || c.req.header('cf-ipcity') || '').trim()).slice(0, 100);
  const latitude = Number(c.req.header('x-vercel-ip-latitude') || c.req.header('cf-iplatitude') || 0);
  const longitude = Number(c.req.header('x-vercel-ip-longitude') || c.req.header('cf-iplongitude') || 0);
  return {
    country,
    countryName: country,
    region,
    city,
    latitude: Number.isFinite(latitude) ? latitude : 0,
    longitude: Number.isFinite(longitude) ? longitude : 0,
  };
}

function commentGeoFromRow(value: unknown) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function enrichAccessGeo(logId: number, ip: string) {
  if (!logId) return;
  try {
    const provider = await optionValue('ip_geo_provider', 'ipx');
    const payload = await lookupGeoIp(ip, provider, 5000);
    const country = String(payload?.country_code || payload?.country || '').toUpperCase().slice(0, 10);
    if (!country) return;
    const created = await one<{ created_at: number; country: string }>(
      `select created_at, coalesce(country,'') as country from ${table('access_logs')} where id = $1`,
      [logId],
    ).catch(() => null);
    await exec(
      `update ${table('access_logs')}
          set country = case when coalesce(country,'') = '' then $1 else country end,
              country_name = case when coalesce(country_name,'') = '' then $2 else country_name end,
              region = case when coalesce(region,'') = '' then $3 else region end,
              city = case when coalesce(city,'') = '' then $4 else city end,
              latitude = case when coalesce(latitude,0) = 0 then $5 else latitude end,
              longitude = case when coalesce(longitude,0) = 0 then $6 else longitude end
        where id = $7`,
      [
        country,
        String(payload?.country || country).slice(0, 100),
        String(payload?.province || '').slice(0, 100),
        String(payload?.city || '').slice(0, 100),
        Number(payload?.latitude || 0) || 0,
        Number(payload?.longitude || 0) || 0,
        logId,
      ],
    ).catch(() => {});
    if (created?.created_at && !created.country) {
      const day = await siteDate(new Date(Number(created.created_at) * 1000));
      await exec(
        `insert into ${table('stats_daily')} (date, dimension, dim_value, dim_extra, visits, unique_visitors)
         values ($1::date, 'country', $2, $3, 1, 0)
         on conflict (date, dimension, dim_value, dim_extra) do update set
           visits = ${table('stats_daily')}.visits + 1`,
        [day, String(payload?.country || country).slice(0, 100), country],
      ).catch(() => {});
    }
  } catch {
    // GeoIP enrichment is best-effort and must never block analytics writes.
  }
}

async function siteDate(value = new Date()) {
  const timeZone = await siteTimeZone();
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

async function siteTimeZone() {
  return (await optionValue('site_timezone', 'UTC')).trim() || 'UTC';
}

async function siteYearStartUnix() {
  const date = await siteDate();
  const year = Number(date.slice(0, 4)) || new Date().getUTCFullYear();
  return Math.floor(Date.UTC(year, 0, 1) / 1000);
}

async function postIdFromTrackedPath(path: string) {
  const template = await optionValue('permalink_structure', '/posts/%postname%');
  const parsed = parsePermalinkPath(path, template);
  if (parsed?.id) return parsed.id;
  if (parsed?.displayId) {
    const row = await one<{ id: number }>(
      `select id from ${table('posts')} where display_id = $1 and type = 'post' and status = 'publish' limit 1`,
      [parsed.displayId],
    ).catch(() => null);
    if (row?.id) return row.id;
  }
  if (parsed?.slug) {
    const row = await one<{ id: number }>(
      `select id from ${table('posts')} where slug = $1 and type = 'post' and status = 'publish' limit 1`,
      [parsed.slug],
    ).catch(() => null);
    if (row?.id) return row.id;
  }
  const slugMatch = path.match(/^\/posts\/([^/?#]+)/);
  if (slugMatch) {
    const slug = decodeURIComponent(slugMatch[1]);
    const row = await one<{ id: number }>(`select id from ${table('posts')} where slug = $1 and type = 'post' limit 1`, [slug]).catch(() => null);
    if (row?.id) return row.id;
  }
  const idMatch = path.match(/^\/(?:p|post)\/(\d+)(?:[/?#]|$)/);
  if (idMatch) return Number(idMatch[1]) || 0;
  return 0;
}

async function periodStart(period: string) {
  const now = nowUnix();
  if (period === 'all') return 0;
  if (period === 'year') {
    const timeZone = await siteTimeZone();
    const currentSiteDate = await siteDate(new Date(now * 1000));
    const year = Number(currentSiteDate.slice(0, 4)) || new Date().getUTCFullYear();
    const row = await one<{ ts: string }>(
      `select extract(epoch from ($1::date::timestamp at time zone $2))::bigint::text as ts`,
      [`${year}-01-01`, timeZone],
    ).catch(() => null);
    return Number(row?.ts || 0) || Math.floor(Date.UTC(year, 0, 1) / 1000);
  }
  if (period === '365d') return now - 365 * 86400;
  if (period === '30d') return now - 30 * 86400;
  if (period === '7d') return now - 7 * 86400;
  return now - 86400;
}

async function analyticsWhere(period: string) {
  const start = await periodStart(period);
  return {
    sql: start > 0 ? 'where created_at >= $1' : '',
    params: start > 0 ? [start] : [],
  };
}

async function rollupWindow(period: string) {
  const startUnix = await periodStart(period);
  const cutoffUnix = nowUnix() - 90 * 86400;
  const rawStart = startUnix > 0 ? Math.max(startUnix, cutoffUnix) : cutoffUnix;
  return {
    startUnix,
    rawStart,
    startDate: startUnix > 0 ? await siteDate(new Date(startUnix * 1000)) : '',
    cutoffDate: await siteDate(new Date(cutoffUnix * 1000)),
    timeZone: await siteTimeZone(),
  };
}

async function visitsForPeriod(period: string, global: { views: string; uniques: string } | null) {
  if (period === 'all' && global) return Number(global.views || 0);
  if (!['year', '365d'].includes(period)) {
    const where = await analyticsWhere(period);
    const row = await one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')} ${where.sql}`, where.params).catch(() => null);
    return Number(row?.count || 0);
  }
  const window = await rollupWindow(period);
  const [agg, raw] = await Promise.all([
    one<{ count: string }>(
      `select coalesce(sum(visits),0)::text as count from ${table('stats_daily')}
       where dimension = '_total' and date >= $1::date and date < $2::date`,
      [window.startDate, window.cutoffDate],
    ).catch(() => null),
    one<{ count: string }>(
      `select count(*)::text as count from ${table('access_logs')} where created_at >= $1`,
      [window.rawStart],
    ).catch(() => null),
  ]);
  return Number(agg?.count || 0) + Number(raw?.count || 0);
}

async function longDimensionRows(dimension: string, rawColumn: string, period: string, limit = 20) {
  const window = await rollupWindow(period);
  const merged = new Map<string, number>();
  const dailyParams: unknown[] = [dimension, window.cutoffDate];
  let dailyWhere = `dimension = $1 and date < $2::date`;
  if (window.startDate) {
    dailyParams.push(window.startDate);
    dailyWhere += ` and date >= $${dailyParams.length}::date`;
  }
  const dailyRows = await many<{ name: string; count: string }>(
    `select coalesce(nullif(dim_value,''), 'Unknown') as name, coalesce(sum(visits),0)::text as count
     from ${table('stats_daily')} where ${dailyWhere} group by name`,
    dailyParams,
  ).catch(() => []);
  const rawRows = await many<{ name: string; count: string }>(
    `select coalesce(nullif(${rawColumn},''), 'Unknown') as name, count(*)::text as count
     from ${table('access_logs')} where created_at >= $1 group by name`,
    [window.rawStart],
  ).catch(() => []);
  for (const row of [...dailyRows, ...rawRows]) merged.set(row.name, (merged.get(row.name) || 0) + Number(row.count || 0));
  const total = [...merged.values()].reduce((sum, count) => sum + count, 0) || 1;
  return [...merged.entries()]
    .map(([name, count]) => ({ name, count, ratio: Number((count / total).toFixed(4)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function dimensionRows(column: string, period: string, limit = 20) {
  const allowed = new Set(['browser', 'os', 'device_type', 'country_name', 'country', 'referer_host', 'path']);
  if (!allowed.has(column)) return [];
  if (['year', '365d', 'all'].includes(period) && ['browser', 'os', 'device_type'].includes(column)) {
    const dimension = column === 'device_type' ? 'device' : column;
    return longDimensionRows(dimension, column, period, limit);
  }
  const where = await analyticsWhere(period);
  const rows = await many<{ name: string; code?: string; count: string }>(
    `select coalesce(nullif(${column},''), 'Unknown') as name, count(*)::text as count
     from ${table('access_logs')} ${where.sql}
     group by name order by count(*) desc limit ${limit}`,
    where.params,
  ).catch(() => []);
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  return rows.map((row) => ({ name: row.name, count: Number(row.count || 0), ratio: Number((Number(row.count || 0) / total).toFixed(4)) }));
}

async function countryDimensionRows(period: string, limit = 20) {
  if (['year', '365d', 'all'].includes(period)) {
    const window = await rollupWindow(period);
    const merged = new Map<string, { name: string; code: string; count: number }>();
    const dailyParams: unknown[] = ['country', window.cutoffDate];
    let dailyWhere = `dimension = $1 and date < $2::date`;
    if (window.startDate) {
      dailyParams.push(window.startDate);
      dailyWhere += ` and date >= $${dailyParams.length}::date`;
    }
    const dailyRows = await many<{ name: string; code: string; count: string }>(
      `select coalesce(nullif(dim_value,''), 'Unknown') as name, coalesce(nullif(dim_extra,''), '') as code,
              coalesce(sum(visits),0)::text as count
       from ${table('stats_daily')} where ${dailyWhere} group by name, code`,
      dailyParams,
    ).catch(() => []);
    const rawRows = await many<{ name: string; code: string; count: string }>(
      `select coalesce(nullif(country_name,''), nullif(country,''), 'Unknown') as name,
              coalesce(nullif(country,''), '') as code,
              count(*)::text as count
       from ${table('access_logs')} where created_at >= $1 group by name, code`,
      [window.rawStart],
    ).catch(() => []);
    for (const row of [...dailyRows, ...rawRows]) {
      const key = `${row.name}\u0000${row.code}`;
      const current = merged.get(key) || { name: row.name, code: row.code, count: 0 };
      current.count += Number(row.count || 0);
      merged.set(key, current);
    }
    const total = [...merged.values()].reduce((sum, row) => sum + row.count, 0) || 1;
    return [...merged.values()]
      .map((row) => ({ ...row, ratio: Number((row.count / total).toFixed(4)) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  const where = await analyticsWhere(period);
  const rows = await many<{ name: string; code: string; count: string }>(
    `select coalesce(nullif(country_name,''), nullif(country,''), 'Unknown') as name,
            coalesce(nullif(country,''), '') as code,
            count(*)::text as count
     from ${table('access_logs')} ${where.sql}
     group by name, code order by count(*) desc limit ${limit}`,
    where.params,
  ).catch(() => []);
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  return rows.map((row) => ({
    name: row.name,
    code: row.code,
    count: Number(row.count || 0),
    ratio: Number((Number(row.count || 0) / total).toFixed(4)),
  }));
}

async function enrichOnlineUsers(publicView: boolean) {
  const keys = await ephemeral.scan('online:');
  const raw = (await Promise.all(keys.map(async (key) => {
    try {
      return JSON.parse(await ephemeral.get(key) || '{}') as Record<string, unknown>;
    } catch {
      return null;
    }
  }))).filter(Boolean) as Record<string, unknown>[];
  const result: Record<string, unknown>[] = [];
  for (const item of raw) {
    const visitorId = String(item.visitor_id || '');
    const ip = String(item.ip || '');
    const user: Record<string, unknown> = {
      visitor_id: visitorId,
      path: String(item.path || ''),
      ts: item.ts || 0,
    };
    if (publicView) {
      user.ip_masked = maskIp(ip);
    } else {
      user.ip = ip;
    }

    let comment = visitorId
      ? await one<{ author_name: string; author_email: string }>(
        `select author_name, coalesce(author_email,'') as author_email
         from ${table('comments')}
         where visitor_id = $1 and visitor_id != ''
         order by created_at desc, id desc limit 1`,
        [visitorId],
      ).catch(() => null)
      : null;
    if (!comment && ip) {
      comment = await one<{ author_name: string; author_email: string }>(
        `select author_name, coalesce(author_email,'') as author_email
         from ${table('comments')}
         where author_ip = $1
         order by created_at desc, id desc limit 1`,
        [ip],
      ).catch(() => null);
    }
    if (comment?.author_name) {
      user.name = comment.author_name;
      if (comment.author_email) {
        user.avatar = gravatarUrlForEmail(comment.author_email, 64);
      }
    }

    const geo = ip
      ? await one<{ country: string; country_code: string; city: string }>(
        `select coalesce(country_name,'') as country, coalesce(country,'') as country_code, coalesce(city,'') as city
         from ${table('access_logs')}
         where ip = $1 and country != ''
         order by created_at desc, id desc limit 1`,
        [ip],
      ).catch(() => null)
      : null;
    user.country = geo?.country || item.country || '';
    user.country_code = geo?.country_code || item.country_code || '';
    user.city = geo?.city || item.city || '';
    result.push(user);
  }
  return result;
}

async function analyticsOverview(period: string) {
  const where = await analyticsWhere(period);
  const timeZone = await siteTimeZone();
  const global = period === 'all'
    ? await one<{ views: string; uniques: string }>(
      `select coalesce(total_views,0)::text as views, coalesce(total_uniques,0)::text as uniques from ${table('stats_global')} where id = 1`,
    ).catch(() => null)
    : null;
  const longWindowVisitors = ['year', '365d'].includes(period)
    ? await one<{ count: string }>(
      `select count(distinct visitor_id)::text as count from ${table('stats_visitor_dates')} where date >= to_timestamp($1)::date`,
      [await periodStart(period)],
    ).catch(() => null)
    : null;
  const [visits, visitors, pages] = await Promise.all([
    visitsForPeriod(period, global),
    one<{ count: string }>(
      `select count(distinct coalesce(nullif(visitor_id,''), ip))::text as count from ${table('access_logs')} ${where.sql}`,
      where.params,
    ).catch(() => null),
    one<{ count: string }>(`select count(distinct path)::text as count from ${table('access_logs')} ${where.sql}`, where.params).catch(() => null),
  ]);
  const topPages = await many<Record<string, unknown>>(
    `select path, count(*)::int as count from ${table('access_logs')} ${where.sql} group by path order by count(*) desc limit 10`,
    where.params,
  ).catch(() => []);
  const refererWhere = where.sql ? `${where.sql} and referer_host != ''` : `where referer_host != ''`;
  const topReferers = await many<Record<string, unknown>>(
    `select referer_host as host, count(*)::int as count from ${table('access_logs')} ${refererWhere} group by referer_host order by count(*) desc limit 10`,
    where.params,
  ).catch(() => []);
  const hourly = await many<Record<string, unknown>>(
    `select to_char(to_timestamp(created_at) at time zone $1, 'HH24') as hour, count(*)::int as count
     from ${table('access_logs')} where created_at >= $2 group by hour order by hour`,
    [timeZone, nowUnix() - 86400],
  ).catch(() => []);
  const daily = await many<Record<string, unknown>>(
    `select to_char(to_timestamp(created_at) at time zone $1, 'MM-DD') as date, count(*)::int as count
     from ${table('access_logs')} where created_at >= $2 group by date order by date`,
    [timeZone, nowUnix() - 30 * 86400],
  ).catch(() => []);
  const recent = await many<Record<string, unknown>>(
    `select ip_masked as ip, path, browser, os, device_type as device, country_name as country, created_at
     from ${table('access_logs')} order by created_at desc, id desc limit 20`,
  ).catch(() => []);
  return {
    summary: {
      total_visits: visits,
      unique_ips: Number((period === 'all' && global ? global.uniques : longWindowVisitors?.count) || visitors?.count || 0),
      unique_pages: Number(pages?.count || 0),
    },
    top_pages: topPages,
    top_referers: topReferers,
    browsers: await dimensionRows('browser', period, 10),
    os: await dimensionRows('os', period, 10),
    devices: await dimensionRows('device_type', period, 10),
    countries: await countryDimensionRows(period, 20),
    hourly,
    daily,
    recent,
  };
}

async function archiveStatsPayload() {
  const [posts, comments, words, firstPost, accessViews, storedViews, heatmap, archives] = await Promise.all([
    one<{ count: string }>(
      `select count(*)::text as count from ${table('posts')} where status = 'publish' and type = 'post'`,
    ).catch(() => null),
    one<{ count: string }>(
      `select count(*)::text as count from ${table('comments')} where status = 'approved'`,
    ).catch(() => null),
    one<{ total: string }>(
      `select coalesce(sum(coalesce(word_count,0)),0)::text as total
       from ${table('posts')} where status = 'publish' and type = 'post'`,
    ).catch(() => null),
    one<{ first_at: string }>(
      `select coalesce(min(extract(epoch from coalesce(published_at, to_timestamp(created_at)))::bigint), 0)::text as first_at
       from ${table('posts')} where status = 'publish' and type = 'post'`,
    ).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')}`).catch(() => null),
    one<{ total: string }>(`select coalesce(total_views,0)::text as total from ${table('stats_global')} where id = 1`).catch(() => null),
    many<{ date: string; count: number }>(
      `select to_char(coalesce(published_at, to_timestamp(created_at)), 'YYYY-MM-DD') as date,
              count(*)::int as count
       from ${table('posts')}
       where status = 'publish' and type = 'post'
         and coalesce(published_at, to_timestamp(created_at)) >= now() - interval '1 year'
       group by date
       order by date asc`,
    ).catch(() => []),
    many<{ year: number; month: number; count: number }>(
      `select extract(year from coalesce(published_at, to_timestamp(created_at)))::int as year,
              extract(month from coalesce(published_at, to_timestamp(created_at)))::int as month,
              count(*)::int as count
       from ${table('posts')}
       where status = 'publish' and type = 'post'
       group by year, month
       order by year desc, month desc`,
    ).catch(() => []),
  ]);
  const firstAt = Number(firstPost?.first_at || 0);
  const days = firstAt > 0 ? Math.max(1, Math.ceil((nowUnix() - firstAt) / 86400) + 1) : 0;
  return {
    post_count: Number(posts?.count || 0),
    comment_count: Number(comments?.count || 0),
    word_count: Number(words?.total || 0),
    days,
    total_views: Math.max(Number(accessViews?.count || 0), Number(storedViews?.total || 0)),
    heatmap,
    archives,
  };
}

async function bumpPostView(postId: number) {
  const today = await siteDate();
  await exec(`update ${table('posts')} set view_count = coalesce(view_count, 0) + 1 where id = $1`, [postId]).catch(() => {});
  await exec(
    `insert into ${table('stats_post_daily')} (post_id, date, views, unique_visitors)
     values ($1, $2::date, 1, 0)
     on conflict (post_id, date) do update set views = ${table('stats_post_daily')}.views + 1`,
    [postId, today],
  ).catch(() => {});
}

async function getPostBy(where: string, params: unknown[], authed: boolean, track: boolean) {
  const post = await one<Record<string, unknown>>(`select * from ${table('posts')} where ${where} limit 1`, params);
  if (!post) return null;
  if (post.status !== 'publish' && !authed) return null;
  if (track && typeof post.id === 'number') {
    await bumpPostView(post.id);
    post.view_count = Number(post.view_count || 0) + 1;
  }
  const episodes = await many<Record<string, unknown>>(
    `select * from ${table('post_episodes')} where post_id = $1 order by sort_order asc, episode_no asc, id asc`,
    [post.id],
  ).catch(() => []);
  const metas = await many<Record<string, unknown>>(
    `select m.* from ${table('relationships')} r join ${table('metas')} m on m.id = r.meta_id where r.post_id = $1 order by m.type, m.name`,
    [post.id],
  ).catch(() => []);
  const footprints = await postFootprints(Number(post.id)).catch(() => []);
  const authorUser = post.author_id
    ? await one<Record<string, unknown>>(
      `select id, username, email, nickname, avatar, bio, url, role, utterlog_avatar
       from ${table('users')} where id = $1`,
      [post.author_id],
    ).catch(() => null)
    : null;
  const author = authorUser ? await ownerPublicPayload(authorUser) : null;
  return sanitizePostForResponse({
    ...post,
    meta: post.meta || {},
    categories: metas.filter((m) => m.type === 'category'),
    tags: metas.filter((m) => m.type === 'tag'),
    footprints,
    footprint_countries: footprintCountriesFrom(footprints),
    episodes,
    author,
  }, true);
}

function stripMarkdownExcerpt(content: string, maxLen = 200) {
  let text = String(content || '');
  while (text.includes('```')) {
    const start = text.indexOf('```');
    const end = text.indexOf('```', start + 3);
    if (end < 0) {
      text = text.slice(0, start);
      break;
    }
    text = `${text.slice(0, start)}${text.slice(end + 3)}`;
  }
  text = text
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '');
  text = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('>'))
    .join(' ')
    .trim();
  return [...text].slice(0, maxLen).join('');
}

function contentWordCount(content: string) {
  const text = stripMarkdownExcerpt(content, Number.MAX_SAFE_INTEGER);
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const words = text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0;
  return cjk + words;
}

function normalizeJsonbValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '{}';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function sanitizePostForResponse(row: Record<string, unknown>, detail: boolean) {
  const next = { ...row };
  delete next.password;
  next.meta = next.meta || {};
  if (!detail) {
    const aiSummary = String(next.ai_summary || '').trim();
    if (aiSummary) next.excerpt = aiSummary;
    if (!String(next.excerpt || '').trim() && next.content) {
      next.excerpt = stripMarkdownExcerpt(String(next.content || ''), 200);
    }
    delete next.content;
  }
  return next;
}

async function attachPostRelations(rows: Record<string, unknown>[], detail = false) {
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return rows.map((row) => sanitizePostForResponse(row, detail));
  const metas = await many<Record<string, unknown> & { post_id: number }>(
    `select r.post_id, m.*
     from ${table('relationships')} r
     join ${table('metas')} m on m.id = r.meta_id
     where r.post_id = any($1::int[]) and m.type in ('category', 'tag')
     order by m.type, m.name`,
    [ids],
  ).catch(() => []);
  const byPost = new Map<number, { categories: Record<string, unknown>[]; tags: Record<string, unknown>[] }>();
  for (const meta of metas) {
    const postId = Number(meta.post_id);
    if (!byPost.has(postId)) byPost.set(postId, { categories: [], tags: [] });
    const target = meta.type === 'category' ? byPost.get(postId)!.categories : byPost.get(postId)!.tags;
    const { post_id: _postId, ...clean } = meta;
    target.push(clean);
  }
  return rows.map((row) => {
    const rel = byPost.get(Number(row.id)) || { categories: [], tags: [] };
    return sanitizePostForResponse({ ...row, meta: row.meta || {}, categories: rel.categories, tags: rel.tags }, detail);
  });
}

async function listMetas(type: 'category' | 'tag', includeEmpty: boolean) {
  const where = includeEmpty ? 'type = $1' : 'type = $1 and count > 0';
  return many<Record<string, unknown>>(
    `select * from ${table('metas')} where ${where} order by order_num asc, count desc, name asc`,
    [type],
  );
}

async function listMetasPage(type: 'category' | 'tag', includeEmpty: boolean, sp: URLSearchParams) {
  const { page, perPage, offset } = pageParams(sp);
  const where = [includeEmpty ? 'type = $1' : 'type = $1 and count > 0'];
  const params: unknown[] = [type];
  const search = (sp.get('search') || sp.get('q') || '').trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(name ilike $${params.length} or slug ilike $${params.length} or description ilike $${params.length})`);
  }
  const whereSql = `where ${where.join(' and ')}`;
  const total = await one<{ count: string }>(`select count(*)::text as count from ${table('metas')} ${whereSql}`, params);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('metas')} ${whereSql}
     order by order_num asc, count desc, name asc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, perPage, offset],
  );
  return { rows, total: Number(total?.count || 0), page, perPage };
}

function wantsMetaPagination(sp: URLSearchParams) {
  return sp.has('page') || sp.has('per_page') || sp.has('limit') || sp.has('search') || sp.has('q');
}

async function genericList(name: string, sp: URLSearchParams, authed = false) {
  if (!readableTables.has(name)) throw new Error('invalid content table');
  const { page, perPage, offset } = pageParams(sp);
  const columns = await tableColumns(name);
  const where: string[] = [];
  const params: unknown[] = [];
  if (columns.has('status')) {
    const requested = sp.get('status');
    if (name === 'links') {
      if (authed && requested) {
        params.push(intParam(requested, 1));
        where.push(`status = $${params.length}`);
      } else if (!authed) {
        params.push(1);
        where.push(`status = $${params.length}`);
      }
    } else if (name === 'albums') {
      if (authed && requested) {
        params.push(requested);
        where.push(`status = $${params.length}`);
      } else if (!authed) {
        params.push('public');
        where.push(`status = $${params.length}`);
      }
    } else if (authed && requested) {
      params.push(requested);
      where.push(`status = $${params.length}`);
    } else if (!authed) {
      params.push('publish');
      where.push(`status = $${params.length}`);
    }
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const order = name === 'links'
    ? 'case when order_num > 0 then order_num else id end asc, id asc'
    : name === 'albums'
      ? 'sort_order asc, created_at desc'
    : 'created_at desc';
  const total = await one<{ count: string }>(`select count(*)::text as count from ${table(name)} ${whereSql}`, params);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table(name)} ${whereSql} order by ${order} limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, perPage, offset],
  );
  return { rows, total: Number(total?.count || 0), page, perPage };
}

async function genericGet(name: string, id: string, authed = false) {
  if (!readableTables.has(name)) throw new Error('invalid content table');
  if (name === 'albums') {
    const row = await one<Record<string, unknown>>(
      `select * from ${table(name)} where id::text = $1 or slug = $1`,
      [id],
    );
    if (!row) return null;
    if (!authed && row.status !== 'public') return null;
    return row;
  }
  const row = await one<Record<string, unknown>>(`select * from ${table(name)} where id = $1`, [id]);
  if (!row) return null;
  if (!authed && name === 'links') return Number(row.status || 0) === 1 ? row : null;
  if (!authed && row.status && row.status !== 'publish') return null;
  return row;
}

const protectedColumns = new Set(['id']);
const updateProtectedColumns = new Set(['id', 'created_at', 'author_id']);

function simpleSlug(input: unknown) {
  const base = String(input || '').trim().toLowerCase();
  const slug = base
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return slug || crypto.randomUUID().slice(0, 8);
}

async function tableColumns(name: string) {
  const rows = await many<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table(name)],
  );
  return new Set(rows.map((row) => row.column_name));
}

function rowsChanged(result: unknown) {
  if (result && typeof result === 'object' && 'count' in result) return Number((result as { count?: number }).count || 0);
  return 0;
}

async function execChanged(query: string, params: unknown[] = []) {
  return rowsChanged(await exec(query, params).catch(() => null));
}

async function genericCreate(name: string, body: Record<string, unknown>, userId = 0) {
  if (!writableTables.has(name)) throw new Error('invalid content table');
  const columns = await tableColumns(name);
  const now = nowUnix();
  const data: Record<string, unknown> = { ...body, created_at: body.created_at ?? now, updated_at: body.updated_at ?? now };
  if (name === 'moments') normalizeMomentCreateSource(data);
  if (columns.has('author_id') && !data.author_id) data.author_id = userId || 1;
  if (columns.has('slug') && !data.slug) data.slug = simpleSlug(data.title || data.name);
  const entries = Object.entries(data)
    .filter(([key]) => columns.has(key) && !protectedColumns.has(key));
  if (entries.length === 0) throw new Error('no writable columns');
  const names = entries.map(([key]) => key);
  const placeholders = names.map((_, idx) => `$${idx + 1}`);
  const values = entries.map(([key, value]) => (key === 'meta' ? normalizeJsonbValue(value) : value ?? null));
  const rows = await many<{ id: number }>(
    `insert into ${table(name)} (${names.join(', ')}) values (${placeholders.join(', ')}) returning id`,
    values,
  );
  const id = rows[0]?.id;
  if (id && contentTables.has(name)) {
    if (name === 'moments') await mergeMomentTagOption(data.mood);
    if (columns.has('cover_url')) void syncContentMedia(name, id, data.cover_url);
  }
  return id;
}

async function mirrorLinkRssSubscription(link: Record<string, unknown>) {
  const feedUrl = String(link.rss_url || '').trim();
  if (!feedUrl) return { rss_subscription_synced: false };
  const siteUrl = String(link.url || '').trim();
  if (!siteUrl) return { rss_subscription_synced: false };
  await exec(
    `insert into ${table('rss_subscriptions')} (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
     values (1,$1,$2,$3,$4,0,$5)
     on conflict (user_id, feed_url) do update set
       site_url = excluded.site_url,
       site_name = excluded.site_name,
       site_avatar = excluded.site_avatar`,
    [siteUrl, feedUrl, String(link.name || siteUrl), String(link.logo || ''), nowUnix()],
  );
  return { rss_subscription_synced: true };
}

async function deleteUnusedLinkRssSubscription(feedUrl: unknown) {
  const rssUrl = String(feedUrl || '').trim();
  if (!rssUrl) return { rss_subscription_deleted: 0, feed_items_deleted: 0 };
  const rows = await many<{ id: number }>(
    `select rs.id
     from ${table('rss_subscriptions')} rs
     where rs.user_id = 1
       and rs.feed_url = $1
       and not exists (
         select 1 from ${table('links')} l
         where coalesce(l.rss_url, '') = $1
       )
       and not exists (
         select 1 from ${table('followers')} f
         where f.user_id = rs.user_id
           and coalesce(f.source_site, '') = coalesce(rs.site_url, '')
       )`,
    [rssUrl],
  ).catch(() => []);
  const ids = rows.map((row) => Number(row.id)).filter(Boolean);
  if (ids.length === 0) return { rss_subscription_deleted: 0, feed_items_deleted: 0 };
  const feedItems = await execChanged(`delete from ${table('feed_items')} where subscription_id = any($1::int[])`, [ids]);
  const subscriptions = await execChanged(`delete from ${table('rss_subscriptions')} where id = any($1::int[])`, [ids]);
  return { rss_subscription_deleted: subscriptions, feed_items_deleted: feedItems };
}

async function syncLinkRssAfterUpdate(id: number, before: Record<string, unknown> | null, body: Record<string, unknown>) {
  const after = await one<Record<string, unknown>>(`select * from ${table('links')} where id = $1`, [id]).catch(() => null);
  if (!after) return { rss_subscription_synced: false, rss_subscription_deleted: 0, feed_items_deleted: 0 };
  const sync = await mirrorLinkRssSubscription(after);
  const oldFeed = String(before?.rss_url || '').trim();
  const newFeed = String(after.rss_url || body.rss_url || '').trim();
  const removed = oldFeed && oldFeed !== newFeed
    ? await deleteUnusedLinkRssSubscription(oldFeed)
    : { rss_subscription_deleted: 0, feed_items_deleted: 0 };
  return { ...sync, ...removed };
}

async function genericUpdate(name: string, id: number, body: Record<string, unknown>) {
  if (!writableTables.has(name)) throw new Error('invalid content table');
  const columns = await tableColumns(name);
  const entries = Object.entries({ ...body, updated_at: nowUnix() })
    .filter(([key]) => columns.has(key) && !updateProtectedColumns.has(key));
  if (entries.length === 0) return id;
  const sets = entries.map(([key], idx) => `${key} = $${idx + 1}`);
  const values = entries.map(([key, value]) => (key === 'meta' ? normalizeJsonbValue(value) : value ?? null));
  await exec(`update ${table(name)} set ${sets.join(', ')} where id = $${values.length + 1}`, [...values, id]);
  if (contentTables.has(name)) {
    if (name === 'moments') await mergeMomentTagOption(body.mood);
    if (columns.has('cover_url')) void syncContentMedia(name, id, body.cover_url);
  }
  return id;
}

function normalizePostBody(body: Record<string, unknown>, forCreate = false) {
  const next = { ...body };
  if (forCreate && !next.type) next.type = 'post';
  if (!next.slug && next.title) next.slug = simpleSlug(next.title);
  if (typeof next.content === 'string') {
    next.word_count = contentWordCount(next.content);
    if (!String(next.excerpt || '').trim()) next.excerpt = stripMarkdownExcerpt(next.content, 200);
  }
  if (String(next.excerpt || '').trim()) next.ai_summary = String(next.excerpt || '').trim();
  if (Object.prototype.hasOwnProperty.call(next, 'meta')) next.meta = normalizeJsonbValue(next.meta);
  if (forCreate && next.status === 'publish' && !next.published_at) {
    next.published_at = new Date().toISOString();
  }
  return next;
}

async function syncPostsSequence() {
  await exec(
    `select setval(pg_get_serial_sequence($1, 'id'), greatest((select coalesce(max(id), 1) from ${table('posts')} where id > 0), 1), true)`,
    [table('posts')],
  ).catch(() => {});
}

async function nextPostId(publicPost: boolean) {
  if (publicPost) {
    const row = await one<{ id: string }>(`select (coalesce(max(id), 0) + 1)::text as id from ${table('posts')} where id > 0`);
    return Number(row?.id || 1);
  }
  const row = await one<{ id: string }>(`select (coalesce(min(id), 0) - 1)::text as id from ${table('posts')} where id < 0`);
  return Number(row?.id || -1);
}

function postColumnEntries(columns: Set<string>, data: Record<string, unknown>, includeId = false) {
  const blocked = includeId ? new Set<string>() : protectedColumns;
  return Object.entries(data).filter(([key]) => columns.has(key) && !blocked.has(key));
}

async function createPostRecord(body: Record<string, unknown>, userId: number) {
  const columns = await tableColumns('posts');
  const now = nowUnix();
  const type = String(body.type || 'post');
  const status = String(body.status || 'draft');
  const publicPost = type === 'post' && status === 'publish';
  await exec(`select pg_advisory_xact_lock(hashtext($1))`, ['utterlog:post-id']).catch(() => {});
  const id = await nextPostId(publicPost);
  const data: Record<string, unknown> = {
    ...body,
    id,
    display_id: publicPost ? id : 0,
    type,
    status,
    author_id: body.author_id || userId || 1,
    created_at: body.created_at ?? now,
    updated_at: body.updated_at ?? now,
  };
  const entries = postColumnEntries(columns, data, true);
  const names = entries.map(([key]) => key);
  const placeholders = names.map((_, idx) => `$${idx + 1}`);
  const values = entries.map(([key, value]) => (key === 'meta' ? normalizeJsonbValue(value) : value ?? null));
  await exec(`insert into ${table('posts')} (${names.join(', ')}) values (${placeholders.join(', ')})`, values);
  if (publicPost) await syncPostsSequence();
  return id;
}

async function updatePostRecord(postId: number, body: Record<string, unknown>) {
  const existing = await one<Record<string, unknown>>(`select * from ${table('posts')} where id = $1`, [postId]);
  if (!existing) throw new Error('post not found');
  const finalType = String(body.type || existing.type || 'post');
  const finalStatus = String(body.status || existing.status || 'draft');
  if (existing.status === 'draft' && finalStatus === 'publish' && !body.published_at && !existing.published_at) {
    body.published_at = new Date().toISOString();
  }
  if (postId < 0 && finalType === 'post' && finalStatus === 'publish') {
    const columns = await tableColumns('posts');
    await exec(`select pg_advisory_xact_lock(hashtext($1))`, ['utterlog:post-id']).catch(() => {});
    const newId = await nextPostId(true);
    await exec(`update ${table('posts')} set slug = $1 where id = $2`, [`__draft_released_${Math.abs(postId)}_${Date.now()}`, postId]).catch(() => {});
    const data: Record<string, unknown> = {
      ...existing,
      ...body,
      id: newId,
      display_id: newId,
      type: finalType,
      status: finalStatus,
      updated_at: nowUnix(),
    };
    const entries = postColumnEntries(columns, data, true);
    const names = entries.map(([key]) => key);
    const placeholders = names.map((_, idx) => `$${idx + 1}`);
    const values = entries.map(([key, value]) => (key === 'meta' ? normalizeJsonbValue(value) : value ?? null));
    await exec(`insert into ${table('posts')} (${names.join(', ')}) values (${placeholders.join(', ')})`, values);
    for (const relTable of ['relationships', 'post_footprints', 'post_meta', 'annotations', 'comments']) {
      await exec(`update ${table(relTable)} set post_id = $1 where post_id = $2`, [newId, postId]).catch(() => {});
    }
    await exec(`delete from ${table('posts')} where id = $1`, [postId]);
    await syncPostsSequence();
    return newId;
  }
  const id = await genericUpdate('posts', postId, { ...body, type: finalType, status: finalStatus });
  if (postId > 0 && finalType === 'post' && finalStatus === 'publish') {
    await exec(`update ${table('posts')} set display_id = id where id = $1 and coalesce(display_id,0) = 0`, [postId]).catch(() => {});
  }
  return id;
}

async function ensureMeta(type: 'category' | 'tag', name: string) {
  const cleanName = name.trim();
  if (!cleanName) return 0;
  const slug = simpleSlug(cleanName);
  const now = nowUnix();
  const rows = await many<{ id: number }>(
    `insert into ${table('metas')} (name, slug, type, count, created_at, updated_at)
     values ($1,$2,$3,0,$4,$4)
     on conflict (slug, type) do update set name = excluded.name, updated_at = excluded.updated_at
     returning id`,
    [cleanName, slug, type, now],
  );
  return rows[0]?.id || 0;
}

async function defaultCategoryId() {
  const slug = String(await optionValue('default_category', '') || '').trim();
  if (slug) {
    const configured = await one<{ id: number }>(
      `select id from ${table('metas')} where slug = $1 and type = 'category' limit 1`,
      [slug],
    ).catch(() => null);
    if (configured?.id) return Number(configured.id);
  }
  const existing = await one<{ id: number }>(
    `select id from ${table('metas')} where type = 'category' order by id asc limit 1`,
  ).catch(() => null);
  if (existing?.id) return Number(existing.id);
  return ensureMeta('category', '日常');
}

async function refreshMetaCounts() {
  await exec(
    `update ${table('metas')} m
     set count = coalesce((
       select count(*) from ${table('relationships')} r where r.meta_id = m.id
     ), 0)
     where m.type in ('category', 'tag')`,
  ).catch(() => {});
}

async function savePostRelationships(postId: number, body: Record<string, unknown>) {
  const hasCategoryInput = Object.prototype.hasOwnProperty.call(body, 'category_ids');
  const hasTagInput = Object.prototype.hasOwnProperty.call(body, 'tag_names');
  if (!hasCategoryInput && !hasTagInput) return;
  const existing = await many<{ id: number; type: string; name: string }>(
    `select m.id, m.type, m.name
     from ${table('relationships')} r
     join ${table('metas')} m on m.id = r.meta_id
     where r.post_id = $1 and m.type in ('category', 'tag')`,
    [postId],
  ).catch(() => []);
  await exec(
    `delete from ${table('relationships')}
     where post_id = $1 and meta_id in (select id from ${table('metas')} where type in ('category', 'tag'))`,
    [postId],
  );
  const metaIds = new Set<number>();
  if (hasCategoryInput && Array.isArray(body.category_ids)) {
    for (const raw of body.category_ids) {
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0) metaIds.add(id);
    }
  } else if (!hasCategoryInput) {
    for (const meta of existing) {
      if (meta.type === 'category') metaIds.add(Number(meta.id));
    }
  }
  const hasCategory = existing.some((meta) => meta.type === 'category' && metaIds.has(Number(meta.id)))
    || (hasCategoryInput && Array.isArray(body.category_ids) && body.category_ids.some((raw) => Number(raw) > 0));
  if (!hasCategory) {
    const fallback = await defaultCategoryId();
    if (fallback) metaIds.add(fallback);
  }
  if (hasTagInput && Array.isArray(body.tag_names)) {
    for (const raw of body.tag_names) {
      const id = await ensureMeta('tag', String(raw || ''));
      if (id) metaIds.add(id);
    }
  } else if (!hasTagInput) {
    for (const meta of existing) {
      if (meta.type === 'tag') metaIds.add(Number(meta.id));
    }
  }
  for (const metaId of metaIds) {
    await exec(
      `insert into ${table('relationships')} (post_id, meta_id, created_at)
       values ($1,$2,$3)
       on conflict do nothing`,
      [postId, metaId, nowUnix()],
    ).catch(() => {});
  }
  await refreshMetaCounts();
}

async function savePostMeta(postId: number, body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body, 'meta')) return;
  await exec(
    `update ${table('posts')} set meta = $1::jsonb, updated_at = $2 where id = $3`,
    [normalizeJsonbValue(body.meta), nowUnix(), postId],
  );
}

async function savePostEpisodes(postId: number, body: Record<string, unknown>) {
  if (!Array.isArray(body.episodes)) return;
  const now = nowUnix();
  await exec(`delete from ${table('post_episodes')} where post_id = $1`, [postId]);
  let idx = 0;
  for (const raw of body.episodes) {
    if (!raw || typeof raw !== 'object') continue;
    const ep = raw as Record<string, unknown>;
    idx += 1;
    await exec(
      `insert into ${table('post_episodes')}
       (post_id, episode_no, title, video_url, embed_url, platform, alt_sources, duration, cover_url, sort_order, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$11)`,
      [
        postId,
        Number(ep.episode_no || idx),
        String(ep.title || ''),
        String(ep.video_url || ''),
        String(ep.embed_url || ''),
        String(ep.platform || ''),
        JSON.stringify(Array.isArray(ep.alt_sources) ? ep.alt_sources : []),
        Number(ep.duration || 0),
        String(ep.cover_url || ''),
        Number(ep.sort_order ?? idx),
        now,
      ],
    );
  }
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseFootprintVisitedAt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const parsed = Date.parse(text.includes('T') ? text : `${text}T00:00:00`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

async function upsertFootprintPlace(input: Record<string, unknown>) {
  const countryName = String(input.country_name || '').trim();
  const countryCode = String(input.country_code || '').trim().toUpperCase();
  const cityName = String(input.city_name || '').trim();
  if (!countryName && !countryCode && !cityName) return 0;
  const latitude = numberOrNull(input.latitude);
  const longitude = numberOrNull(input.longitude);
  const coverUrl = String(input.cover_url || '').trim();
  const existing = await one<{ id: number }>(
    `select id from ${table('footprint_places')}
     where lower(coalesce(country_code,'')) = lower($1)
       and lower(coalesce(country_name,'')) = lower($2)
       and lower(coalesce(city_name,'')) = lower($3)
     limit 1`,
    [countryCode, countryName, cityName],
  );
  const now = nowUnix();
  if (existing?.id) {
    await exec(
      `update ${table('footprint_places')} set country_name=$1, country_code=$2, city_name=$3,
       latitude=coalesce($4, latitude), longitude=coalesce($5, longitude),
       cover_url=case when $6 != '' then $6 else cover_url end, updated_at=$7 where id=$8`,
      [countryName, countryCode, cityName, latitude, longitude, coverUrl, now, existing.id],
    );
    return existing.id;
  }
  const inserted = await one<{ id: number }>(
    `insert into ${table('footprint_places')}
     (country_name, country_code, city_name, latitude, longitude, cover_url, visit_count, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,0,$7,$7) returning id`,
    [countryName, countryCode, cityName, latitude, longitude, coverUrl, now],
  );
  return inserted?.id || 0;
}

async function upsertFootprintRoute(input: unknown) {
  const name = String(input || '').trim();
  if (!name) return 0;
  const existing = await one<{ id: number }>(`select id from ${table('footprint_routes')} where lower(name)=lower($1) limit 1`, [name]);
  if (existing?.id) return existing.id;
  const inserted = await one<{ id: number }>(
    `insert into ${table('footprint_routes')} (name, slug, description, sort_order, created_at, updated_at)
     values ($1,$2,'',0,$3,$3) returning id`,
    [name, simpleSlug(name), nowUnix()],
  );
  return inserted?.id || 0;
}

async function refreshFootprintVisitCount(placeId: number) {
  if (!placeId) return;
  await exec(
    `update ${table('footprint_places')} set visit_count = (
       select count(distinct post_id) from ${table('post_footprints')} where place_id = $1
     ), updated_at = $2 where id = $1`,
    [placeId, nowUnix()],
  ).catch(() => {});
}

async function savePostFootprints(postId: number, body: Record<string, unknown>) {
  if (!Array.isArray(body.footprints)) return;
  const oldPlaces = await many<{ place_id: number }>(
    `select coalesce(place_id,0) as place_id from ${table('post_footprints')} where post_id = $1`,
    [postId],
  ).catch(() => []);
  await exec(`delete from ${table('post_footprints')} where post_id = $1`, [postId]);
  const touched = new Set<number>(oldPlaces.map((row) => Number(row.place_id || 0)).filter(Boolean));
  const now = nowUnix();
  for (const raw of body.footprints) {
    if (!raw || typeof raw !== 'object') continue;
    const input = raw as Record<string, unknown>;
    let placeId = Number(input.place_id || 0);
    if (!placeId) placeId = await upsertFootprintPlace(input);
    let routeId = Number(input.route_id || 0);
    if (!routeId) routeId = await upsertFootprintRoute(input.route_name);
    if (placeId) touched.add(placeId);
    await exec(
      `insert into ${table('post_footprints')} (post_id, place_id, route_id, visited_at, route_order, keywords, note, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [
        postId,
        placeId || null,
        routeId || 0,
        parseFootprintVisitedAt(input.visited_at),
        Number(input.route_order || 0),
        String(input.keywords || '').trim(),
        String(input.note || '').trim(),
        now,
      ],
    );
  }
  for (const placeId of touched) await refreshFootprintVisitCount(placeId);
}

async function postFootprints(postId: number) {
  const rows = await many<Record<string, unknown>>(
    `select pf.id, pf.post_id, coalesce(pf.place_id,0) as place_id, pf.route_id, pf.visited_at, pf.route_order,
            coalesce(pf.keywords,'') as keywords, coalesce(pf.note,'') as note,
            pf.created_at, pf.updated_at,
            coalesce(fp.country_name,'') as country_name,
            coalesce(fp.country_code,'') as country_code,
            coalesce(fp.city_name,'') as city_name,
            fp.latitude, fp.longitude,
            coalesce(fp.cover_url,'') as cover_url,
            coalesce(fp.visit_count,0) as visit_count,
            coalesce(fr.name,'') as route_name,
            coalesce(fr.slug,'') as route_slug
     from ${table('post_footprints')} pf
     left join ${table('footprint_places')} fp on fp.id = pf.place_id
     left join ${table('footprint_routes')} fr on fr.id = pf.route_id
     where pf.post_id = $1
     order by coalesce(nullif(pf.route_order, 0), 2147483647), pf.visited_at desc, pf.id asc`,
    [postId],
  );
  return rows.map((row) => ({
    id: row.id,
    post_id: row.post_id,
    place_id: row.place_id,
    route_id: row.route_id,
    visited_at: row.visited_at,
    route_order: row.route_order,
    keywords: row.keywords,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    place: Number(row.place_id || 0) > 0 ? {
      id: row.place_id,
      country_name: row.country_name,
      country_code: row.country_code,
      city_name: row.city_name,
      latitude: row.latitude,
      longitude: row.longitude,
      cover_url: row.cover_url,
      visit_count: row.visit_count,
    } : undefined,
    route: Number(row.route_id || 0) > 0 ? {
      id: row.route_id,
      name: row.route_name,
      slug: row.route_slug,
    } : undefined,
  }));
}

function footprintCountriesFrom(footprints: Record<string, any>[]) {
  const seen = new Set<string>();
  const countries: { code: string; name: string }[] = [];
  for (const footprint of footprints) {
    const place = footprint.place || {};
    const code = String(place.country_code || '').trim().toUpperCase();
    const name = String(place.country_name || '').trim();
    const key = code || name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    countries.push({ code, name });
  }
  return countries;
}

async function savePostExtras(postId: number, body: Record<string, unknown>) {
  await savePostRelationships(postId, body);
  await savePostMeta(postId, body);
  await savePostEpisodes(postId, body);
  await savePostFootprints(postId, body);
}

async function sendPublishNotificationIfNeeded(postId: number, wasPublished: boolean) {
  if (wasPublished) return;
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  const site = siteOrigin(opts);
  const post = await one<Record<string, unknown>>(
    `select p.*,
            coalesce((
              select m.slug
              from ${table('relationships')} r
              join ${table('metas')} m on m.id = r.meta_id
              where r.post_id = p.id and m.type = 'category'
              order by m.id asc
              limit 1
            ), '') as category_slug
     from ${table('posts')} p
     where p.id = $1`,
    [postId],
  ).catch(() => null);
  if (!post || post.status !== 'publish' || (post.type && post.type !== 'post')) return;
  const path = buildPostPath(post, opts.permalink_structure || '/posts/%postname%');
  const url = site ? `${site}${path}` : path;
  void sendPostPublishedTelegram({ title: String(post.title || '未命名文章'), url });
}

export async function robotsTxtResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  const site = siteOrigin(opts);
  const aiAllowed = boolOptionValue(opts.ai_crawl_allowed, true);
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /admin/', 'Disallow: /api/', ''];
  for (const agent of aiBotUserAgents) {
    lines.push(`User-agent: ${agent}`, `${aiAllowed ? 'Allow' : 'Disallow'}: /`, '');
  }
  if (site) {
    lines.push(`Sitemap: ${site}/sitemap.xml`);
    if (boolOptionValue(opts.llms_txt_enabled, true)) lines.push(`# llms.txt available at ${site}/llms.txt`);
  }
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

export async function sitemapXmlResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  const site = siteOrigin(opts);
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' };
  if (!site) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>', { headers });
  }
  const now = new Date().toISOString();
  const items: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [
    { loc: `${site}/`, lastmod: now, changefreq: 'daily', priority: '1.0' },
  ];
  for (const path of ['/about', '/archives', '/films', '/moments', '/footprints', '/coding', '/links', '/albums', '/music', '/books', '/games', '/movies', '/goods', '/feeds']) {
    items.push({ loc: `${site}${path}`, lastmod: now, changefreq: 'weekly', priority: '0.6' });
  }
  const posts = await many<Record<string, unknown>>(
    `select p.id, p.slug, p.display_id, p.type, p.created_at, p.updated_at, p.published_at,
            coalesce((
              select m.slug from ${table('relationships')} r
              join ${table('metas')} m on m.id = r.meta_id and m.type = 'category'
              where r.post_id = p.id order by m.id asc limit 1
            ), '') as category_slug
     from ${table('posts')} p
     where p.status = 'publish'
     order by coalesce(p.published_at, to_timestamp(p.created_at)) desc
     limit 5000`,
  ).catch(() => []);
  const permalink = opts.permalink_structure || '/posts/%postname%';
  for (const post of posts) {
    const path = String(post.type || '') === 'video'
      ? `/films/${encodeURIComponent(String(post.slug || post.display_id || post.id || ''))}`
      : buildPostPath(post, permalink);
    items.push({
      loc: `${site}${path}`,
      lastmod: postDateParts({ published_at: post.updated_at || post.published_at || post.created_at }).iso,
      changefreq: 'monthly',
      priority: '0.8',
    });
  }
  const metas = await many<Record<string, unknown>>(
    `select slug, type, updated_at, created_at
     from ${table('metas')}
     where type in ('category','tag') and coalesce(slug,'') <> ''`,
  ).catch(() => []);
  for (const meta of metas) {
    const base = meta.type === 'category' ? '/categories/' : '/tags/';
    items.push({
      loc: `${site}${base}${encodeURIComponent(String(meta.slug || ''))}`,
      lastmod: postDateParts({ published_at: meta.updated_at || meta.created_at }).iso,
      changefreq: 'weekly',
      priority: meta.type === 'category' ? '0.5' : '0.4',
    });
  }
  const urls = items.map((item) => (
    `  <url><loc>${xmlEscape(item.loc)}</loc><lastmod>${item.lastmod}</lastmod><changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`
  )).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, { headers });
}

export async function llmsTxtResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  if (!boolOptionValue(opts.llms_txt_enabled, true)) {
    return new Response('llms.txt is disabled in this site SEO settings', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const site = siteOrigin(opts);
  const title = String(opts.site_title || 'Utterlog').trim() || 'Utterlog';
  const tagline = String(opts.seo_default_description || opts.site_description || '').trim();
  const posts = await many<{ title: string; slug: string; excerpt: string; created_at: number }>(
    `select title, slug, coalesce(excerpt,'') as excerpt, created_at
     from ${table('posts')}
     where status = 'publish' and type = 'post'
     order by coalesce(published_at, to_timestamp(created_at)) desc
     limit 200`,
  ).catch(() => []);
  const lines = [`# ${title}`, ''];
  if (tagline) lines.push(`> ${oneLine(tagline)}`, '');
  if (site) lines.push(`Site: ${site}`, '');
  if (posts.length) {
    lines.push('## Posts', '');
    for (const post of posts) {
      const url = `${site || ''}/posts/${encodeURIComponent(post.slug || '')}`;
      const summary = oneLine(post.excerpt || post.title || '');
      lines.push(summary && summary !== post.title ? `- [${post.title}](${url}): ${summary}` : `- [${post.title}](${url})`);
    }
  }
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

export async function llmsFullTxtResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  if (String(opts.llms_full_enabled || '').trim().toLowerCase() !== 'true') {
    return new Response('llms-full.txt is disabled in this site SEO settings', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const site = siteOrigin(opts);
  const title = String(opts.site_title || 'Utterlog').trim() || 'Utterlog';
  const tagline = String(opts.seo_default_description || opts.site_description || '').trim();
  const posts = await many<{ title: string; slug: string; excerpt: string; content: string; published_at: unknown; created_at: unknown }>(
    `select title, slug, excerpt, content, published_at, created_at
     from ${table('posts')}
     where status = 'publish' and type = 'post'
     order by coalesce(published_at, to_timestamp(created_at)) desc
     limit 500`,
  ).catch(() => []);
  const body = posts.map((post) => {
    const url = `${site}/${encodeURIComponent(String(post.slug || ''))}`;
    const excerpt = String(post.excerpt || '').trim();
    return [
      `## ${post.title}`,
      `URL: ${url}`,
      `Published: ${postDateParts(post).iso}`,
      excerpt ? `Summary: ${excerpt}` : '',
      String(post.content || '').trim(),
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');
  const header = [`# ${title}`, tagline ? `\n> ${oneLine(tagline)}\n` : '', site ? `\nSite: ${site}\nGenerated: ${new Date().toISOString()}\n` : ''].join('');
  return new Response(`${header}\n${body}\n`, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
