import type { Hono } from 'hono';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statfsSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { auth, currentUserId, optionalAuth } from '../auth/middleware';
import { config, table } from '../config';
import { sql } from '../db/client';
import { exec, intParam, many, nowUnix, one, pageParams } from '../db/helpers';
import { badRequest, notFound, ok, paginate } from '../http/response';
import { nonEmptyString, parseJson } from '../http/validation';
import { ephemeral } from '../store/ephemeral';
import { runtimePaths } from '../paths';
import { normalizeBlogTheme } from '../blog-themes';
import { resolveThemePreviewUrl } from '../theme-assets';
import { sendConfiguredEmail } from '../email';
import { aiAuditFailAction, auditCommentContent, enqueueAiCommentReply } from '../ai/comments';
import { sendCommentModerationTelegram, sendPostPublishedTelegram } from '../telegram';
import { assertPublicHttpUrl } from '../http/public-url';
import { lookupGeoIp, normalizeGeoProvider } from '../geoip';
import { appVersion, getCpuPercent, getHostUptimeLabel, getHostUptimeSeconds } from '../system/metrics';
import { getHostOsInfo, parsePostgresVersion, resolveHostPublicIp } from '../system/host';
import { isBotUa } from '../bot-detect';
import {
  allowedMediaExts,
  brandingExts,
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
import { buildFaviconIco, clearBrandingFaviconFiles, resolveFaviconUrl } from '../media/favicon';

const contentTables = new Set(['moments', 'music', 'movies', 'books', 'games', 'videos', 'goods', 'links', 'playlists']);
const writableTables = new Set([...contentTables, 'posts', 'comments', 'media', 'albums', 'notifications']);
const readableTables = new Set([...writableTables]);
const sensitiveSuffixes = ['_api_key', '_secret', '_token', '_pass', '_password', '_access_key', '_secret_key'];
const publicOptionAllowlist = new Set(['mapbox_access_token', 'footprint_mapbox_token', 'mapbox_api_url']);

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

function isSensitiveOption(name: string) {
  const key = name.trim().toLowerCase();
  if (!key || publicOptionAllowlist.has(key)) return false;
  if (['smtp_pass', 's3_access_key', 's3_secret_key'].includes(key)) return true;
  return sensitiveSuffixes.some((suffix) => key.endsWith(suffix));
}

async function isAdmin(userId: number) {
  if (!userId) return false;
  const row = await one<{ role: string }>(`select role from ${table('users')} where id = $1`, [userId]);
  return row?.role?.toLowerCase() === 'admin';
}

async function optionMap(includeSensitive: boolean) {
  const rows = await many<{ name: string; value: string }>(`select name, value from ${table('options')} order by name asc`);
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (!includeSensitive && isSensitiveOption(row.name)) continue;
    result[row.name] = row.value;
  }
  result.site_timezone_effective = result.site_timezone || 'UTC';
  if (result.site_favicon) result.site_favicon = resolveFaviconUrl(result.site_favicon);
  return result;
}

async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
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

async function activeEmbeddingProvider() {
  return one<Record<string, unknown>>(
    `select * from ${table('ai_providers')} where type = 'embedding' and is_active = true order by is_default desc, sort_order asc, id asc limit 1`,
  ).catch(() => null);
}

async function logAiEvent(provider: Record<string, unknown> | null, action: string, status: string, message: string, metadata: Record<string, unknown> = {}) {
  const usage = ((metadata.usage || metadata.tokens) && typeof (metadata.usage || metadata.tokens) === 'object')
    ? (metadata.usage || metadata.tokens) as Record<string, unknown>
    : {};
  const tokenValue = (value: unknown) => {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  };
  const promptTokens = tokenValue(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = tokenValue(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = tokenValue(usage.total_tokens) || promptTokens + completionTokens;
  await exec(
    `insert into ${table('ai_logs')} (user_id, provider, model, action, prompt_tokens, completion_tokens, total_tokens, status, message, metadata, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      null,
      provider?.slug || provider?.name || '',
      provider?.model || '',
      action,
      promptTokens,
      completionTokens,
      totalTokens,
      status,
      message.slice(0, 1000),
      JSON.stringify(metadata),
      nowUnix(),
    ],
  ).catch(() => {});
}

async function searchEmbedding(text: string) {
  const provider = await activeEmbeddingProvider();
  if (!provider) return null;
  const endpoint = String(provider.endpoint || '').trim();
  const model = String(provider.model || '').trim();
  const apiKey = String(provider.api_key || '').trim();
  if (!endpoint || !model || !apiKey) return null;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(Math.max(10, Number(provider.timeout || 30)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) {
    const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
    await logAiEvent(provider, 'search-embedding', 'error', String(message));
    return null;
  }
  const embedding = payload.data?.[0]?.embedding || payload.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) return null;
  await logAiEvent(provider, 'search-embedding', 'success', `embedding:${embedding.length}`, { tokens: payload.usage || {} });
  const values = embedding.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value));
  return values.length ? `[${values.join(',')}]` : null;
}

async function saveOption(name: string, value: string) {
  const now = nowUnix();
  await exec(
    `insert into ${table('options')} (name, value, created_at, updated_at)
     values ($1,$2,$3,$3)
     on conflict (name) do update set value = $2, updated_at = $3`,
    [name, value, now],
  );
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

async function commentReplyUnsubscribeSecret() {
  let secret = (await optionValue('unsubscribe_secret', '')).trim();
  if (!secret) {
    secret = createHash('sha256').update(randomUUID()).digest('hex');
    await saveOption('unsubscribe_secret', secret);
  }
  return secret;
}

async function commentReplyUnsubscribeUrl(siteUrl: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  const enc = Buffer.from(normalized).toString('base64url');
  const sig = createHmac('sha256', await commentReplyUnsubscribeSecret()).update(`comment_reply:${normalized}`).digest('base64url').slice(0, 22);
  return `${siteUrl.replace(/\/+$/, '')}/api/v1/unsubscribe/comment-reply?e=${enc}&t=${sig}`;
}

async function isCommentReplyOptedOut(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  try {
    const optouts = JSON.parse(await optionValue('comment_reply_optouts_v1', '{}')) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(optouts, normalized);
  } catch {
    return false;
  }
}

async function captchaMode() {
  const mode = (await optionValue('comment_captcha_mode', '')).trim();
  if (mode === 'pow' || mode === 'image' || mode === 'off') return mode;
  const legacy = (await optionValue('comment_captcha_enabled', '1')).trim().toLowerCase();
  return legacy === '0' || legacy === 'false' ? 'off' : 'pow';
}

async function captchaDifficulty() {
  const raw = Number.parseInt(await optionValue('comment_captcha_difficulty', '4'), 10);
  if (!Number.isFinite(raw)) return 4;
  return Math.min(6, Math.max(1, raw));
}

function randomCaptchaCode(length = 4) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function svgEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function captchaSvgDataUrl(code: string) {
  const dots = Array.from({ length: 70 }, () => {
    const x = Math.floor(Math.random() * 120);
    const y = Math.floor(Math.random() * 40);
    const opacity = (0.12 + Math.random() * 0.28).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="1" fill="#334155" opacity="${opacity}" />`;
  }).join('');
  const lines = Array.from({ length: 3 }, () => {
    const x1 = Math.floor(Math.random() * 120);
    const y1 = Math.floor(Math.random() * 40);
    const x2 = Math.floor(Math.random() * 120);
    const y2 = Math.floor(Math.random() * 40);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1" opacity="0.55" />`;
  }).join('');
  const letters = code.split('').map((ch, idx) => {
    const x = 12 + idx * 26 + Math.floor(Math.random() * 4);
    const y = 28 + Math.floor(Math.random() * 5);
    const rotate = -12 + Math.floor(Math.random() * 25);
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})">${svgEscape(ch)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
    <rect width="120" height="40" fill="#f8fafc"/>
    ${dots}${lines}
    <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="24" font-weight="700" fill="#323278">${letters}</g>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function verifyPowCaptcha(challenge: unknown, nonce: unknown) {
  const id = String(challenge || '').trim();
  const value = String(nonce || '').trim();
  if (!id || !value) return false;
  const stored = await ephemeral.get(`captcha:${id}`);
  if (!stored) return false;
  const [difficultyText, expiresText] = stored.split(':');
  const difficulty = Number.parseInt(difficultyText || '', 10);
  const expires = Number.parseInt(expiresText || '', 10);
  if (!Number.isFinite(difficulty) || !Number.isFinite(expires) || nowUnix() > expires) {
    await ephemeral.del(`captcha:${id}`);
    return false;
  }
  const hash = createHash('sha256').update(id + value).digest('hex');
  const valid = hash.startsWith('0'.repeat(difficulty));
  if (valid) await ephemeral.del(`captcha:${id}`);
  return valid;
}

async function verifyImageCaptcha(id: unknown, code: unknown) {
  const key = String(id || '').trim();
  const input = String(code || '').trim().toLowerCase();
  if (!key || !input) return false;
  const expected = await ephemeral.get(`captcha:img:${key}`);
  if (!expected) return false;
  const valid = input === expected;
  if (valid) await ephemeral.del(`captcha:img:${key}`);
  return valid;
}

async function verifyCommentCaptcha(body: Record<string, unknown>) {
  const mode = await captchaMode();
  if (mode === 'off') return true;
  if (mode === 'image') return verifyImageCaptcha(body.captcha_id, body.captcha_code);
  return verifyPowCaptcha(body.captcha_challenge, body.captcha_nonce);
}

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

const customLocaleDir = 'locales';

function localeFiles() {
  const files = new Set<string>();
  for (const dir of [runtimePaths.builtinLocaleDir, customLocaleDir]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json')) files.add(file.replace(/\.json$/, ''));
    }
  }
  return [...files].sort();
}

function readLocale(locale: string) {
  const builtinPath = join(runtimePaths.builtinLocaleDir, `${locale}.json`);
  const customPath = join(customLocaleDir, `${locale}.json`);
  let data: any = null;
  if (existsSync(builtinPath)) data = JSON.parse(readFileSync(builtinPath, 'utf8'));
  if (existsSync(customPath)) {
    const custom = JSON.parse(readFileSync(customPath, 'utf8'));
    data = data ? {
      ...data,
      ...custom,
      messages: { ...(data.messages || {}), ...(custom.messages || {}) },
    } : custom;
  }
  return data;
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

function packageVersion(pkg: string) {
  const envKey = `${pkg.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_VERSION`;
  const envVersion = process.env[envKey];
  if (envVersion) return envVersion;
  for (const base of [process.cwd(), join(process.cwd(), 'app', 'web')]) {
    try {
      const resolved = Bun.resolveSync(`${pkg}/package.json`, base);
      const parsed = JSON.parse(readFileSync(resolved, 'utf8'));
      if (parsed.name === pkg && parsed.version) return String(parsed.version);
    } catch {
      // Try path candidates.
    }
  }
  const candidates = [
    join('node_modules', pkg, 'package.json'),
    join('node_modules', '.bun', `${pkg}@`, 'node_modules', pkg, 'package.json'),
    join('app', 'web', 'node_modules', pkg, 'package.json'),
    join('app', 'web', '.next', 'diagnostics', 'framework.json'),
    join('app', 'web', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate.includes(`${pkg}@`)) continue;
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      if (pkg === 'next' && parsed.name === 'Next.js' && parsed.version) return String(parsed.version);
      if (candidate.endsWith('package.json') && pkg === 'next' && parsed.name && parsed.name !== 'utterlog-web' && parsed.name !== 'next') continue;
      if (pkg === 'next' && parsed.name === 'utterlog-web') continue;
      return String(parsed.version || '');
    } catch {
      // Try next candidate.
    }
  }
  return '';
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
  return c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1';
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

async function validPassportToken(token: string) {
  const value = token.trim();
  if (!value) return false;
  const res = await fetch('https://id.utterlog.com/api/v1/passport/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: value }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res?.ok) return false;
  const payload = await res.json().catch(() => ({})) as Record<string, any>;
  return Boolean(payload?.success && payload?.data?.valid && payload?.data?.utterlog_id);
}

async function isSpamComment(content: string, email: string, url: string, ip: string) {
  const lower = content.toLowerCase();
  const linkCount = (lower.match(/https?:\/\//g) || []).length;
  if (linkCount > 2) return true;
  const spamWords = [
    'casino', 'poker', 'viagra', 'cialis', 'lottery', 'free money',
    'buy now', 'click here', 'subscribe', 'earn money', 'make money',
    'adult', 'xxx', 'porn', 'sex', '药', '赌博', '彩票', '代开发票',
    '刷单', '兼职日赚', '加微信', '加qq', '代孕',
  ];
  if (spamWords.some((word) => lower.includes(word))) return true;
  const emailLower = email.toLowerCase();
  if (['tempmail.', 'guerrillamail.', 'throwaway.', 'yopmail.', 'sharklasers.'].some((domain) => emailLower.includes(domain))) return true;
  if (/(.)\1{9,}/u.test(content)) return true;
  const recent = await one<{ count: string }>(
    `select count(*)::text as count from ${table('comments')} where author_ip = $1 and created_at > $2`,
    [ip, nowUnix() - 600],
  ).catch(() => null);
  return Number(recent?.count || 0) >= 5;
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

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePermalinkPath(path: string, template: string) {
  const url = (path || '').split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  const tpl = (template || '/posts/%postname%').replace(/\/+$/, '') || '/';
  const tokenRe = /%(postname|post_id|display_id|year|month|day|category)%/g;
  const tokens: string[] = [];
  let source = '^';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(tpl)) !== null) {
    source += escapeRegex(tpl.slice(last, match.index));
    tokens.push(match[1]);
    if (match[1] === 'postname' || match[1] === 'category') source += '([^/]+)';
    else if (match[1] === 'year') source += '(\\d{4})';
    else if (match[1] === 'month' || match[1] === 'day') source += '(\\d{2})';
    else source += '(\\d+)';
    last = match.index + match[0].length;
  }
  source += escapeRegex(tpl.slice(last));
  source += '$';
  const result = url.match(new RegExp(source));
  if (!result) return null;
  const captures: Record<string, string> = {};
  tokens.forEach((token, index) => {
    try {
      captures[token] = decodeURIComponent(result[index + 1] || '');
    } catch {
      captures[token] = result[index + 1] || '';
    }
  });
  if (captures.display_id) return { displayId: Number(captures.display_id) || 0 };
  if (captures.post_id) return { id: Number(captures.post_id) || 0 };
  if (captures.postname) return { slug: captures.postname };
  return null;
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

async function saveMeta(type: 'category' | 'tag', body: Record<string, unknown>, id?: number) {
  const name = String(body.name || '').trim();
  const slug = String(body.slug || name).trim();
  const now = nowUnix();
  if (!id) {
    const rows = await many<{ id: number }>(
      `insert into ${table('metas')} (name, slug, type, icon, description, parent_id, count, seo_keywords, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,0,$7,$8,$8) returning id`,
      [name, slug, type, body.icon || '', body.description || '', body.parent_id || 0, body.seo_keywords || '', now],
    );
    return rows[0]?.id;
  }
  await exec(
    `update ${table('metas')} set
      name = coalesce(nullif($1,''), name),
      slug = coalesce(nullif($2,''), slug),
      icon = $3,
      description = $4,
      parent_id = $5,
      seo_keywords = $6,
      updated_at = $7
     where id = $8 and type = $9`,
    [name, slug, body.icon || '', body.description || '', body.parent_id || 0, body.seo_keywords || '', now, id, type],
  );
  return id;
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

const musicPlatforms = new Set(['netease', 'tencent', 'kugou', 'kuwo']);
const musicAssets = new Set(['cover', 'stream', 'lyric']);

function musicPlatform(value: string) {
  const platform = value.trim().toLowerCase();
  if (platform === 'qq') return 'tencent';
  return musicPlatforms.has(platform) ? platform : '';
}

function musicId(value: string) {
  const id = value.trim();
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

async function metingFetch(platform: string, path: string, init: RequestInit = {}) {
  return fetch(`https://meting.yite.net/api/v1/${platform}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': 'Utterlog-Bun/1.0',
      ...(init.headers || {}),
    },
  });
}

export function registerContentRoutes(app: Hono) {
  app.get('/robots.txt', async (c) => {
    const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
    const site = siteOrigin(opts);
    const aiAllowed = boolOptionValue(opts.ai_crawl_allowed, true);
    const lines = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin/',
      'Disallow: /api/',
      '',
    ];
    for (const agent of aiBotUserAgents) {
      lines.push(`User-agent: ${agent}`, `${aiAllowed ? 'Allow' : 'Disallow'}: /`, '');
    }
    if (site) {
      lines.push(`Sitemap: ${site}/sitemap.xml`);
      if (boolOptionValue(opts.llms_txt_enabled, true)) lines.push(`# llms.txt available at ${site}/llms.txt`);
    }
    return c.text(`${lines.join('\n')}\n`, 200, { 'cache-control': 'public, max-age=3600' });
  });
  app.get('/sitemap.xml', async (c) => {
    const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
    const site = siteOrigin(opts);
    if (!site) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>', {
        headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      });
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
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
      headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  });
  app.get('/llms.txt', async (c) => {
    const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
    if (!boolOptionValue(opts.llms_txt_enabled, true)) return c.text('llms.txt is disabled in this site SEO settings', 404);
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
    return c.text(`${lines.join('\n')}\n`, 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' });
  });
  app.get('/llms-full.txt', async (c) => {
    const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
    if (String(opts.llms_full_enabled || '').trim().toLowerCase() !== 'true') return c.text('llms-full.txt is disabled in this site SEO settings', 404);
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
    return c.text(`${header}\n${body}\n`, 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' });
  });

  app.get('/api/v1/options', optionalAuth, async (c) => ok(c, await optionMap(await isAdmin(currentUserId(c)))));
  app.put('/api/v1/options', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const now = nowUnix();
    for (const [key, raw] of Object.entries(body)) {
      let value = typeof raw === 'string' ? raw : String(raw ?? '');
      if (key === 'site_favicon') value = resolveFaviconUrl(value) || value;
      await exec(
        `insert into ${table('options')} (name, value, created_at, updated_at)
         values ($1,$2,$3,$3)
         on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
    return ok(c, null);
  });
  app.post('/api/v1/options', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const now = nowUnix();
    for (const [key, raw] of Object.entries(body)) {
      let value = String(raw ?? '');
      if (key === 'site_favicon') value = resolveFaviconUrl(value) || value;
      await exec(
        `insert into ${table('options')} (name, value, created_at, updated_at)
         values ($1,$2,$3,$3)
         on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
    return ok(c, null);
  });

  app.get('/api/v1/i18n/locales', (c) => {
    return ok(c, { locales: localeFiles() });
  });
  app.get('/api/v1/i18n/current', (c) => ok(c, { locale: 'zh-CN' }));
  app.get('/api/v1/i18n/:locale', (c) => {
    const locale = c.req.param('locale');
    try {
      const data = readLocale(locale);
      return data ? ok(c, data) : notFound(c, 'locale not found');
    } catch {
      return notFound(c, 'locale not found');
    }
  });

  app.get('/api/v1/categories', async (c) => {
    const sp = searchParams(c);
    if (!wantsMetaPagination(sp)) return ok(c, await listMetas('category', true));
    const result = await listMetasPage('category', true, sp);
    return paginate(c, result.rows, result.total, result.page, result.perPage);
  });
  app.get('/api/v1/categories/:id', async (c) => {
    const row = await one<Record<string, unknown>>(`select * from ${table('metas')} where id = $1 and type = 'category'`, [c.req.param('id')]);
    return row ? ok(c, row) : notFound(c, '分类 not found');
  });
  app.post('/api/v1/categories', auth, async (c) => ok(c, { id: await saveMeta('category', await c.req.json().catch(() => ({}))) }));
  app.put('/api/v1/categories/:id', auth, async (c) => ok(c, { id: await saveMeta('category', await c.req.json().catch(() => ({})), intParam(c.req.param('id'))) }));
  app.delete('/api/v1/categories/:id', auth, async (c) => {
    await exec(`delete from ${table('metas')} where id = $1 and type = 'category'`, [c.req.param('id')]);
    return ok(c, null);
  });

  app.get('/api/v1/tags', async (c) => {
    const sp = searchParams(c);
    const includeEmpty = sp.get('include_empty') === 'true';
    if (!wantsMetaPagination(sp)) return ok(c, await listMetas('tag', includeEmpty));
    const result = await listMetasPage('tag', includeEmpty, sp);
    return paginate(c, result.rows, result.total, result.page, result.perPage);
  });
  app.get('/api/v1/tags/:id', async (c) => {
    const row = await one<Record<string, unknown>>(`select * from ${table('metas')} where id = $1 and type = 'tag'`, [c.req.param('id')]);
    return row ? ok(c, row) : notFound(c, '标签 not found');
  });
  app.post('/api/v1/tags', auth, async (c) => ok(c, { id: await saveMeta('tag', await c.req.json().catch(() => ({}))) }));
  app.put('/api/v1/tags/:id', auth, async (c) => ok(c, { id: await saveMeta('tag', await c.req.json().catch(() => ({})), intParam(c.req.param('id'))) }));
  app.delete('/api/v1/tags/:id', auth, async (c) => {
    await exec(`delete from ${table('metas')} where id = $1 and type = 'tag'`, [c.req.param('id')]);
    return ok(c, null);
  });

  app.get('/api/v1/posts', optionalAuth, async (c) => {
    const sp = searchParams(c);
    const { page, perPage, offset } = pageParams(sp);
    const typ = sp.get('type') || 'post';
    const authed = currentUserId(c) > 0;
    const status = authed ? sp.get('status') : 'publish';
    const where: string[] = ['p.type = $1'];
    const joins: string[] = [];
    const params: unknown[] = [typ];
    if (status) {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    const search = sp.get('search');
    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.title ilike $${params.length} or coalesce(p.content,'') ilike $${params.length})`);
    }
    const category = sp.get('category');
    const categoryId = intParam(sp.get('category_id') || undefined);
    if (category || categoryId > 0) {
      joins.push(`join ${table('relationships')} cr on cr.post_id = p.id join ${table('metas')} cm on cm.id = cr.meta_id and cm.type = 'category'`);
      if (categoryId > 0) {
        params.push(categoryId);
        where.push(`cm.id = $${params.length}`);
      } else {
        params.push(category);
        where.push(`cm.slug = $${params.length}`);
      }
    }
    const tag = sp.get('tag');
    const tagId = intParam(sp.get('tag_id') || undefined);
    if (tag || tagId > 0) {
      joins.push(`join ${table('relationships')} tr on tr.post_id = p.id join ${table('metas')} tm on tm.id = tr.meta_id and tm.type = 'tag'`);
      if (tagId > 0) {
        params.push(tagId);
        where.push(`tm.id = $${params.length}`);
      } else {
        params.push(tag);
        where.push(`tm.slug = $${params.length}`);
      }
    }
    for (const [queryKey, metaKey] of [['video_type', 'video_type'], ['region', 'region'], ['year', 'year']] as const) {
      const value = sp.get(queryKey);
      if (value) {
        params.push(value);
        where.push(`p.meta->>'${metaKey}' = $${params.length}`);
      }
    }
    const genre = sp.get('genre');
    if (genre) {
      params.push(JSON.stringify([genre]));
      where.push(`p.meta->'genres' @> $${params.length}::jsonb`);
    }
    const orderBy = normalizeOrder(sp.get('order_by'), 'published_at');
    const direction = normalizeDirection(sp.get('order'));
    const orderExpr = orderBy === 'random'
      ? 'random()'
      : orderBy === 'published_at'
        ? 'coalesce(p.published_at, to_timestamp(p.created_at))'
        : `p.${orderBy}`;
    const joinSql = joins.length ? ` ${joins.join(' ')}` : '';
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('posts')} p${joinSql} ${whereSql}`, params);
    const rows = await many<Record<string, unknown>>(
      `select p.* from ${table('posts')} p${joinSql} ${whereSql}
       order by ${orderExpr} ${orderBy === 'random' ? '' : direction}, p.id ${direction}
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    );
    return paginate(c, await attachPostRelations(rows), Number(total?.count || 0), page, perPage);
  });

  app.get('/api/v1/posts/slug/:slug', optionalAuth, async (c) => {
    const post = await getPostBy('slug = $1', [decodeURIComponent(c.req.param('slug') || '')], currentUserId(c) > 0, searchParams(c).get('track') === '1');
    return post ? ok(c, post) : notFound(c, '文章 not found');
  });
  app.get('/api/v1/posts/by-display-id/:display_id', optionalAuth, async (c) => {
    const post = await getPostBy('display_id = $1 and type = $2', [intParam(c.req.param('display_id')), 'post'], currentUserId(c) > 0, searchParams(c).get('track') === '1');
    return post ? ok(c, post) : notFound(c, '文章 not found');
  });
  app.get('/api/v1/posts/:id', optionalAuth, async (c) => {
    const post = await getPostBy('id = $1', [intParam(c.req.param('id'))], currentUserId(c) > 0, searchParams(c).get('track') === '1');
    return post ? ok(c, post) : notFound(c, '文章 not found');
  });
  app.get('/api/v1/posts/:id/episodes', optionalAuth, async (c) => {
    const post = await one<Record<string, unknown>>(`select status from ${table('posts')} where id = $1`, [intParam(c.req.param('id'))]);
    if (!post || (post.status !== 'publish' && currentUserId(c) <= 0)) return notFound(c, '文章 not found');
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('post_episodes')} where post_id = $1 order by sort_order asc, episode_no asc, id asc`,
      [intParam(c.req.param('id'))],
    ).catch(() => []);
    return ok(c, { episodes: rows, total: rows.length });
  });
  app.get('/api/v1/posts/:id/comments', async (c) => {
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('comments')} where post_id = $1 and status = 'approved' order by created_at asc, id asc`,
      [intParam(c.req.param('id'))],
    );
    return ok(c, rows);
  });
  app.get('/api/v1/posts/:id/navigation', async (c) => {
    const id = intParam(c.req.param('id'));
    const current = await one<Record<string, unknown>>(
      `select id, published_at, created_at from ${table('posts')} where id = $1 and status = 'publish'`,
      [id],
    );
    if (!current) return ok(c, { prev: null, next: null });
    const pivot = current.published_at || new Date(Number(current.created_at || 0) * 1000);
    const prev = await one<Record<string, unknown>>(
      `select id, title, slug, cover_url, published_at from ${table('posts')}
       where status = 'publish' and type = 'post' and id <> $1 and coalesce(published_at, to_timestamp(created_at)::timestamp) < $2
       order by coalesce(published_at, to_timestamp(created_at)::timestamp) desc, id desc limit 1`,
      [id, pivot],
    );
    const next = await one<Record<string, unknown>>(
      `select id, title, slug, cover_url, published_at from ${table('posts')}
       where status = 'publish' and type = 'post' and id <> $1 and coalesce(published_at, to_timestamp(created_at)::timestamp) > $2
       order by coalesce(published_at, to_timestamp(created_at)::timestamp) asc, id asc limit 1`,
      [id, pivot],
    );
    return ok(c, { prev, next });
  });
  app.post('/api/v1/posts', auth, async (c) => {
    const body = normalizePostBody(await c.req.json().catch(() => ({})), true);
    const id = await createPostRecord(body, currentUserId(c));
    if (id) await savePostExtras(id, body);
    if (id) await sendPublishNotificationIfNeeded(id, false);
    return ok(c, { id });
  });
  app.put('/api/v1/posts/:id', auth, async (c) => {
    const postId = intParam(c.req.param('id'));
    const before = await one<{ status: string }>(`select status from ${table('posts')} where id = $1`, [postId]).catch(() => null);
    const body = normalizePostBody(await c.req.json().catch(() => ({})));
    const id = await updatePostRecord(postId, body);
    await savePostExtras(id, body);
    await sendPublishNotificationIfNeeded(id, before?.status === 'publish');
    return ok(c, { id });
  });
  app.delete('/api/v1/posts/:id', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    const footprintPlaces = await many<{ place_id: number }>(
      `select coalesce(place_id,0) as place_id from ${table('post_footprints')} where post_id = $1`,
      [id],
    ).catch(() => []);
    await exec(`delete from ${table('relationships')} where post_id = $1`, [id]).catch(() => {});
    await exec(`delete from ${table('comments')} where post_id = $1`, [id]).catch(() => {});
    await exec(`delete from ${table('annotations')} where post_id = $1`, [id]).catch(() => {});
    await exec(`delete from ${table('post_footprints')} where post_id = $1`, [id]).catch(() => {});
    await exec(`delete from ${table('posts')} where id = $1`, [id]);
    await refreshMetaCounts();
    for (const row of footprintPlaces) await refreshFootprintVisitCount(Number(row.place_id || 0));
    return ok(c, null);
  });

  app.get('/api/v1/comments', optionalAuth, async (c) => {
    const sp = searchParams(c);
    const { page, perPage, offset } = pageParams(sp);
    const where: string[] = [];
    const params: unknown[] = [];
    const authed = currentUserId(c) > 0;
    const status = authed ? sp.get('status') : 'approved';
    if (status) {
      const parts = status.split(',').map((part) => part.trim()).filter(Boolean);
      if (parts.length > 1) {
        const placeholders = parts.map((part) => {
          params.push(part);
          return `$${params.length}`;
        });
        where.push(`c.status in (${placeholders.join(',')})`);
      } else {
        params.push(parts[0] || 'approved');
        where.push(`c.status = $${params.length}`);
      }
    }
    const postId = sp.get('post_id');
    if (postId) {
      params.push(intParam(postId));
      where.push(`c.post_id = $${params.length}`);
    }
    const userId = intParam(sp.get('user_id') || undefined);
    if (userId > 0 && authed) {
      params.push(userId);
      where.push(`c.user_id = $${params.length}`);
    }
    const search = sp.get('search')?.trim();
    if (search && authed) {
      params.push(`%${search}%`);
      where.push(`(c.content ilike $${params.length} or c.author_name ilike $${params.length} or c.author_email ilike $${params.length})`);
    }
    if (sp.get('top_level') === 'true') {
      where.push(`(c.parent_id is null or c.parent_id = 0)`);
    }
    const excludeAdmin = sp.get('exclude_admin') === '1' || sp.get('exclude_admin') === 'true';
    if (excludeAdmin) {
      where.push(`coalesce(u.role, '') != 'admin'`);
      const adminEmails = await many<{ email: string }>(`select lower(trim(email)) as email from ${table('users')} where role = 'admin'`).catch(() => []);
      const emails = adminEmails.map((row) => row.email).filter(Boolean);
      if (emails.length) {
        params.push(emails);
        where.push(`lower(trim(coalesce(c.author_email,''))) != all($${params.length}::text[])`);
      }
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const total = await one<{ count: string }>(
      `select count(*)::text as count
       from ${table('comments')} c
       left join ${table('users')} u on u.id = c.user_id
       ${whereSql}`,
      params,
    );
    const direction = normalizeDirection(sp.get('order'));
    const rows = await many<Record<string, unknown>>(
      `select c.*,
              p.title as post_title, p.slug as post_slug, p.display_id as post_display_id,
              p.created_at as post_created_at, p.published_at as post_published_at,
              p.comment_count as post_comment_count,
              coalesce(u.role,'') as user_role,
              pc.author_name as parent_author, pc.content as parent_content, pc.created_at as parent_created_at
       from ${table('comments')} c
       left join ${table('posts')} p on p.id = c.post_id
       left join ${table('users')} u on u.id = c.user_id
       left join ${table('comments')} pc on pc.id = c.parent_id
       ${whereSql}
       order by c.created_at ${direction}, c.id ${direction}
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    );
    return paginate(c, rows.map((row) => {
      const isAdmin = row.user_role === 'admin';
      const parentContent = String(row.parent_content || '');
      return {
        ...row,
        author: row.author_name,
        email: row.author_email,
        url: row.author_url,
        ip: row.author_ip,
        user_agent: row.author_agent,
        avatar_url: gravatarUrlForEmail(String(row.author_email || ''), 64),
        author_avatar: gravatarUrlForEmail(String(row.author_email || ''), 48),
        is_admin: isAdmin,
        comment_count: 1,
        level: 1,
        parent: row.parent_id ? {
          id: row.parent_id,
          author: row.parent_author,
          content: [...parentContent].length > 100 ? `${[...parentContent].slice(0, 100).join('')}...` : parentContent,
          created_at: row.parent_created_at,
        } : undefined,
      };
    }), Number(total?.count || 0), page, perPage);
  });
  app.post('/api/v1/comments', optionalAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const content = String(body.content || '').trim();
    if (content.length < 5) return badRequest(c, '评论内容至少 5 个字');
    if ((await optionValue('allow_comments', 'true')) === 'false') return badRequest(c, '站点已关闭评论');
    const authorEmail = String(body.author_email || body.email || '').trim();
    const authorUrl = String(body.author_url || body.url || '').trim();
    if ((await optionValue('comment_require_email', 'true')) !== 'false' && !authorEmail) {
      return badRequest(c, '请填写邮箱');
    }
    const postId = intParam(String(body.post_id || body.postId || ''));
    const post = await one<{ id: number; title: string; slug: string | null; allow_comment: boolean | null }>(
      `select id, title, slug, allow_comment from ${table('posts')} where id = $1 and status = 'publish' limit 1`,
      [postId],
    );
    if (!post) return notFound(c, '文章');
    if (post.allow_comment === false) return badRequest(c, '该文章已关闭评论');
    const parentId = intParam(String(body.parent_id || body.parentId || ''));
    if (parentId > 0) {
      const parent = await one<{ post_id: number }>(
        `select post_id from ${table('comments')} where id = $1 and status = 'approved' limit 1`,
        [parentId],
      );
      if (!parent || Number(parent.post_id) !== postId) return badRequest(c, '回复的评论不存在或未通过审核');
    }
    const ip = clientIp(c);
    const userId = currentUserId(c);
    const role = userId > 0
      ? await one<{ role: string }>(`select role from ${table('users')} where id = $1`, [currentUserId(c)]).catch(() => null)
      : null;
    let status = role?.role === 'admin' ? 'approved' : 'pending';
    if (status === 'pending' && await validPassportToken(c.req.header('x-utterlog-passport') || '')) status = 'approved';
    if (status === 'pending' && !(await verifyCommentCaptcha(body))) {
      return badRequest(c, '验证码错误或已过期', 'CAPTCHA_INVALID');
    }
    if (status === 'pending' && await isSpamComment(content, authorEmail, authorUrl, ip)) status = 'spam';
    if (status === 'pending' && (await optionValue('comment_trust_returning', 'true')) !== 'false') {
      const prev = await one<{ count: string }>(
        `select count(*)::text as count from ${table('comments')}
         where status = 'approved' and (author_email = $1 or (visitor_id = $2 and visitor_id != ''))`,
        [authorEmail, String(body.visitor_id || '')],
      ).catch(() => null);
      if (Number(prev?.count || 0) > 0) status = 'approved';
    }
    if (status === 'pending' && (await optionValue('comment_moderation', 'false')) !== 'true') status = 'approved';
    const aiAudit = status === 'pending' && userId === 0 ? await auditCommentContent(content).catch(() => null) : null;
    if (aiAudit && !aiAudit.passed) {
      const failAction = await aiAuditFailAction();
      if (failAction === 'reject') status = 'spam';
      if (failAction === 'pending') status = 'pending';
    }
    const id = await genericCreate('comments', {
      ...body,
      post_id: postId,
      parent_id: parentId > 0 ? parentId : 0,
      author_name: body.author_name || body.author || body.name,
      author_email: authorEmail,
      author_url: authorUrl,
      content,
      status,
      author_ip: ip,
      author_agent: c.req.header('user-agent') || '',
      user_id: userId,
    });
    if (status === 'approved') {
      await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [postId]).catch(() => {});
    }
    if (currentUserId(c) === 0 || status === 'pending') {
      await exec(
        `insert into ${table('notifications')} (user_id, type, title, content, is_read, created_at)
         values (1, 'comment', $1, $2, false, $3)`,
        [
          `${String(body.author_name || body.author || body.name || '访客')} 发表了新评论`,
          `状态: ${status} | ${content.slice(0, 100)}`,
          nowUnix(),
        ],
      ).catch(() => {});
    }
    if (status === 'pending') {
      void sendCommentModerationTelegram({
        commentId: id,
        postTitle: post.title,
        author: String(body.author_name || body.author || body.name || '访客'),
        email: String(body.author_email || body.email || ''),
        url: authorUrl,
        ip: ip || '',
        content,
      });
    }
    if ((await optionValue('comment_notify_admin', 'true')) !== 'false' && currentUserId(c) === 0) {
      const admin = await one<{ email: string }>(`select email from ${table('users')} where role = 'admin' order by id asc limit 1`).catch(() => null);
      const siteTitle = await optionValue('site_title', 'Utterlog');
      const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '');
      if (admin?.email) {
        await sendConfiguredEmail(
          admin.email,
          `新评论 - ${post.title}`,
          `<div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0d1a2d">
            <p>${htmlEscape(String(body.author_name || body.author || body.name || '访客'))} 在《${htmlEscape(post.title)}》发表了新评论。</p>
            <p>状态：${htmlEscape(status)}</p>
            <blockquote style="margin:12px 0;padding:10px 14px;background:#f5f7fa;border-left:3px solid #cdd5df;color:#5a6b7f">${htmlEscape(content.slice(0, 500))}</blockquote>
            <p><a href="${htmlEscape(`${siteUrl}/admin/comments`)}">进入 ${htmlEscape(siteTitle)} 后台审核</a></p>
          </div>`,
        ).catch(() => {});
      }
    }
    if (status === 'approved' && userId === 0) {
      void enqueueAiCommentReply({ commentId: id, postId, parentId: parentId > 0 ? parentId : 0, content, audit: aiAudit }).catch(() => {});
    }
    return ok(c, { id, status });
  });
  app.put('/api/v1/comments/:id', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    const before = await one<{ post_id: number; status: string }>(`select post_id, status from ${table('comments')} where id = $1`, [id]);
    if (!before) return notFound(c, 'comment not found');
    const body = await c.req.json().catch(() => ({}));
    const patch = {
      ...body,
      author_name: body.author_name ?? body.author ?? body.name,
      author_email: body.author_email ?? body.email,
      author_url: body.author_url ?? body.url,
    };
    const updated = await genericUpdate('comments', id, patch);
    const nextStatus = String(patch.status ?? before.status);
    if (before.status !== 'approved' && nextStatus === 'approved') {
      await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [before.post_id]).catch(() => {});
    } else if (before.status === 'approved' && nextStatus !== 'approved') {
      await exec(`update ${table('posts')} set comment_count = greatest(comment_count - 1, 0) where id = $1`, [before.post_id]).catch(() => {});
    }
    return ok(c, { id: updated });
  });
  app.put('/api/v1/comments/:id/edit', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = intParam(c.req.param('id'));
    const content = String(body.content || '').trim();
    const visitorId = String(body.visitor_id || '').trim();
    if ([...content].length < 5) return badRequest(c, '评论内容至少 5 个字');
    const row = await one<{ visitor_id: string; created_at: number }>(
      `select coalesce(visitor_id,'') as visitor_id, created_at from ${table('comments')} where id = $1`,
      [id],
    ).catch(() => null);
    if (!row) return notFound(c, '评论不存在');
    if (!visitorId || row.visitor_id !== visitorId) {
      return c.json({ success: false, code: 'FORBIDDEN', error: { code: 'FORBIDDEN', message: '无权编辑此评论' } }, 403);
    }
    if (nowUnix() - Number(row.created_at || 0) > 60) {
      return c.json({ success: false, code: 'EXPIRED', error: { code: 'EXPIRED', message: '编辑时间已过期' } }, 403);
    }
    await exec(`update ${table('comments')} set content = $1, updated_at = $2 where id = $3`, [content, nowUnix(), id]);
    return ok(c, { id });
  });
  app.patch('/api/v1/comments/:id/approve', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    const existing = await one<{ post_id: number; status: string }>(`select post_id, status from ${table('comments')} where id = $1`, [id]);
    const updated = await genericUpdate('comments', id, { status: 'approved' });
    if (existing && existing.status !== 'approved') {
      await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [existing.post_id]).catch(() => {});
    }
    return ok(c, { id: updated });
  });
  app.post('/api/v1/comments/:id/reply', auth, async (c) => {
    const parentId = intParam(c.req.param('id'));
    const parent = await one<{ post_id: number; author_name: string; author_email: string | null; content: string; user_id: number | null; role: string | null }>(
      `select c.post_id, c.author_name, c.author_email, c.content, c.user_id, coalesce(u.role,'') as role
       from ${table('comments')} c left join ${table('users')} u on u.id = c.user_id where c.id = $1`,
      [parentId],
    );
    if (!parent) return notFound(c, 'comment not found');
    const body = await c.req.json().catch(() => ({}));
    const admin = await one<{ email: string; username: string; nickname: string | null }>(
      `select email, username, nickname from ${table('users')} where id = $1`,
      [currentUserId(c)],
    ).catch(() => null);
    const id = await genericCreate('comments', {
      post_id: parent.post_id,
      parent_id: parentId,
      user_id: currentUserId(c),
      author_name: admin?.nickname || admin?.username || 'Admin',
      author_email: admin?.email || '',
      content: body.content || '',
      status: 'approved',
      source: 'local',
    });
    await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [parent.post_id]).catch(() => {});
    const recipient = String(parent.author_email || '').trim().toLowerCase();
    if (recipient && parent.role !== 'admin' && recipient !== String(admin?.email || '').trim().toLowerCase() && !(await isCommentReplyOptedOut(recipient))) {
      const post = await one<{ title: string; slug: string | null }>(`select title, slug from ${table('posts')} where id = $1`, [parent.post_id]).catch(() => null);
      const siteTitle = await optionValue('site_title', 'Utterlog');
      const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '');
      const postUrl = `${siteUrl}/posts/${encodeURIComponent(post?.slug || String(parent.post_id))}#comment-${id}`;
      const unsubscribe = await commentReplyUnsubscribeUrl(siteUrl, recipient);
      const preview = String(body.content || '').slice(0, 500);
      const original = String(parent.content || '').slice(0, 300);
      await sendConfiguredEmail(
        recipient,
        `你的评论收到了回复 - ${siteTitle}`,
        `<div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0d1a2d">
          <p>${htmlEscape(parent.author_name || '你好')}，你在《${htmlEscape(post?.title || '')}》下的评论收到了回复。</p>
          <blockquote style="margin:12px 0;padding:10px 14px;background:#f5f7fa;border-left:3px solid #cdd5df;color:#5a6b7f">${htmlEscape(original)}</blockquote>
          <div style="margin:12px 0;padding:12px 14px;background:#fff;border:1px solid #e5eaf0">${htmlEscape(preview)}</div>
          <p><a href="${htmlEscape(postUrl)}">查看回复</a></p>
          <p style="font-size:12px;color:#8ea0b4">不想再收到回复通知？<a href="${htmlEscape(unsubscribe)}">点击此处退订</a>。</p>
        </div>`,
      ).catch(() => {});
    }
    return ok(c, { id });
  });
  app.delete('/api/v1/comments/:id', auth, async (c) => {
    const existing = await one<{ post_id: number; status: string }>(`select post_id, status from ${table('comments')} where id = $1`, [c.req.param('id')]).catch(() => null);
    await exec(`delete from ${table('comments')} where id = $1`, [c.req.param('id')]);
    if (existing?.status === 'approved') {
      await exec(`update ${table('posts')} set comment_count = greatest(comment_count - 1, 0) where id = $1`, [existing.post_id]).catch(() => {});
    }
    return ok(c, null);
  });
  app.get('/api/v1/comments/pending-count', auth, async (c) => {
    const [pending, spam] = await Promise.all([
      one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'pending'`),
      one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'spam'`),
    ]);
    const pendingCount = Number(pending?.count || 0);
    return ok(c, { count: pendingCount, pending: pendingCount, spam: Number(spam?.count || 0) });
  });

  app.get('/api/v1/media', auth, async (c) => {
    const sp = searchParams(c);
    const { page, perPage, offset } = pageParams(sp);
    const where: string[] = [];
    const params: unknown[] = [];
    const category = sp.get('category');
    if (category) {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    const excludeCategory = sp.get('exclude_category');
    if (excludeCategory) {
      params.push(excludeCategory);
      where.push(`category != $${params.length}`);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('media')} ${whereSql}`, params);
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('media')} ${whereSql} order by created_at desc, id desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    );
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.get('/api/v1/media/stats', auth, async (c) => {
    const rows = await many<{ driver: string; files: number; size: string }>(
      `select coalesce(nullif(driver,''),'local') as driver, count(*)::int as files, coalesce(sum(size),0)::text as size
       from ${table('media')} group by driver`,
    ).catch(() => []);
    const drivers: Record<string, { files: number; size: number }> = {};
    let files = 0;
    let size = 0;
    for (const row of rows) {
      const stat = { files: Number(row.files || 0), size: Number(row.size || 0) };
      drivers[row.driver || 'local'] = stat;
      files += stat.files;
      size += stat.size;
    }
    return ok(c, {
      files,
      size,
      drivers,
      disk: diskStats(existsSync(config.uploadDir) ? config.uploadDir : '.'),
      total: files,
      total_size: size,
    });
  });
  app.post('/api/v1/media/upload', auth, async (c) => {
    const release = acquireUploadSlot();
    if (!release) return badRequest(c, '上传并发数已满，请稍后再试', 'TOO_MANY_UPLOADS');
    try {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return badRequest(c, 'file 不能为空');
    const requestedFolder = String(form.get('folder') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const folder = validUploadFolders.has(requestedFolder) ? requestedFolder : '';
    const ext = mediaExt(file.name);
    if (!(await allowedUploadExts()).has(ext)) return badRequest(c, `不支持的文件类型: ${ext}`, 'VALIDATION_ERROR');
    const limit = await maxUploadBytes();
    if (file.size > limit) return badRequest(c, `文件大小超过 ${Math.floor(limit / 1024 / 1024)}MB 限制`);
    try {
      await assertStorageBudget(file.size);
    } catch (err) {
      return badRequest(c, err instanceof Error ? err.message : '空间容量不足', 'STORAGE_LIMIT_EXCEEDED');
    }
    const originalBytes = Buffer.from(await file.arrayBuffer());
    let finalBytes = originalBytes;
    let finalExt = ext;
    let mimeType = mediaMimeType(ext, file.type);
    let exifData = '';
    let thumbnails: Record<string, string> = {};
    let thumbnailBuffers: Record<string, Buffer> = {};
    let converted = false;
    let compressed = false;
    const initialCategory = detectMediaCategory(mimeType, ext);
    if (initialCategory === 'image') {
      const processed = await processUploadedImage(originalBytes, ext, folder);
      finalBytes = processed.bytes;
      finalExt = processed.ext;
      mimeType = processed.mimeType;
      exifData = processed.exifData;
      thumbnailBuffers = processed.thumbnailBuffers;
      converted = processed.converted;
      compressed = processed.compressed;
    }
    const category = detectMediaCategory(mimeType, finalExt);
    const stored = await storeUploadedBytes(finalBytes, finalExt, mimeType, folder);
    const basePath = stored.relativePath.replace(/\.[^/.]+$/, '');
    for (const [name, thumb] of Object.entries(thumbnailBuffers)) {
      const thumbPath = `${basePath}-${name}.webp`;
      const thumbStored = await storeUploadedBytesAt(thumb, thumbPath, 'image/webp', folder).catch(() => null);
      if (thumbStored) thumbnails[name] = thumbStored.url;
    }
    const id = await genericCreate('media', {
      name: file.name,
      filename: stored.relativePath,
      url: stored.url,
      mime_type: mimeType,
      size: finalBytes.length,
      driver: stored.driver,
      category,
      exif_data: exifData,
    });
    return ok(c, {
      id,
      name: file.name,
      url: stored.url,
      filename: stored.relativePath,
      size: finalBytes.length,
      original_size: file.size,
      mime_type: mimeType,
      category,
      driver: stored.driver,
      compressed,
      converted,
      thumbnails,
      folder,
    });
    } finally {
      release();
    }
  });
  app.post('/api/v1/media/upload-branding', auth, async (c) => {
    const form = await c.req.formData();
    const file = form.get('file');
    const purpose = String(form.get('purpose') || 'logo').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!(file instanceof File)) return badRequest(c, 'file 不能为空');
    if (!['logo', 'dark-logo', 'favicon'].includes(purpose)) return badRequest(c, 'purpose 必须为 logo、dark-logo 或 favicon');
    const ext = mediaExt(file.name, 'png');
    if (!brandingExts.has(ext)) return badRequest(c, '不支持的图片格式，请使用 PNG/JPG/GIF/WebP/AVIF/ICO/SVG');
    if (file.size > 5 * 1024 * 1024) return badRequest(c, '文件大小不能超过 5MB');
    const dir = join(config.uploadDir, 'branding');
    mkdirSync(dir, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());

    if (purpose === 'favicon') {
      try {
        const ico = await buildFaviconIco(bytes, ext);
        clearBrandingFaviconFiles(dir, rmSync);
        await Bun.write(join(dir, 'favicon.ico'), ico);
        return ok(c, { url: '/favicon.ico', filename: 'favicon.ico', purpose });
      } catch (err) {
        return badRequest(c, err instanceof Error ? err.message : 'Favicon 转换失败');
      }
    }

    const filename = `${purpose}.${ext}`;
    for (const oldExt of brandingExts) {
      if (oldExt === ext) continue;
      rmSync(join(dir, `${purpose}.${oldExt}`), { force: true });
    }
    await Bun.write(join(dir, filename), bytes);
    return ok(c, { url: `/${filename}`, filename, purpose });
  });
  app.post('/api/v1/media/download-url', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const url = String(body.url || '').trim();
    if (!url) return badRequest(c, 'url 不能为空');
    const safeUrl = await assertPublicHttpUrl(url);
    const res = await fetch(safeUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return badRequest(c, '下载失败');
    let ext = mediaExt(new URL(safeUrl).pathname);
    const contentType = res.headers.get('content-type') || mediaMimeType(ext);
    const contentTypeExt = Object.entries(mediaMimeByExt).find(([, mime]) => mime === contentType.split(';')[0])?.[0];
    if (ext === 'bin' && contentTypeExt) ext = contentTypeExt;
    if (!(await allowedUploadExts()).has(ext)) return badRequest(c, `不支持的文件类型: ${ext}`, 'VALIDATION_ERROR');
    const requestedFolder = String(body.folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const folder = validUploadFolders.has(requestedFolder) ? requestedFolder : '';
    const maxBytes = await maxUploadBytes(2);
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > maxBytes) return badRequest(c, `文件大小超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > maxBytes) return badRequest(c, `文件大小超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制`);
    try {
      await assertStorageBudget(bytes.length);
    } catch (err) {
      return badRequest(c, err instanceof Error ? err.message : '空间容量不足', 'STORAGE_LIMIT_EXCEEDED');
    }
    const stored = await storeUploadedBytes(bytes, ext, contentType, folder);
    const name = String(body.name || '').trim() || new URL(safeUrl).pathname.split('/').pop() || stored.filename;
    const id = await genericCreate('media', {
      name,
      filename: stored.relativePath,
      url: stored.url,
      mime_type: contentType,
      size: bytes.length,
      driver: stored.driver,
      category: detectMediaCategory(contentType, ext),
    });
    return ok(c, { id, name, url: stored.url, filename: stored.relativePath, size: bytes.length, mime_type: contentType, category: detectMediaCategory(contentType, ext), folder, driver: stored.driver });
  });
  app.delete('/api/v1/media/:id', auth, async (c) => {
    const row = await one<{ filename: string; driver: string | null }>(
      `select coalesce(filename,'') as filename, coalesce(driver,'local') as driver from ${table('media')} where id = $1`,
      [c.req.param('id')],
    ).catch(() => null);
    if (row && (!row.driver || row.driver === 'local')) removeLocalUpload(row.filename);
    await exec(`delete from ${table('media')} where id = $1`, [c.req.param('id')]);
    return ok(c, null);
  });
  app.post('/api/v1/media/test-connection', auth, async (c) => {
    try {
      return ok(c, await testS3Connection(await c.req.json().catch(() => ({}))));
    } catch (err) {
      return badRequest(c, `连接失败: ${err instanceof Error ? err.message : '未知错误'}`, 'CONNECTION_FAILED');
    }
  });
  app.get('/api/v1/media/exif', async (c) => {
    const urls = String(searchParams(c).get('urls') || '').split(',').map((url) => url.trim()).filter(Boolean);
    if (urls.length === 0) return badRequest(c, 'urls parameter required');
    if (urls.length > 50) return badRequest(c, 'maximum 50 URLs per request');
    const result: Record<string, unknown> = {};
    for (const url of urls) {
      const candidates = [url];
      try {
        const parsed = new URL(url, config.appUrl);
        if (parsed.pathname.startsWith('/uploads/')) {
          candidates.push(parsed.pathname, `${config.appUrl.replace(/\/$/, '')}${parsed.pathname}`);
        }
      } catch {
        // Keep original URL only.
      }
      const row = await one<{ exif_data: string }>(
        `select coalesce(exif_data,'') as exif_data from ${table('media')} where url = any($1::text[]) limit 1`,
        [candidates],
      ).catch(() => null);
      if (row?.exif_data) {
        try { result[url] = JSON.parse(row.exif_data); } catch { result[url] = row.exif_data; }
      }
    }
    return ok(c, result);
  });

  app.get('/api/v1/moments/recent-tags', async (c) => {
    const rows = await many<{ content: string }>(
      `select content from ${table('moments')} where visibility = 'public' order by created_at desc limit 200`,
    ).catch(() => []);
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const match of String(row.content || '').matchAll(/#([\p{Letter}\p{Number}_-]{1,40})/gu)) {
        const tag = match[1];
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return ok(c, [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count })));
  });

  app.get('/api/v1/music/search', async (c) => {
    const sp = searchParams(c);
    const platform = musicPlatform(sp.get('platform') || sp.get('server') || 'netease');
    const q = String(sp.get('q') || '').trim();
    const page = Math.max(1, Number(sp.get('page') || 1) || 1);
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 20) || 20));
    if (!platform) return badRequest(c, '不支持的音乐平台');
    if (!q) return badRequest(c, 'q parameter required');
    const upstream = await metingFetch(platform, `/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`).catch(() => null);
    if (!upstream?.ok) return badRequest(c, '音乐搜索失败', 'MUSIC_SEARCH_FAILED');
    const payload = await upstream.json().catch(() => ({}));
    return ok(c, payload);
  });

  app.get('/api/v1/music/proxy/:platform/songs/:id/:asset', async (c) => {
    const platform = musicPlatform(c.req.param('platform'));
    const id = musicId(c.req.param('id'));
    const asset = c.req.param('asset');
    if (!platform || !id || !musicAssets.has(asset)) return badRequest(c, 'invalid music proxy request');

    const headers: Record<string, string> = {};
    const range = c.req.header('range');
    if (range) headers.Range = range;
    const upstream = await metingFetch(platform, `/songs/${encodeURIComponent(id)}/${asset}`, { headers }).catch(() => null);
    if (!upstream?.ok && upstream?.status !== 206) return new Response('', { status: upstream?.status || 502 });

    const responseHeaders = new Headers();
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has('cache-control')) responseHeaders.set('cache-control', asset === 'stream' ? 'private, max-age=3600' : 'public, max-age=86400');
    if (asset === 'lyric' && !responseHeaders.has('content-type')) responseHeaders.set('content-type', 'text/plain; charset=utf-8');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  });

  for (const name of contentTables) {
    app.get(`/api/v1/${name}`, optionalAuth, async (c) => {
      const result = await genericList(name, searchParams(c), currentUserId(c) > 0);
      return paginate(c, result.rows, result.total, result.page, result.perPage);
    });
    app.get(`/api/v1/${name}/:id`, optionalAuth, async (c) => {
      const row = await genericGet(name, c.req.param('id') || '', currentUserId(c) > 0);
      if (name === 'playlists' && row) {
        const songs = await many<Record<string, unknown>>(
          `select m.* from ${table('playlist_songs')} ps
           join ${table('music')} m on m.id = ps.music_id
           where ps.playlist_id = $1
           order by ps.sort_order asc, ps.id asc`,
          [c.req.param('id')],
        ).catch(() => []);
        return ok(c, { ...row, songs });
      }
      return row ? ok(c, row) : notFound(c, `${name} not found`);
    });
    app.post(`/api/v1/${name}`, auth, async (c) => {
      const id = await genericCreate(name, await c.req.json().catch(() => ({})), currentUserId(c));
      return ok(c, { id });
    });
    app.put(`/api/v1/${name}/:id`, auth, async (c) => {
      const id = await genericUpdate(name, intParam(c.req.param('id')), await c.req.json().catch(() => ({})));
      return ok(c, { id });
    });
    app.delete(`/api/v1/${name}/:id`, auth, async (c) => {
      await exec(`delete from ${table(name)} where id = $1`, [c.req.param('id')]);
      return ok(c, null);
    });
  }

  app.post('/api/v1/playlists/:id/songs', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const playlistId = intParam(c.req.param('id'));
    const musicId = intParam(String(body.music_id || body.id || ''));
    if (!playlistId || !musicId) return badRequest(c, 'playlist_id 和 music_id 不能为空');
    const maxOrder = await one<{ max: number }>(`select coalesce(max(sort_order), 0)::int as max from ${table('playlist_songs')} where playlist_id = $1`, [playlistId]);
    await exec(
      `insert into ${table('playlist_songs')} (playlist_id, music_id, sort_order, created_at)
       values ($1,$2,$3,$4)
       on conflict (playlist_id, music_id) do nothing`,
      [playlistId, musicId, Number(maxOrder?.max || 0) + 1, nowUnix()],
    );
    await exec(`update ${table('playlists')} set song_count = (select count(*) from ${table('playlist_songs')} where playlist_id = $1), updated_at = $2 where id = $1`, [playlistId, nowUnix()]);
    return ok(c, null);
  });
  app.delete('/api/v1/playlists/:id/songs', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const playlistId = intParam(c.req.param('id'));
    const musicId = intParam(String(body.music_id || body.id || ''));
    if (!playlistId || !musicId) return badRequest(c, 'playlist_id 和 music_id 不能为空');
    await exec(`delete from ${table('playlist_songs')} where playlist_id = $1 and music_id = $2`, [playlistId, musicId]);
    await exec(`update ${table('playlists')} set song_count = (select count(*) from ${table('playlist_songs')} where playlist_id = $1), updated_at = $2 where id = $1`, [playlistId, nowUnix()]);
    return ok(c, null);
  });
  app.post('/api/v1/playlists/import', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = await genericCreate('playlists', {
      title: body.title || `${body.server || 'remote'} playlist ${body.playlist_id || ''}`.trim(),
      description: body.playlist_id ? `Imported playlist id: ${body.playlist_id}` : '',
      status: 'publish',
    }, currentUserId(c));
    let imported = 0;
    if (Array.isArray(body.songs)) {
      for (const song of body.songs) {
        const musicId = await genericCreate('music', {
          title: song.title || song.name || '',
          artist: song.artist || '',
          album: song.album || '',
          cover_url: song.cover_url || song.cover || '',
          url: song.url || '',
          status: 'publish',
        }, currentUserId(c)).catch(() => 0);
        if (musicId) {
          imported++;
          await exec(
            `insert into ${table('playlist_songs')} (playlist_id, music_id, sort_order, created_at)
             values ($1,$2,$3,$4) on conflict (playlist_id, music_id) do nothing`,
            [id, musicId, imported, nowUnix()],
          ).catch(() => {});
        }
      }
      await exec(`update ${table('playlists')} set song_count = $1, updated_at = $2 where id = $3`, [imported, nowUnix(), id]).catch(() => {});
    }
    return ok(c, { id, imported });
  });

  app.post('/api/v1/links/apply', async (c) => {
    const parsed = await parseJson(c, linkApplySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const existing = await one<{ id: number }>(
      `select id from ${table('links')} where lower(url) = lower($1) limit 1`,
      [body.url],
    ).catch(() => null);
    if (existing) return badRequest(c, '该站点已经提交过友链申请', 'LINK_ALREADY_EXISTS');
    const now = nowUnix();
    const rows = await many<{ id: number }>(
      `insert into ${table('links')}
        (name, url, description, logo, email, rss_url, status, rel, group_name, order_num, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,0,'noopener','default',0,$7,$7)
       returning id`,
      [
        body.name,
        body.url,
        body.description || '',
        body.logo || body.avatar || '',
        body.email || '',
        body.rss_url || '',
        now,
      ],
    );
    return ok(c, { received: true, id: rows[0]?.id });
  });

  app.get('/api/v1/public/albums', async (c) => {
    const result = await genericList('albums', searchParams(c), false);
    return paginate(c, result.rows, result.total, result.page, result.perPage);
  });
  app.get('/api/v1/public/albums/:id', async (c) => {
    const id = c.req.param('id');
    const sp = searchParams(c);
    const { page, perPage, offset } = pageParams(sp);
    const album = await one<Record<string, unknown>>(
      `select * from ${table('albums')} where (id::text = $1 or slug = $1) and status = 'public'`,
      [id],
    );
    if (!album) return notFound(c, 'album not found');
    const photos = await many<Record<string, unknown>>(
      `select * from ${table('media')} where album_id = $1 and category = 'image' order by created_at desc limit $2 offset $3`,
      [album.id, perPage, offset],
    ).catch(() => []);
    const total = await one<{ count: string }>(
      `select count(*)::text as count from ${table('media')} where album_id = $1 and category = 'image'`,
      [album.id],
    ).catch(() => null);
    return ok(c, { ...album, album, photos, total: Number(total?.count || 0), page });
  });
  app.get('/api/v1/albums', auth, async (c) => {
    const result = await genericList('albums', searchParams(c), true);
    return paginate(c, result.rows, result.total, result.page, result.perPage);
  });
  app.get('/api/v1/albums/:id', auth, async (c) => {
    const row = await genericGet('albums', c.req.param('id') || '', true);
    return row ? ok(c, row) : notFound(c, 'album not found');
  });
  app.post('/api/v1/albums', auth, async (c) => ok(c, { id: await genericCreate('albums', await c.req.json().catch(() => ({})), currentUserId(c)) }));
  app.put('/api/v1/albums/:id', auth, async (c) => ok(c, { id: await genericUpdate('albums', intParam(c.req.param('id')), await c.req.json().catch(() => ({}))) }));
  app.delete('/api/v1/albums/:id', auth, async (c) => {
    await exec(`delete from ${table('albums')} where id = $1`, [c.req.param('id')]);
    await exec(`update ${table('media')} set album_id = 0 where album_id = $1`, [c.req.param('id')]).catch(() => {});
    return ok(c, null);
  });
  app.get('/api/v1/albums/:id/photos', auth, async (c) => {
    const sp = searchParams(c);
    const { page, perPage, offset } = pageParams(sp);
    const total = await one<{ count: string }>(
      `select count(*)::text as count from ${table('media')} where album_id = $1 and category = 'image'`,
      [c.req.param('id')],
    ).catch(() => null);
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('media')} where album_id = $1 and category = 'image' order by created_at desc limit $2 offset $3`,
      [c.req.param('id'), perPage, offset],
    ).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.post('/api/v1/albums/:id/photos', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const ids = Array.isArray(body.media_ids) ? body.media_ids : [];
    for (const id of ids) await exec(`update ${table('media')} set album_id = $1 where id = $2`, [c.req.param('id'), id]).catch(() => {});
    const count = await one<{ count: string }>(
      `select count(*)::text as count from ${table('media')} where album_id = $1 and category = 'image'`,
      [c.req.param('id')],
    ).catch(() => null);
    await exec(`update ${table('albums')} set photo_count = $1, updated_at = $2 where id = $3`, [Number(count?.count || 0), nowUnix(), c.req.param('id')]).catch(() => {});
    return ok(c, { added: ids.length, photo_count: Number(count?.count || 0) });
  });
  app.delete('/api/v1/albums/:id/photos/:mediaId', auth, async (c) => {
    await exec(`update ${table('media')} set album_id = 0 where id = $1 and album_id = $2`, [c.req.param('mediaId'), c.req.param('id')]).catch(() => {});
    const count = await one<{ count: string }>(
      `select count(*)::text as count from ${table('media')} where album_id = $1 and category = 'image'`,
      [c.req.param('id')],
    ).catch(() => null);
    await exec(`update ${table('albums')} set photo_count = $1, updated_at = $2 where id = $3`, [Number(count?.count || 0), nowUnix(), c.req.param('id')]).catch(() => {});
    return ok(c, { removed: true, photo_count: Number(count?.count || 0) });
  });

  app.get('/api/v1/owner', async (c) => {
    const user = await one<Record<string, unknown>>(
      `select id, username, email, nickname, avatar, bio, url, role, coalesce(utterlog_avatar, '') as utterlog_avatar
       from ${table('users')} where role = 'admin' order by id limit 1`,
    ).catch(() => null);
    return ok(c, await ownerPublicPayload(user));
  });
  app.get('/api/v1/archive/stats', async (c) => {
    return ok(c, await archiveStatsPayload());
  });
  app.get('/api/v1/search', async (c) => {
    const q = searchParams(c).get('q') || '';
    const limit = Math.min(50, intParam(searchParams(c).get('limit') || undefined, 10));
    const query = q.trim();
    if (!query) return ok(c, { results: [], total: 0, mode: 'keyword' });

    const vector = await searchEmbedding(query).catch(() => null);
    if (vector) {
      const semanticRows = await many<Record<string, unknown>>(
        `select id, title, slug, excerpt, content, cover_url, published_at, created_at, updated_at,
                1 - (embedding <=> $1::vector) as score
         from ${table('posts')}
         where status = 'publish' and type = 'post' and embedding is not null
         order by embedding <=> $1::vector
         limit $2`,
        [vector, limit],
      ).catch(() => []);
      if (semanticRows.length > 0) {
        return ok(c, { results: semanticRows, total: semanticRows.length, mode: 'semantic' });
      }
    }

    const rows = await many<Record<string, unknown>>(
      `select * from ${table('posts')}
       where status = 'publish' and type = 'post' and (title ilike $1 or coalesce(excerpt,'') ilike $1 or coalesce(content,'') ilike $1)
       order by published_at desc nulls last, id desc
       limit $2`,
      [`%${query}%`, limit],
    );
    return ok(c, { results: rows, total: rows.length, mode: 'keyword' });
  });
  app.get('/api/v1/feed', async (c) => {
    const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
    const limit = rssItemLimit(opts);
    const posts = await loadPublishedPostsForFeed(limit);
    const xml = buildRssFeedXml(opts, posts);
    const etag = `"${createHash('sha1').update(xml).digest('hex')}"`;
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'public, max-age=300, must-revalidate',
        },
      });
    }
    return new Response(xml, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=300, must-revalidate',
        etag,
      },
    });
  });
	  app.get('/api/v1/system/status', async (c) => {
	    const geoProvider = await optionValue('ip_geo_provider', 'ipx');
	    const [postCount, commentCount, linkCount, dbVersion, hostIp] = await Promise.all([
	      one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type = 'post'`).catch(() => null),
	      one<{ count: string }>(`select count(*)::text as count from ${table('comments')}`).catch(() => null),
	      one<{ count: string }>(`select count(*)::text as count from ${table('links')}`).catch(() => null),
	      one<{ server_version: string }>(`show server_version`).catch(() => null),
	      resolveHostPublicIp(geoProvider),
	    ]);
	    const osInfo = getHostOsInfo();
	    const totalMemory = totalmem();
	    const freeMemory = freemem();
	    const disk = diskStats('/');
	    const cores = cpus().length || 1;
	    const memUsed = totalMemory - freeMemory;
	    const memPercent = totalMemory > 0 ? Math.round((memUsed / totalMemory) * 100) : 0;
	    const version = appVersion();
	    return ok(c, {
	      status: 'ok',
	      time: new Date().toISOString(),
	      bun: true,
	      version,
	      versions: {
	        app: version,
	        bun: Bun.version,
	      },
	      server: {
	        runtime: `Bun ${Bun.version}`,
	        app: 'utterlog-bun',
	        os: osInfo.label,
	        os_id: osInfo.id,
	        os_name: osInfo.name,
	        os_version: osInfo.version,
	        os_icon: osInfo.icon,
	        uptime: getHostUptimeLabel(),
	        uptime_seconds: getHostUptimeSeconds(),
	        ip: hostIp.ip,
	        country_code: hostIp.country_code,
	      },
      cpu: { cores, percent: getCpuPercent() },
      memory: {
        total: totalMemory,
        used: memUsed,
        total_gb: Number((totalMemory / 1024 / 1024 / 1024).toFixed(2)),
        used_gb: Number((memUsed / 1024 / 1024 / 1024).toFixed(2)),
        percent: memPercent,
      },
      disk,
      load: { avg: loadavg() },
	      database: {
	        connected: true,
	        driver: 'postgresql',
	        version: parsePostgresVersion(dbVersion?.server_version || ''),
	      },
      cache: { mode: 'memory' },
      counts: {
        posts: Number(postCount?.count || 0),
        comments: Number(commentCount?.count || 0),
        links: Number(linkCount?.count || 0),
      },
      posts: Number(postCount?.count || 0),
    });
  });
  app.get('/api/v1/admin/stats', auth, async (c) => {
    const timeZone = await siteTimeZone();
    const todayDate = await siteDate();
    const [archive, links, media, categories, tags, todayVisits, trend] = await Promise.all([
      archiveStatsPayload(),
      one<{ count: string }>(`select count(*)::text as count from ${table('links')}`).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('media')}`).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('metas')} where type = 'category'`).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('metas')} where type = 'tag'`).catch(() => null),
      one<{ count: string }>(
        `select count(*)::text as count from ${table('access_logs')}
         where (to_timestamp(created_at) at time zone $1)::date = $2::date`,
        [timeZone, todayDate],
      ).catch(() => null),
      many<Record<string, unknown>>(
        `select to_char(to_timestamp(created_at) at time zone $1, 'MM-DD') as date,
                count(*)::int as visits,
                count(distinct coalesce(nullif(visitor_id,''), ip))::int as visitors
         from ${table('access_logs')}
         where (to_timestamp(created_at) at time zone $1)::date >= ($2::date - interval '29 days')
         group by date
         order by date asc`,
        [timeZone, todayDate],
      ).catch(() => []),
    ]);
    return ok(c, {
      posts: archive.post_count,
      comments: archive.comment_count,
      links: Number(links?.count || 0),
      media: Number(media?.count || 0),
      categories: Number(categories?.count || 0),
      tags: Number(tags?.count || 0),
      total_views: archive.total_views,
      today_visits: Number(todayVisits?.count || 0),
      total_words: archive.word_count,
      days: archive.days,
      trend,
    });
  });
  app.get('/api/v1/analytics', auth, async (c) => {
    const period = searchParams(c).get('period') || '24h';
    return ok(c, await analyticsOverview(['24h', '7d', '30d', 'year', '365d', 'all'].includes(period) ? period : '24h'));
  });
  app.get('/api/v1/analytics/online', auth, async (c) => {
    const online = await enrichOnlineUsers(false);
    return ok(c, { online, count: online.length });
  });
  app.get('/api/v1/analytics/visitors', auth, async (c) => {
    const sp = searchParams(c);
    const { page, perPage, offset } = pageParams(sp);
    const maxRows = 1000;
    const cutoff = nowUnix() - 7 * 86400;
    const pageFilter = `
      path <> ''
      and path like '/%'
      and path not like '/api/%'
      and path not like '/admin%'
      and path not like '/uploads/%'
      and path not like '/_next/%'
      and path not like '/themes/%'
      and path not like '/static/%'
      and path not like '/.well-known/%'
      and path not like '/wp-%'
      and path not in ('/feed', '/feed/', '/rss', '/rss/', '/rss.xml', '/atom.xml', '/xmlrpc.php', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/manifest.json', '/ads.txt')
      and path !~ '\\.[A-Za-z0-9]{1,8}$'
      and created_at >= $1
    `;
    const entryCte = `
      with page_logs as (
        select id, ip, ip_masked, path, referer_host, browser, browser_version, os, os_version, device_type,
               country_name, country, region, city, duration, visitor_id, fingerprint, created_at,
               coalesce(nullif(fingerprint,''), nullif(visitor_id,''), nullif(ip,''), id::text) as visitor_key
        from ${table('access_logs')}
        where ${pageFilter}
      ),
      ordered as (
        select *, lag(created_at) over (partition by visitor_key order by created_at asc, id asc) as prev_created_at
        from page_logs
      ),
      marked as (
        select *, case when prev_created_at is null or created_at - prev_created_at > 1800 then 1 else 0 end as new_session
        from ordered
      ),
      sessions as (
        select *, sum(new_session) over (partition by visitor_key order by created_at asc, id asc) as session_no
        from marked
      ),
      latest_session as (
        select *,
               max(session_no) over (partition by visitor_key) as latest_session_no,
               max(created_at) over (partition by visitor_key, session_no) as session_last_at
        from sessions
      ),
      session_rows as (
        select *,
               min(created_at) over (partition by visitor_key, session_no) as session_start_at,
               max(created_at) over (partition by visitor_key, session_no) as session_end_at,
               greatest(
                 coalesce(sum(case when coalesce(duration,0) > 0 then duration else 0 end) over (partition by visitor_key, session_no), 0),
                 max(created_at) over (partition by visitor_key, session_no) - min(created_at) over (partition by visitor_key, session_no)
               )::int as session_duration,
               row_number() over (partition by visitor_key, session_no order by created_at asc, id asc) as entry_rank
        from latest_session
      ),
      entry_logs as (
        select id, ip, ip_masked, path, referer_host, browser, browser_version, os, os_version, device_type,
               country_name, country, region, city, session_duration as duration, visitor_id, fingerprint,
               session_start_at as created_at, session_end_at as session_last_at, visitor_key, session_no, entry_rank
        from session_rows
        where session_no = latest_session_no and entry_rank = 1
      )
    `;
    const totalRow = await one<{ count: string }>(
      `${entryCte} select count(*)::text as count from entry_logs where entry_rank = 1`,
      [cutoff],
    ).catch(() => null);
    const total = Math.min(Number(totalRow?.count || 0), maxRows);
    if (offset >= total) return paginate(c, [], total, page, perPage);
    const limit = Math.min(perPage, maxRows - offset);
    const rows = await many<Record<string, unknown>>(
      `${entryCte}
       select e.id, e.ip, e.ip_masked, e.path, e.referer_host as referer, e.browser, e.browser_version, e.os, e.os_version,
              e.device_type as device, e.country_name as country, e.country as country_code, e.region, e.city,
              coalesce(e.duration,0) as duration, e.visitor_id, e.fingerprint, e.created_at,
              cm.author_name, cm.author_email
       from entry_logs e
       left join lateral (
         select author_name, author_email from ${table('comments')} c
         where (e.visitor_id != '' and c.visitor_id = e.visitor_id)
            or (e.ip != '' and host(c.author_ip) = e.ip)
         order by case when e.visitor_id != '' and c.visitor_id = e.visitor_id then 0 else 1 end,
                  c.created_at desc, c.id desc limit 1
       ) cm on true
       where e.entry_rank = 1
       order by e.session_last_at desc, e.id desc limit $2 offset $3`,
      [cutoff, limit, offset],
    ).catch(() => []);
    const visitors = rows.map((row) => ({
      ...row,
      author_avatar: gravatarUrlForEmail(String(row.author_email || ''), 64),
    }));
    return paginate(c, visitors, total, page, perPage);
  });
  app.get('/api/v1/analytics/logs', auth, async (c) => {
    const sp = searchParams(c);
    const { page, perPage, offset } = pageParams(sp);
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')}`).catch(() => null);
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('access_logs')} order by created_at desc, id desc limit $1 offset $2`,
      [perPage, offset],
    ).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.get('/api/v1/analytics/geoip', auth, async (c) => {
    const sp = searchParams(c);
    const ip = sp.get('ip') || clientIp(c);
    const provider = normalizeGeoProvider(sp.get('provider') || await optionValue('ip_geo_provider', 'ipx'));
    const geo = await lookupGeoIp(ip, provider, 5000);
    if (!geo) {
      return c.json({ success: false, error: { code: 'GEOIP_ERROR', message: 'GeoIP lookup failed' } }, 502);
    }
    return ok(c, geo);
  });
  app.get('/api/v1/visitor/geo', async (c) => {
    const provider = await optionValue('ip_geo_provider', 'ipx');
    const geo = await lookupGeoIp(clientIp(c), provider, 3000);
    return ok(c, {
      country_code: geo?.country_code || '',
      country: geo?.country || '',
      province: geo?.province || '',
      city: geo?.city || '',
      provider: geo?.provider || '',
    });
  });
  app.get('/api/v1/analytics/map', auth, async (c) => {
    const period = searchParams(c).get('period') || '24h';
    const where = await analyticsWhere(['24h', '7d', '30d', 'year', '365d', 'all'].includes(period) ? period : '24h');
    const whereSql = where.sql
      ? `${where.sql} and (coalesce(country,'') != '' or coalesce(city,'') != '' or coalesce(latitude,0) != 0 or coalesce(longitude,0) != 0)`
      : `where coalesce(country,'') != '' or coalesce(city,'') != '' or coalesce(latitude,0) != 0 or coalesce(longitude,0) != 0`;
    const rows = await many<Record<string, unknown>>(
      `select country, country_name, region, city, latitude, longitude, count(*)::int as count
       from ${table('access_logs')}
       ${whereSql}
       group by country, country_name, region, city, latitude, longitude
       order by count(*) desc limit 500`,
      where.params,
    ).catch(() => []);
    const points = rows.map((row) => ({
      lat: Number(row.latitude || 0),
      lon: Number(row.longitude || 0),
      country: String(row.country_name || ''),
      city: String(row.city || ''),
      region: String(row.region || ''),
      code: String(row.country || ''),
      count: Number(row.count || 0),
    }));
    return ok(c, { points, rows });
  });
  app.get('/api/v1/analytics/breakdown', auth, async (c) => {
    const period = searchParams(c).get('period') || '24h';
    const dimension = searchParams(c).get('dimension') || 'all';
    const validPeriods = ['24h', '7d', '30d', 'year', '365d', 'all'];
    const validDimensions = ['browser', 'os', 'device', 'country', 'all'];
    if (!validPeriods.includes(period)) return badRequest(c, 'period 必须是 24h / 7d / 30d / year / 365d / all 之一');
    if (!validDimensions.includes(dimension)) return badRequest(c, 'dimension 必须是 browser / os / device / country / all 之一');
    const where = await analyticsWhere(period);
    const global = period === 'all'
      ? await one<{ views: string; uniques: string }>(
        `select coalesce(total_views,0)::text as views, coalesce(total_uniques,0)::text as uniques from ${table('stats_global')} where id = 1`,
      ).catch(() => null)
      : null;
    const visits = await visitsForPeriod(period, global);
    const uniqueVisitors = ['year', '365d'].includes(period)
      ? await one<{ count: string }>(
        `select count(distinct visitor_id)::text as count from ${table('stats_visitor_dates')} where date >= to_timestamp($1)::date`,
        [await periodStart(period)],
      ).catch(() => null)
      : await one<{ count: string }>(
        `select count(distinct coalesce(nullif(visitor_id,''), ip))::text as count from ${table('access_logs')} ${where.sql}`,
        where.params,
      ).catch(() => null);
    const result: Record<string, unknown> = {
      period,
      visits,
      unique_visitors: Number(global?.uniques || uniqueVisitors?.count || 0),
    };
    if (dimension === 'browser' || dimension === 'all') result.browsers = await dimensionRows('browser', period);
    if (dimension === 'os' || dimension === 'all') result.os = await dimensionRows('os', period);
    if (dimension === 'device' || dimension === 'all') result.devices = await dimensionRows('device_type', period);
    if (dimension === 'country' || dimension === 'all') result.countries = await countryDimensionRows(period);
    return ok(c, result);
  });

  app.get('/api/v1/themes', auth, async (c) => {
    const rawActive = await optionValue('active_theme', 'Azure');
    const activeTheme = normalizeBlogTheme(rawActive);
    const seen = new Set<string>();
    const themes = [runtimePaths.builtinThemesDir, join(config.contentDir, 'themes')]
      .flatMap((dir, dirIndex) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
        const themeJson = join(dir, d.name, 'theme.json');
        const manifestJson = join(dir, d.name, 'manifest.json');
        const manifestPath = existsSync(themeJson) ? themeJson : manifestJson;
        const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { name: d.name };
        const id = String(manifest.id || d.name);
        if (seen.has(id)) return null;
        seen.add(id);
        const screenshot = String(manifest.screenshot || '');
        const preview = resolveThemePreviewUrl(id, screenshot)
          || (typeof manifest.preview === 'string' && manifest.preview.startsWith('/') ? manifest.preview : '');
        return {
          ...manifest,
          id,
          kind: 'theme',
          builtin: dirIndex === 0,
          supported: id === 'Azure' || id === 'Nebula',
          preview,
          enabled: id === activeTheme,
        };
      }).filter(Boolean) : []);
    return ok(c, {
      themes,
      active: activeTheme,
      ...(rawActive !== activeTheme ? { requested: rawActive } : {}),
    });
  });
  app.get('/api/v1/plugins', auth, async (c) => {
    const activePlugins = JSON.parse(await optionValue('active_plugins', '[]') || '[]') as string[];
    const seen = new Set<string>();
    const plugins = [runtimePaths.builtinPluginsDir, join(config.contentDir, 'plugins')]
      .flatMap((dir, dirIndex) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
        const pluginJson = join(dir, d.name, 'plugin.json');
        const manifestJson = join(dir, d.name, 'manifest.json');
        const manifestPath = existsSync(pluginJson) ? pluginJson : manifestJson;
        const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { name: d.name };
        const id = String(manifest.id || d.name);
        if (seen.has(id)) return null;
        seen.add(id);
        return { ...manifest, id, kind: 'plugin', builtin: dirIndex === 0, enabled: activePlugins.includes(id) };
      }).filter(Boolean) : []);
    return ok(c, { plugins, active: activePlugins });
  });

  app.get('/api/v1/captcha/challenge', async (c) => {
    const mode = await captchaMode();
    if (mode === 'off') return ok(c, { enabled: false, mode: 'off' });
    if (mode === 'image') return ok(c, { enabled: true, mode: 'image' });
    const challenge = crypto.randomUUID().replaceAll('-', '');
    const difficulty = await captchaDifficulty();
    const expires = nowUnix() + 120;
    await ephemeral.set(`captcha:${challenge}`, `${difficulty}:${expires}`, 120);
    return ok(c, { enabled: true, mode: 'pow', challenge, difficulty, expires });
  });
  app.get('/api/v1/captcha/image', async (c) => {
    if (await captchaMode() !== 'image') return badRequest(c, '图片验证码未启用', 'WRONG_MODE');
    const code = randomCaptchaCode();
    const id = createHash('md5').update(`${Date.now()}-${clientIp(c)}-${code}-${Math.random()}`).digest('hex');
    await ephemeral.set(`captcha:img:${id}`, code.toLowerCase(), 300);
    return ok(c, { id, image: captchaSvgDataUrl(code) });
  });

  app.post('/api/v1/track', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const path = String(body.path || '/').slice(0, 500);
    const ip = clientIp(c);
    const visitor = String(body.visitor_id || body.fingerprint || ip);
    const ua = c.req.header('user-agent') || '';
    if (isBotUa(ua)) return ok(c, { tracked: false, reason: 'bot' });
    const parsed = parseUa(ua);
    const referer = String(body.referer || c.req.header('referer') || '').slice(0, 500);
    let refererHost = '';
    try { refererHost = referer ? new URL(referer).host : ''; } catch { refererHost = ''; }
    const geo = geoHeaders(c);
    const now = nowUnix();
    const today = await siteDate(new Date(now * 1000));
    const dailyDimensions: Array<[string, string, string]> = [
      ['browser', parsed.browser || 'Unknown', ''],
      ['os', parsed.os || 'Unknown', ''],
      ['device', parsed.device || 'Unknown', ''],
    ];
    if (geo.countryName || geo.country) dailyDimensions.push(['country', geo.countryName || geo.country, geo.country || '']);
    const trackedPostId = Number(body.post_id || await postIdFromTrackedPath(path) || 0);
    let accessLogId = 0;
    try {
      await sql.begin(async (tx) => {
        const siteVisitorRows = await tx.unsafe<{ inserted: boolean }[]>(
          `insert into ${table('stats_visitor_dates')} (visitor_id, date) values ($1, $2::date)
           on conflict (visitor_id, date) do update set visitor_id = excluded.visitor_id
           returning (xmax = 0) as inserted`,
          [visitor, today],
        );
        const uniqueInc = siteVisitorRows[0]?.inserted ? 1 : 0;
        const accessRows = await tx.unsafe<{ id: number }[]>(
          `insert into ${table('access_logs')}
           (ip, ip_masked, path, method, referer, referer_host, user_agent, device_type, browser, os,
            country, country_name, region, city, latitude, longitude, created_at, visitor_id, fingerprint)
           values ($1,$2,$3,'GET',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           returning id`,
          [
            ip, maskIp(ip), path, referer, refererHost, ua, parsed.device, parsed.browser, parsed.os,
            geo.country, geo.countryName, geo.region, geo.city, geo.latitude, geo.longitude,
            now, String(body.visitor_id || ''), String(body.fingerprint || ''),
          ],
        );
        accessLogId = Number(accessRows[0]?.id || 0);
        await tx.unsafe(
          `update ${table('stats_global')} set total_views = total_views + 1,
           total_uniques = total_uniques + $2,
           first_event_at = case when first_event_at = 0 then $1 else first_event_at end,
           updated_at = $1 where id = 1`,
          [now, uniqueInc],
        );
        await tx.unsafe(
          `insert into ${table('stats_daily')} (date, dimension, dim_value, visits, unique_visitors)
           values ($1::date, '_total', '', 1, $2)
           on conflict (date, dimension, dim_value, dim_extra) do update set
             visits = ${table('stats_daily')}.visits + 1,
             unique_visitors = ${table('stats_daily')}.unique_visitors + excluded.unique_visitors`,
          [today, uniqueInc],
        );
        for (const [dimension, value, extra] of dailyDimensions) {
          await tx.unsafe(
            `insert into ${table('stats_daily')} (date, dimension, dim_value, dim_extra, visits, unique_visitors)
             values ($1::date, $2, $3, $4, 1, $5)
             on conflict (date, dimension, dim_value, dim_extra) do update set
               visits = ${table('stats_daily')}.visits + 1,
               unique_visitors = ${table('stats_daily')}.unique_visitors + excluded.unique_visitors`,
            [today, dimension, value, extra, uniqueInc],
          );
        }
        if (trackedPostId > 0) {
          const postVisitorRows = await tx.unsafe<{ inserted: boolean }[]>(
            `insert into ${table('stats_visitor_post_dates')} (visitor_id, post_id, date) values ($1, $2, $3::date)
             on conflict (visitor_id, post_id, date) do update set visitor_id = excluded.visitor_id
             returning (xmax = 0) as inserted`,
            [visitor, trackedPostId, today],
          );
          const postUniqueInc = postVisitorRows[0]?.inserted ? 1 : 0;
          await tx.unsafe(
            `insert into ${table('stats_post_daily')} (post_id, date, views, unique_visitors)
             values ($1, $2::date, 0, $3)
             on conflict (post_id, date) do update set
               unique_visitors = ${table('stats_post_daily')}.unique_visitors + excluded.unique_visitors`,
            [trackedPostId, today, postUniqueInc],
          );
        }
      });
    } catch (err) {
      console.error('[analytics] track write failed', err);
      return ok(c, { tracked: false, reason: 'write_failed' });
    }
    if (accessLogId && (!geo.country || !geo.latitude || !geo.longitude)) {
      void enrichAccessGeo(accessLogId, ip);
    }
    if (visitor) await ephemeral.set(`online:${visitor}`, JSON.stringify({ visitor_id: visitor, ip, path, ts: now, country_code: geo.country, city: geo.city }), 300);
    return ok(c, { tracked: true });
  });
  app.post('/api/v1/track/duration', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const duration = Math.max(0, Math.min(86400, Number(body.duration || 0)));
    const path = String(body.path || '').slice(0, 500);
    if (duration > 0 && path) {
      await exec(
        `update ${table('access_logs')} set duration = greatest(coalesce(duration,0), $1)
         where id = (
           select id from ${table('access_logs')} where ip = $2 and path = $3 order by created_at desc, id desc limit 1
         )`,
        [duration, clientIp(c), path],
      ).catch(() => {});
    }
    return ok(c, null);
  });
  app.get('/api/v1/online', async (c) => {
    const showOnline = (await optionValue('show_online_visitors', '1')).toLowerCase();
    if (showOnline === '0' || showOnline === 'false') return ok(c, { count: 0, online: [], enabled: false });
    const online = await enrichOnlineUsers(true);
    return ok(c, { count: online.length, online, enabled: true });
  });
}
