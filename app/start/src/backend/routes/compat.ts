import { decodeJwt, jwtVerify, SignJWT } from 'jose';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, posix } from 'node:path';
import { signAccessToken, signRefreshToken, verifyAccessToken } from '../auth/jwt';
import { config, table } from '../config';
import { exec, intParam, many, nowUnix, one, pageParams } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';
import { sendConfiguredEmail } from '../email';
import { assertPublicHttpUrl, normalizePublicHttpUrl } from '../http/public-url';
import { publicStorageUrl, putStorageObject, storageSettings, storeUploadedBytes } from '../media/storage';
import { runtimePaths } from '../paths';
import { ephemeral } from '../store/ephemeral';
import { appVersion } from '../system/metrics';
import { defaultWeatherLocation, fetchVisitorWeather, visitorWeatherLocation } from '../weather';
import { runSyncFinishWorker } from '../sync/worker';
import { lookupGeoIp, normalizeGeoProvider, publicIpForGeo } from '../geoip';
import { sendFollowTelegram } from '../telegram';
import { botSqlPattern } from '../bot-detect';

function safeId(id: unknown) {
  const clean = String(id || '').trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(clean) ? clean : '';
}

function parseJsonOption<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function base64urlToBuffer(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '='), 'base64');
}

function bufferToBase64url(value: Uint8Array | Buffer) {
  return Buffer.from(value).toString('base64url');
}

async function webAuthnRp() {
  const configured = (await optionValue('site_url', config.appUrl)).trim() || config.appUrl;
  const appURL = configured.replace(/\/+$/, '') || 'http://localhost:9260';
  const parsed = new URL(appURL);
  return { origin: appURL, rpID: parsed.hostname };
}

function webAuthnUserId(userId: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(userId));
  return buf;
}

async function siteOwner() {
  return one<{ id: number; username: string; email: string; nickname: string | null; avatar: string | null; role: string }>(
    `select id, username, email, nickname, avatar, role from ${table('users')} where role = 'admin' order by id asc limit 1`,
  );
}

function avatarHash(email: string) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

async function displayAvatarForEmail(email: string) {
  const hash = avatarHash(email);
  return (await optionValue('avatar_source', 'gravatar')) === 'utterlog'
    ? `https://id.utterlog.com/avatar/${hash}`
    : `https://gravatar.bluecdn.com/avatar/${hash}?s=128&d=mp`;
}

async function issueCompatTokens(user: { id: number; username: string; email: string; nickname: string | null; role: string; avatar?: string | null }) {
  const data = { username: user.username, email: user.email, role: user.role, nickname: user.nickname || user.username };
  const access = await signAccessToken(user.id, data);
  const avatar = await displayAvatarForEmail(user.email);
  return {
    access_token: access.token,
    refresh_token: await signRefreshToken(user.id),
    expires_in: 86400,
    expires_at: access.expiresAt,
    token_type: 'Bearer',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname || user.username,
      avatar,
      role: user.role,
    },
  };
}

async function signFederationToken(user: { id: number; username: string; email: string; nickname: string | null; avatar?: string | null }) {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const token = await new SignJWT({
    username: user.username,
    nickname: user.nickname || user.username,
    email: user.email,
    avatar: user.avatar || '',
    site: config.appUrl,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.appUrl)
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
  await exec(
    `insert into ${table('federation_tokens')} (user_id, token, expires_at, created_at) values ($1,$2,$3,$4)`,
    [user.id, token, exp, nowUnix()],
  ).catch(() => {});
  return token;
}

async function verifyFederationTokenLocal(token: string) {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const verified = await jwtVerify(token, secret, { issuer: config.appUrl });
  return verified.payload as Record<string, any>;
}


function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}


async function runCommand(cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, PGPASSWORD: config.dbPassword } });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

async function restoreExtractedFiles(root: string) {
  const uploadsRoot = join(root, 'uploads');
  const contentRoot = join(root, 'content');
  if (existsSync(uploadsRoot)) await cp(uploadsRoot, config.uploadDir, { recursive: true, force: true });
  if (existsSync(contentRoot)) await cp(contentRoot, config.contentDir, { recursive: true, force: true });
}



function simpleSlug(input: unknown) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || randomUUID().slice(0, 8);
}

function syncCollisionSlug(base: string, siteUuid: string, sourceId: string, attempt: number) {
  const suffix = `${siteUuid.slice(0, 8)}-${sourceId || randomUUID().slice(0, 8)}${attempt > 1 ? `-${attempt}` : ''}`.replace(/[^\p{Letter}\p{Number}-]+/gu, '-');
  return `${base.slice(0, Math.max(20, 180 - suffix.length - 1))}-${suffix}`;
}


async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(input: string) {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return named[entity] ?? `&${entity};`;
  });
}

function cleanFeedText(input: string) {
  const text = decodeEntities(input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function xmlTag(block: string, tag: string) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  return match ? cleanFeedText(match[1] || '') : '';
}

function xmlRawTag(block: string, tag: string) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  return match ? decodeEntities((match[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : '';
}

function wxrTag(block: string, tag: string) {
  return xmlRawTag(block, tag) || xmlRawTag(block, tag.replace(':', '_'));
}

function wxrDate(value: string) {
  const parsed = Date.parse(value.replace(' ', 'T'));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : nowUnix();
}

function wxrDecodeSlug(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function wxrAttr(attrs: string, name: string) {
  return new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(attrs)?.[1] || '';
}

function wxrPostMeta(block: string, key: string) {
  for (const metaBlock of [...block.matchAll(/<wp_postmeta(?:\s[^>]*)?>[\s\S]*?<\/wp_postmeta>/gi)].map((m) => m[0])) {
    if (wxrTag(metaBlock, 'wp_meta_key') === key) return wxrTag(metaBlock, 'wp_meta_value');
  }
  return '';
}

function wxrCommentAgent(block: string) {
  const info = [...block.matchAll(/<wp_commentmeta(?:\s[^>]*)?>[\s\S]*?<\/wp_commentmeta>/gi)]
    .map((m) => m[0])
    .find((metaBlock) => wxrTag(metaBlock, 'wp_meta_key') === '_comment_info');
  if (!info) return '';
  const value = wxrTag(info, 'wp_meta_value');
  const extract = (key: string) => {
    const match = new RegExp(`"${key}";s:\\d+:"([^"]*)"`, 'i').exec(value);
    return match?.[1] || '';
  };
  return [extract('os'), extract('browser')].filter(Boolean).join(' / ');
}

async function ensureImportedMeta(name: string, type: 'category' | 'tag', sourceId: string, slugValue = '', description = '') {
  const title = name.trim();
  if (!title) return 0;
  const decodedSlug = wxrDecodeSlug(slugValue || sourceId || title);
  const slug = decodedSlug ? simpleSlug(decodedSlug) : simpleSlug(title);
  const existing = await one<{ id: number }>(
    `select id from ${table('metas')} where slug = $1 and type = $2 limit 1`,
    [slug, type],
  ).catch(() => null);
  if (existing?.id) return existing.id;
  const row = await one<{ id: number }>(
    `insert into ${table('metas')} (name, slug, type, description, source_type, source_id, created_at, updated_at)
     values ($1,$2,$3,$4,'wordpress',$5,$6,$6)
     on conflict (slug, type) do update set name = excluded.name, description = excluded.description
     returning id`,
    [title, slug, type, description, sourceId, nowUnix()],
  ).catch(() => null);
  return row?.id || 0;
}

async function importWordPressWxr(xml: string, userId: number) {
  const normalized = xml
    .replaceAll('content:encoded', 'content_encoded')
    .replaceAll('excerpt:encoded', 'excerpt_encoded')
    .replaceAll('dc:creator', 'dc_creator')
    .replaceAll('wp:', 'wp_')
    .replaceAll('wfw:', 'wfw_');
  const itemBlocks = [...normalized.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const categoryBlocks = [...normalized.matchAll(/<wp_category(?:\s[^>]*)?>[\s\S]*?<\/wp_category>/gi)].map((m) => m[0]);
  const tagBlocks = [...normalized.matchAll(/<wp_tag(?:\s[^>]*)?>[\s\S]*?<\/wp_tag>/gi)].map((m) => m[0]);
  let posts = 0;
  let pages = 0;
  let comments = 0;
  let categories = 0;
  let tags = 0;
  const skipped: string[] = [];
  const metaBySource = new Map<string, number>();
  const commentBySource = new Map<string, number>();

  for (const block of categoryBlocks) {
    const sourceId = wxrTag(block, 'wp_term_id') || wxrTag(block, 'wp_category_nicename');
    const id = await ensureImportedMeta(
      wxrTag(block, 'wp_cat_name'),
      'category',
      sourceId,
      wxrTag(block, 'wp_category_nicename'),
      wxrTag(block, 'wp_category_description'),
    );
    if (id) {
      metaBySource.set(`category:${wxrTag(block, 'wp_category_nicename') || sourceId}`, id);
      categories++;
    }
  }

  for (const block of tagBlocks) {
    const sourceId = wxrTag(block, 'wp_term_id') || wxrTag(block, 'wp_tag_slug');
    const id = await ensureImportedMeta(wxrTag(block, 'wp_tag_name'), 'tag', sourceId, wxrTag(block, 'wp_tag_slug'));
    if (id) {
      metaBySource.set(`tag:${wxrTag(block, 'wp_tag_slug') || sourceId}`, id);
      tags++;
    }
  }

  for (const block of itemBlocks) {
    const postType = (wxrTag(block, 'wp_post_type') || 'post').toLowerCase();
    if (!['post', 'page'].includes(postType)) continue;
    const status = (wxrTag(block, 'wp_status') || 'draft').toLowerCase() === 'publish' ? 'publish' : 'draft';
    const title = wxrTag(block, 'title') || '(untitled)';
    const slug = simpleSlug(wxrDecodeSlug(wxrTag(block, 'wp_post_name')) || title);
    const sourceId = wxrTag(block, 'wp_post_id');
    const createdAt = wxrDate(wxrTag(block, 'wp_post_date_gmt') || wxrTag(block, 'wp_post_date'));
    const publishedAt = status === 'publish' ? new Date(createdAt * 1000) : null;
    const viewCount = Number.parseInt(wxrPostMeta(block, 'post_views') || '0', 10) || 0;
    const existing = sourceId
      ? await one<{ id: number }>(
        `select id from ${table('posts')} where source_type = 'wordpress' and source_id = $1 limit 1`,
        [sourceId],
      ).catch(() => null)
      : null;
    const params = [
      title,
      slug,
      wxrTag(block, 'content_encoded'),
      wxrTag(block, 'excerpt_encoded'),
      userId || 1,
      status,
      postType,
      createdAt,
      nowUnix(),
      viewCount,
      publishedAt,
      sourceId,
    ];
    const row = existing?.id
      ? await one<{ id: number }>(
        `update ${table('posts')} set title=$1, slug=$2, content=$3, excerpt=$4, author_id=$5, status=$6, type=$7,
           created_at=$8, updated_at=$9, view_count=$10, published_at=$11, source_type='wordpress', source_id=$12
         where id=$13 returning id`,
        [...params, existing.id],
      )
      : await one<{ id: number }>(
        `insert into ${table('posts')} (title, slug, content, excerpt, author_id, status, type, created_at, updated_at, view_count, published_at, source_type, source_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'wordpress',$12)
         on conflict (slug) where deleted_at = 0 do update set title = excluded.title, content = excluded.content, excerpt = excluded.excerpt, updated_at = excluded.updated_at
         returning id`,
        params,
      ).catch((err) => {
        skipped.push(`${title}: ${err instanceof Error ? err.message : 'insert failed'}`);
        return null;
      });
    const postId = row?.id || 0;
    if (!postId) continue;
    if (postType === 'page') pages++; else posts++;

    await exec(`delete from ${table('relationships')} where post_id = $1`, [postId]).catch(() => {});
    for (const cat of [...block.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/gi)]) {
      const attrs = cat[1] || '';
      const text = decodeEntities((cat[2] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
      const domain = wxrAttr(attrs, 'domain');
      const type = domain === 'post_tag' ? 'tag' : 'category';
      const nicename = wxrAttr(attrs, 'nicename');
      const metaId = metaBySource.get(`${type}:${nicename}`) || await ensureImportedMeta(text, type, nicename || text, nicename);
      if (metaId) await exec(`insert into ${table('relationships')} (post_id, meta_id, created_at) values ($1,$2,$3) on conflict do nothing`, [postId, metaId, nowUnix()]).catch(() => {});
    }

    for (const cBlock of [...block.matchAll(/<wp_comment(?:\s[^>]*)?>[\s\S]*?<\/wp_comment>/gi)].map((m) => m[0])) {
      const approved = wxrTag(cBlock, 'wp_comment_approved') === '1' ? 'approved' : 'pending';
      const content = wxrTag(cBlock, 'wp_comment_content');
      if (!content.trim()) continue;
      const commentSourceId = wxrTag(cBlock, 'wp_comment_id');
      const parentSourceId = wxrTag(cBlock, 'wp_comment_parent');
      const parentId = parentSourceId ? commentBySource.get(parentSourceId) || 0 : 0;
      const commentValues = [
        postId,
        wxrTag(cBlock, 'wp_comment_author') || '匿名',
        wxrTag(cBlock, 'wp_comment_author_email'),
        wxrTag(cBlock, 'wp_comment_author_url'),
        syncSafeIp(wxrTag(cBlock, 'wp_comment_author_IP')),
        syncTruncate(wxrCommentAgent(cBlock), 511),
        content,
        parentId,
        approved,
        commentSourceId,
        wxrDate(wxrTag(cBlock, 'wp_comment_date_gmt') || wxrTag(cBlock, 'wp_comment_date')),
      ];
      const existingComment = commentSourceId ? await one<{ id: number }>(
        `select id from ${table('comments')} where post_id = $1 and source = 'wordpress' and source_id = $2 limit 1`,
        [postId, commentSourceId],
      ).catch(() => null) : null;
      const commentRow = existingComment?.id
        ? await one<{ id: number }>(
          `update ${table('comments')} set post_id=$1, author_name=$2, author_email=$3, author_url=$4,
             author_ip=$5::inet, author_agent=$6, content=$7, parent_id=$8, status=$9,
             source='wordpress', source_id=$10, created_at=$11, updated_at=$11
           where id=$12 returning id`,
          [...commentValues, existingComment.id],
        ).catch(() => null)
        : await one<{ id: number }>(
          `insert into ${table('comments')} (post_id, author_name, author_email, author_url, author_ip, author_agent, content, parent_id, status, source, source_id, created_at, updated_at)
           values ($1,$2,$3,$4,$5::inet,$6,$7,$8,$9,'wordpress',$10,$11,$11)
           returning id`,
          commentValues,
        ).catch(() => null);
      if (commentRow?.id) {
        if (commentSourceId) commentBySource.set(commentSourceId, commentRow.id);
        comments++;
      }
    }
    await exec(
      `update ${table('posts')} set comment_count = (
        select count(*) from ${table('comments')} where post_id = $1 and status = 'approved'
      ) where id = $1`,
      [postId],
    ).catch(() => {});
  }
  await exec(
    `update ${table('metas')} m set count = coalesce(sub.c, 0)
     from (select meta_id, count(*)::int as c from ${table('relationships')} group by meta_id) sub
     where m.id = sub.meta_id`,
  ).catch(() => {});
  await exec(
    `update ${table('metas')} set count = 0
     where id not in (select meta_id from ${table('relationships')})`,
  ).catch(() => {});
  return { posts, pages, categories, tags, comments, skipped: skipped.slice(0, 20) };
}

type FeedFetchFailure = { id: number; feed_url: string; error: string };

type FeedFetchProgress = {
  running: boolean;
  force: boolean;
  started_at: number;
  finished_at: number;
  total: number;
  done: number;
  fetched: number;
  new_items: number;
  failed: number;
  failed_urls: FeedFetchFailure[];
  current_url: string;
  pruned_subscriptions: number;
  pruned_items: number;
  refreshed_items_deleted: number;
  message: string;
};

type FeedFetchOptions = {
  limit?: number;
  force?: boolean;
  trackProgress?: boolean;
  cleanupOrphans?: boolean;
};

const emptyFeedFetchProgress = (): FeedFetchProgress => ({
  running: false,
  force: false,
  started_at: 0,
  finished_at: 0,
  total: 0,
  done: 0,
  fetched: 0,
  new_items: 0,
  failed: 0,
  failed_urls: [],
  current_url: '',
  pruned_subscriptions: 0,
  pruned_items: 0,
  refreshed_items_deleted: 0,
  message: '',
});

let feedFetchProgress: FeedFetchProgress = emptyFeedFetchProgress();

function feedFetchStatusPath() {
  return process.env.FEED_FETCH_STATUS_FILE || join(config.contentDir, 'feed-fetch-status.json');
}

function normalizeFeedFetchProgress(value: unknown): FeedFetchProgress {
  const fallback = emptyFeedFetchProgress();
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<FeedFetchProgress>;
  return {
    running: false,
    force: raw.force === true,
    started_at: Number(raw.started_at || 0),
    finished_at: Number(raw.finished_at || 0),
    total: Number(raw.total || 0),
    done: Number(raw.done || 0),
    fetched: Number(raw.fetched || 0),
    new_items: Number(raw.new_items || 0),
    failed: Number(raw.failed || 0),
    failed_urls: Array.isArray(raw.failed_urls) ? raw.failed_urls.slice(-20) as FeedFetchFailure[] : [],
    current_url: '',
    pruned_subscriptions: Number(raw.pruned_subscriptions || 0),
    pruned_items: Number(raw.pruned_items || 0),
    refreshed_items_deleted: Number(raw.refreshed_items_deleted || 0),
    message: String(raw.message || ''),
  };
}

function loadFeedFetchProgress() {
  try {
    const path = feedFetchStatusPath();
    if (!existsSync(path)) return emptyFeedFetchProgress();
    return normalizeFeedFetchProgress(parseJsonOption(readFileSync(path, 'utf8'), emptyFeedFetchProgress()));
  } catch {
    return emptyFeedFetchProgress();
  }
}

function saveFeedFetchProgress() {
  try {
    const path = feedFetchStatusPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(feedFetchStatus(), null, 2)}\n`);
  } catch (err) {
    console.error('failed to persist feed fetch status:', err);
  }
}

feedFetchProgress = loadFeedFetchProgress();

function feedFetchStatus() {
  return { ...feedFetchProgress, failed_urls: [...feedFetchProgress.failed_urls] };
}

function feedErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err || '拉取失败');
}

function parseFeedDate(value: string, fallback = 0) {
  const text = value.trim();
  if (!text) return fallback;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return fallback;
  const ts = Math.floor(parsed / 1000);
  return ts > 0 && ts < 2147483000 ? ts : fallback;
}

async function fetchRssFeed(feedUrl: string) {
  const safeFeedUrl = await assertPublicHttpUrl(feedUrl);
  const res = await fetch(safeFeedUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Utterlog RSS Fetcher/1.0)',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > 5 * 1024 * 1024) throw new Error('RSS 响应过大');
  const xml = await res.text();
  if (xml.length > 5 * 1024 * 1024) throw new Error('RSS 响应过大');
  const itemBlocks = [...xml.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const entryBlocks = itemBlocks.length ? itemBlocks : [...xml.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return entryBlocks.map((block) => {
    const linkMatch = /<link(?:\s[^>]*)?\s+href=["']([^"']+)["'][^>]*\/?>/i.exec(block);
    const link = xmlTag(block, 'link') || cleanFeedText(linkMatch?.[1] || '');
    const guid = xmlTag(block, 'guid') || xmlTag(block, 'id') || link;
    return {
      title: xmlTag(block, 'title'),
      link,
      description: xmlTag(block, 'description') || xmlTag(block, 'summary') || xmlTag(block, 'content'),
      pub_date: parseFeedDate(xmlTag(block, 'pubDate') || xmlTag(block, 'published') || xmlTag(block, 'updated'), 0),
      guid,
    };
  }).filter((item) => item.title || item.link);
}

async function mirrorLinkSubscriptions() {
  await exec(
    `insert into ${table('rss_subscriptions')} (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
     select 1, l.url, l.rss_url, l.name, coalesce(l.logo,''), 0, extract(epoch from now())::bigint
     from ${table('links')} l
     where l.rss_url is not null and l.rss_url <> ''
     on conflict (user_id, feed_url) do update set
       site_url = excluded.site_url,
       site_name = excluded.site_name,
       site_avatar = excluded.site_avatar`,
  ).catch(() => {});
}

async function pruneOrphanLinkSubscriptions() {
  const rows = await many<{ id: number }>(
    `select rs.id
     from ${table('rss_subscriptions')} rs
     where rs.user_id = 1
       and coalesce(rs.feed_url, '') != ''
       and not exists (
         select 1 from ${table('links')} l
         where coalesce(l.rss_url, '') = rs.feed_url
            or coalesce(l.url, '') = rs.site_url
       )
       and not exists (
         select 1 from ${table('followers')} f
         where f.user_id = rs.user_id
           and coalesce(f.source_site, '') = coalesce(rs.site_url, '')
       )`,
  ).catch(() => []);
  const ids = rows.map((row) => Number(row.id)).filter(Boolean);
  if (ids.length === 0) return { pruned_subscriptions: 0, pruned_items: 0 };
  const deletedItems = await execChanged(`delete from ${table('feed_items')} where subscription_id = any($1::int[])`, [ids]);
  const deletedSubs = await execChanged(`delete from ${table('rss_subscriptions')} where id = any($1::int[])`, [ids]);
  return { pruned_subscriptions: deletedSubs, pruned_items: deletedItems };
}

export async function runFeedFetch(options: number | FeedFetchOptions = 0) {
  const opts: FeedFetchOptions = typeof options === 'number' ? { limit: options } : options;
  const limit = Number(opts.limit || 0);
  const force = !!opts.force;
  const trackProgress = !!opts.trackProgress;
  if (feedFetchProgress.running && !trackProgress) {
    return { ...feedFetchStatus(), skipped: true };
  }
  let prunedSubscriptions = 0;
  let prunedItems = 0;
  await mirrorLinkSubscriptions();
  if (opts.cleanupOrphans) {
    const pruned = await pruneOrphanLinkSubscriptions();
    prunedSubscriptions = pruned.pruned_subscriptions;
    prunedItems = pruned.pruned_items;
  }
  const subs = await many<{ id: number; feed_url: string }>(
    `select id, feed_url from ${table('rss_subscriptions')} order by last_fetched_at asc ${limit > 0 ? `limit ${limit}` : ''}`,
  ).catch(() => []);
  feedFetchProgress = {
    ...emptyFeedFetchProgress(),
    running: true,
    force,
    started_at: nowUnix(),
    total: subs.length,
    pruned_subscriptions: prunedSubscriptions,
    pruned_items: prunedItems,
    message: subs.length ? '正在刷新订阅' : '没有可刷新的订阅',
  };
  saveFeedFetchProgress();
  let fetched = 0;
  let newItems = 0;
  let failed = 0;
  let refreshedItemsDeleted = 0;
  const failures: FeedFetchFailure[] = [];
  for (const sub of subs) {
    feedFetchProgress.current_url = sub.feed_url;
    feedFetchProgress.message = `正在刷新 ${sub.feed_url}`;
    saveFeedFetchProgress();
    let items: Awaited<ReturnType<typeof fetchRssFeed>> = [];
    try {
      items = await fetchRssFeed(sub.feed_url);
    } catch (err) {
      failed++;
      failures.push({ id: sub.id, feed_url: sub.feed_url, error: feedErrorMessage(err) });
      feedFetchProgress.failed = failed;
      feedFetchProgress.failed_urls = failures.slice(-20);
      feedFetchProgress.done++;
      saveFeedFetchProgress();
      continue;
    }
    fetched++;
    const now = nowUnix();
    if (force) {
      refreshedItemsDeleted += await execChanged(`delete from ${table('feed_items')} where subscription_id = $1`, [sub.id]);
    }
    for (const item of items) {
      const result = await exec(
        `insert into ${table('feed_items')} (subscription_id, title, link, description, pub_date, guid, created_at)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
        [sub.id, item.title, item.link, item.description, item.pub_date, item.guid, now],
      ).catch(() => null);
      if (rowsChanged(result)) newItems++;
    }
    await exec(`update ${table('rss_subscriptions')} set last_fetched_at = $1 where id = $2`, [now, sub.id]).catch(() => {});
    feedFetchProgress.done++;
    feedFetchProgress.fetched = fetched;
    feedFetchProgress.new_items = newItems;
    feedFetchProgress.refreshed_items_deleted = refreshedItemsDeleted;
    saveFeedFetchProgress();
  }
  await exec(`delete from ${table('feed_items')} where created_at < $1`, [nowUnix() - 7 * 24 * 3600]).catch(() => {});
  if (newItems > 0) {
    await exec(
      `insert into ${table('notifications')} (user_id, type, title, content, created_at)
       values (1,'feed','关注动态更新',$1,$2)`,
      [`发现 ${newItems} 条新内容`, nowUnix()],
    ).catch(() => {});
  }
  const result = {
    total: subs.length,
    fetched,
    new_items: newItems,
    failed,
    failed_urls: failures.slice(-20),
    force,
    pruned_subscriptions: prunedSubscriptions,
    pruned_items: prunedItems,
    refreshed_items_deleted: refreshedItemsDeleted,
  };
  feedFetchProgress = {
    ...feedFetchProgress,
    running: false,
    finished_at: nowUnix(),
    total: subs.length,
    done: subs.length,
    fetched,
    new_items: newItems,
    failed,
    failed_urls: failures.slice(-20),
    current_url: '',
    refreshed_items_deleted: refreshedItemsDeleted,
    message: failed > 0 ? '刷新完成，部分订阅失败' : '刷新完成',
  };
  saveFeedFetchProgress();
  return result;
}

function rowsChanged(result: unknown) {
  if (result && typeof result === 'object' && 'count' in result) return Number((result as { count?: number }).count || 0);
  return 0;
}

async function execChanged(query: string, params: unknown[] = []) {
  return rowsChanged(await exec(query, params).catch(() => null));
}

function contentWordCount(content: unknown) {
  const text = cleanFeedText(String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/[#>*_\-~|]/g, ' '));
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;
  return cjk + words;
}

function safeUploadPath(rel: string) {
  const normalized = String(rel || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return '';
  const clean = posix.normalize(normalized);
  if (!clean || clean === '.' || clean === '..' || clean.startsWith('../') || clean.startsWith('/')) return '';
  return join(config.uploadDir, clean);
}

function localUploadPathFromFilename(filename: string) {
  return safeUploadPath(filename);
}

function localUploadPathFromURL(raw: string) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  let pathValue = trimmed;
  try {
    pathValue = new URL(trimmed, 'http://utterlog.local').pathname;
  } catch {
    pathValue = trimmed;
  }
  const idx = pathValue.indexOf('/uploads/');
  if (idx < 0) return '';
  return safeUploadPath(pathValue.slice(idx + '/uploads/'.length));
}

function localUploadMissing(...paths: string[]) {
  let checked = false;
  for (const path of paths) {
    if (!path) continue;
    checked = true;
    try {
      statSync(path);
      return false;
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code || '') : '';
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return false;
    }
  }
  return checked;
}

async function findMissingLocalMediaIds() {
  const rows = await many<{ id: number; filename: string; url: string }>(
    `select id, coalesce(filename, '') as filename, coalesce(url, '') as url
     from ${table('media')}
     where coalesce(driver, '') = '' or lower(coalesce(driver, '')) = 'local'`,
  );
  const ids: number[] = [];
  for (const row of rows) {
    if (localUploadMissing(localUploadPathFromFilename(row.filename), localUploadPathFromURL(row.url))) ids.push(Number(row.id));
  }
  return ids;
}

async function findStaleAlbumCoverIds() {
  const rows = await many<{ id: number; cover_url: string }>(
    `select id, coalesce(cover_url, '') as cover_url
     from ${table('albums')}
     where cover_url like '/uploads/%'`,
  );
  const ids: number[] = [];
  for (const row of rows) {
    if (localUploadMissing(localUploadPathFromURL(row.cover_url))) ids.push(Number(row.id));
  }
  return ids;
}

async function clearEphemeralCache() {
  let cleared = 0;
  for (const prefix of ['captcha:', 'online:', 'coding:', 'weather:', 'reader-chat:', 'ai:batch:']) {
    for (const key of await ephemeral.scan(prefix)) {
      await ephemeral.del(key);
      cleared++;
    }
  }
  return cleared;
}

async function rebuildStats() {
  const result: Record<string, number> = {};
  result.meta_count_updated = await execChanged(
    `update ${table('metas')} m set count = coalesce(sub.c, 0)
     from (select meta_id, count(*) as c from ${table('relationships')} group by meta_id) sub
     where m.id = sub.meta_id and m.count is distinct from sub.c`,
  );
  await exec(`update ${table('metas')} set count = 0 where count > 0 and id not in (select distinct meta_id from ${table('relationships')})`).catch(() => {});
  result.comment_count_updated = await execChanged(
    `update ${table('posts')} p set comment_count = coalesce(sub.c, 0)
     from (select post_id, count(*) as c from ${table('comments')} where status = 'approved' group by post_id) sub
     where p.id = sub.post_id and p.comment_count is distinct from sub.c`,
  );
  await exec(
    `update ${table('posts')} set comment_count = 0 where comment_count > 0
     and id not in (select post_id from ${table('comments')} where status='approved')`,
  ).catch(() => {});
  let wordCountUpdated = 0;
  const posts = await many<{ id: number; content: string; word_count: number }>(
    `select id, coalesce(content,'') as content, coalesce(word_count,0) as word_count from ${table('posts')} where type = 'post'`,
  ).catch(() => []);
  for (const post of posts) {
    const count = contentWordCount(post.content);
    if (count === Number(post.word_count || 0)) continue;
    await exec(`update ${table('posts')} set word_count = $1 where id = $2`, [count, post.id]).catch(() => {});
    wordCountUpdated++;
  }
  result.word_count_updated = wordCountUpdated;
  return result;
}

async function cleanupDatabase() {
  const result: Record<string, number> = {};
  const missingMediaIds = await findMissingLocalMediaIds();
  const staleAlbumCoverIds = await findStaleAlbumCoverIds();
  result.media_missing_files = missingMediaIds.length > 0
    ? await execChanged(`delete from ${table('media')} where id = any($1::int[])`, [missingMediaIds])
    : 0;
  result.album_covers_cleared = staleAlbumCoverIds.length > 0
    ? await execChanged(`update ${table('albums')} set cover_url = '' where id = any($1::int[])`, [staleAlbumCoverIds])
    : 0;
  result.album_links_reset = await execChanged(
    `update ${table('media')} m set album_id = 0
     where coalesce(m.album_id,0) > 0 and not exists (select 1 from ${table('albums')} a where a.id = m.album_id)`,
  );
  result.album_counts_rebuilt = await execChanged(
    `update ${table('albums')} a set photo_count = coalesce(sub.c, 0)
     from (
       select a2.id, count(m.id) as c from ${table('albums')} a2
       left join ${table('media')} m on m.album_id = a2.id and coalesce(m.category,'') = 'image'
       group by a2.id
     ) sub where a.id = sub.id and a.photo_count is distinct from sub.c`,
  );
  result.relationships_deleted = await execChanged(
    `delete from ${table('relationships')} r
     where not exists (select 1 from ${table('posts')} p where p.id = r.post_id)
        or not exists (select 1 from ${table('metas')} m where m.id = r.meta_id)`,
  );
  result.meta_counts_rebuilt = await execChanged(
    `update ${table('metas')} m set count = coalesce(sub.c, 0)
     from (
       select m2.id, count(r.meta_id) as c from ${table('metas')} m2
       left join ${table('relationships')} r on r.meta_id = m2.id group by m2.id
     ) sub where m.id = sub.id and m.count is distinct from sub.c`,
  );
  result.post_meta_deleted = await execChanged(
    `delete from ${table('post_meta')} pm where not exists (select 1 from ${table('posts')} p where p.id = pm.post_id)`,
  );
  result.annotations_deleted = await execChanged(
    `delete from ${table('annotations')} an where not exists (select 1 from ${table('posts')} p where p.id = an.post_id)`,
  );
  result.comments_deleted = await execChanged(
    `delete from ${table('comments')} cm where not exists (select 1 from ${table('posts')} p where p.id = cm.post_id)`,
  );
  result.comment_parents_reset = await execChanged(
    `update ${table('comments')} cm set parent_id = 0
     where coalesce(cm.parent_id,0) > 0 and not exists (select 1 from ${table('comments')} p where p.id = cm.parent_id)`,
  );
  result.comment_counts_rebuilt = await execChanged(
    `update ${table('posts')} p set comment_count = coalesce(sub.c, 0)
     from (
       select p2.id, count(c.id) as c from ${table('posts')} p2
       left join ${table('comments')} c on c.post_id = p2.id and c.status = 'approved'
       group by p2.id
     ) sub where p.id = sub.id and p.comment_count is distinct from sub.c`,
  );
  result.footprints_deleted = await execChanged(
    `delete from ${table('post_footprints')} pf
     where not exists (select 1 from ${table('posts')} p where p.id = pf.post_id)
        or (coalesce(pf.place_id,0) > 0 and not exists (select 1 from ${table('footprint_places')} fp where fp.id = pf.place_id))`,
  );
  result.footprint_counts_rebuilt = await execChanged(
    `update ${table('footprint_places')} fp set visit_count = coalesce(sub.c, 0)
     from (
       select fp2.id, count(pf.id) as c from ${table('footprint_places')} fp2
       left join ${table('post_footprints')} pf on pf.place_id = fp2.id group by fp2.id
     ) sub where fp.id = sub.id and fp.visit_count is distinct from sub.c`,
  );
  result.expired_tokens_deleted = await execChanged(`delete from ${table('federation_tokens')} where expires_at > 0 and expires_at < $1`, [nowUnix()]);
  result.expired_bans_deleted = await execChanged(`delete from ${table('ip_bans')} where expires_at > 0 and expires_at < $1`, [nowUnix()]);
  result.total = Object.values(result).reduce((sum, n) => sum + Number(n || 0), 0);
  return result;
}

function extractHtmlMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return cleanFeedText(match[1]);
  }
  return '';
}

async function parseOgp(url: string) {
  const safeUrl = await assertPublicHttpUrl(url);
  const res = await fetch(safeUrl, {
    signal: AbortSignal.timeout(15000),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Utterlog/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.text()).slice(0, 400 * 1024);
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const result: Record<string, unknown> = {
    type: extractHtmlMeta(html, 'og:type') || 'web',
    title: extractHtmlMeta(html, 'og:title') || cleanFeedText(titleMatch?.[1] || ''),
    cover_url: extractHtmlMeta(html, 'og:image'),
    summary: extractHtmlMeta(html, 'og:description') || extractHtmlMeta(html, 'description'),
    platform: 'web',
    extra: {},
  };
  if (!result.title) throw new Error('无法解析页面元数据');
  return { result, html };
}

function joinNames(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? String((item as any).name || item) : String(item)).filter(Boolean).join(', ');
  return typeof value === 'string' ? value : '';
}

function htmlText(value: string) {
  return cleanFeedText(value.replace(/<[^>]+>/g, ' '));
}

function extractDoubanInfo(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<span class=["']pl["']>${escaped}[:：]?\\s*</span>\\s*([\\s\\S]*?)<br`, 'i').exec(html);
  return match?.[1] ? htmlText(match[1]) : '';
}

async function parseMediaUrl(url: string) {
  if (url.includes('neodb.social')) {
    const match = /neodb\.social\/(movie|book|game|tv|music|podcast|performance)\/([a-zA-Z0-9]+)/.exec(url);
    if (!match) throw new Error('无法解析 NeoDB 链接格式');
    const data = await fetchJson<Record<string, unknown>>(`https://neodb.social/api/${match[1]}/${match[2]}`, 15000);
    const extra: Record<string, string> = {};
    if (data.pub_house) extra.publisher = String(data.pub_house);
    if (data.isbn) extra.isbn = String(data.isbn);
    if (data.pages) extra.pages = String(data.pages);
    if (Array.isArray(data.genre)) extra.genre = data.genre.map(String).join(', ');
    if (data.duration) extra.duration = String(data.duration);
    return {
      type: match[1] === 'tv' ? 'tv' : match[1],
      title: String(data.title || ''),
      cover_url: String(data.cover_image_url || ''),
      artist: joinNames(data.author) || joinNames(data.director) || joinNames(data.artist),
      year: String(data.pub_year || data.year || ''),
      rating: Number(data.rating || 0),
      summary: String(data.description || ''),
      platform: 'neodb',
      url,
      extra,
    };
  }

  if (url.includes('music.163.com') || url.includes('163cn.tv')) {
    const match = /(?:song\?id=|song\/)(\d+)/.exec(url);
    if (match) {
      const data = await fetchJson<any>(`https://music.163.com/api/song/detail/?ids=[${match[1]}]&id=${match[1]}`, 15000);
      const song = data.songs?.[0];
      if (song) {
        return {
          type: 'music',
          title: song.name || '',
          cover_url: song.album?.picUrl || '',
          artist: song.artists?.[0]?.name || '',
          album: song.album?.name || '',
          platform: 'netease',
          url,
          extra: { song_id: match[1] },
        };
      }
    }
  }

  const { result, html } = await parseOgp(url);
  result.url = url;
  if (url.includes('douban.com')) {
    result.platform = 'douban';
    result.type = url.includes('book.douban.com') ? 'book' : url.includes('music.douban.com') ? 'music' : 'movie';
    const ldMatch = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (ldMatch?.[1]) {
      try {
        const ld = JSON.parse(ldMatch[1].replace(/[\r\n\t]/g, ' '));
        if (ld.name && !result.title) result.title = ld.name;
        if (ld.image && !result.cover_url) result.cover_url = ld.image;
        if (ld.datePublished) result.year = String(ld.datePublished).slice(0, 4);
        result.artist = joinNames(ld.director) || result.artist;
        const actors = joinNames(ld.actor);
        if (actors) (result.extra as Record<string, string>).actors = actors;
        if (ld.duration) {
          const minutes = /PT(\d+)M/.exec(String(ld.duration))?.[1];
          (result.extra as Record<string, string>).duration = minutes ? `${minutes} 分钟` : String(ld.duration);
        }
        const rating = Number(ld.aggregateRating?.ratingValue || 0);
        if (rating) result.rating = rating;
        if (Array.isArray(ld.genre)) (result.extra as Record<string, string>).genres = ld.genre.join(', ');
      } catch {
        // Keep OGP result.
      }
    }
    const extra = result.extra as Record<string, string>;
    extra.region ||= extractDoubanInfo(html, '制片国家/地区');
    extra.language ||= extractDoubanInfo(html, '语言');
    extra.imdb_id ||= extractDoubanInfo(html, 'IMDb');
    extra.total_episodes ||= extractDoubanInfo(html, '集数');
    if (!extra.genres) {
      const genres = extractDoubanInfo(html, '类型');
      if (genres) extra.genres = genres.replace(/\//g, ' ').split(/\s+/).filter(Boolean).join(', ');
    }
  } else if (url.includes('youtu.be') || url.includes('youtube.com')) {
    const id = /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(url)?.[1] || '';
    result.platform = 'youtube';
    result.type = 'video';
    if (!result.cover_url && id) result.cover_url = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    result.extra = { video_id: id, embed_url: id ? `https://www.youtube.com/embed/${id}` : '' };
  } else if (url.includes('bilibili.com') || url.includes('b23.tv')) {
    const bvid = /(?:BV[a-zA-Z0-9]+|av\d+)/.exec(url)?.[0] || '';
    result.platform = 'bilibili';
    result.type = 'video';
    result.extra = { bvid, embed_url: bvid ? `https://player.bilibili.com/player.html?bvid=${bvid}` : '' };
  } else if (url.includes('y.qq.com') || url.includes('qq.com/n/ryqq')) {
    result.platform = 'qqmusic';
    result.type = 'music';
  } else if (url.includes('v.qq.com')) {
    result.platform = 'tencent_video';
    result.type = 'video';
  } else if (url.includes('youku.com')) {
    result.platform = 'youku';
    result.type = 'video';
  } else if (url.includes('iqiyi.com')) {
    result.platform = 'iqiyi';
    result.type = 'video';
  } else if (url.includes('imdb.com')) {
    result.platform = 'imdb';
    result.type = 'movie';
  }
  return result;
}

export async function siteMetadata() {
  const [title, description, logo, logoDark, favicon] = await Promise.all([
    optionValue('site_title', 'Utterlog!'),
    optionValue('site_description', ''),
    optionValue('site_logo', ''),
    optionValue('site_logo_dark', ''),
    optionValue('site_favicon', ''),
  ]);
  const admin = await one<Record<string, unknown>>(
    `select username, nickname, avatar, email from ${table('users')} order by id asc limit 1`,
  ).catch(() => null);
  return {
    name: title || 'Utterlog!',
    title: title || 'Utterlog!',
    description,
    url: config.appUrl,
    logo,
    logo_dark: logoDark,
    favicon,
    admin: admin || null,
    protocol: 'utterlog-federation/1.0',
  };
}

function normalizedSiteUrl(value: unknown) {
  try {
    return normalizePublicHttpUrl(value);
  } catch {
    return '';
  }
}

function normalizeDisplayName(value: unknown) {
  return String(value || '')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchRemoteMetadata(siteUrl: string) {
  const safeSiteUrl = await assertPublicHttpUrl(siteUrl);
  const url = `${safeSiteUrl}/api/v1/federation/metadata`;
  const payload = await fetchJson<any>(url, 10000);
  return payload?.data || payload;
}

const utterlogHub = 'https://id.utterlog.com';

function siteFingerprint() {
  return createHash('sha256').update(`${config.appUrl}:${config.jwtSecret}`).digest('hex');
}

async function hubRequest(method: string, path: string, body?: unknown) {
  const siteId = await optionValue('utterlog_site_id', '');
  const res = await fetch(`${utterlogHub}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-site-fingerprint': siteFingerprint(),
      ...(siteId ? { 'x-site-id': siteId } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await res.json().catch(() => ({}));
  return { res, payload: payload as any };
}

async function ensureNetworkRegistered() {
  const existing = await optionValue('utterlog_site_id', '');
  const connected = (await optionValue('utterlog_connected', 'false')) === 'true';
  if (existing && connected) return { site_id: existing, connected: true };

  const metadata = await siteMetadata();
  const { res, payload } = await hubRequest('POST', '/api/v1/sites/register', {
    fingerprint: siteFingerprint(),
    url: config.appUrl,
    name: metadata.name,
    description: metadata.description,
    logo: metadata.logo,
    protocol: 'utterlog-federation/1.0',
    admin: metadata.admin,
  });
  if (!res.ok) return { site_id: '', connected: false };
  const siteId = String(payload?.data?.site_id || payload?.site_id || '');
  if (siteId) await saveOption('utterlog_site_id', siteId);
  await saveOption('utterlog_connected', 'true');
  return { site_id: siteId, connected: true };
}

async function pushNetworkSiteInfo() {
  const registered = await ensureNetworkRegistered();
  if (!registered.connected || !registered.site_id) throw new Error('无法连接 Utterlog 网络');
  const metadata = await siteMetadata();
  const [postCount, commentCount] = await Promise.all([
    one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where status = 'publish'`).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'approved'`).catch(() => null),
  ]);
  const { res } = await hubRequest('PUT', `/api/v1/sites/${encodeURIComponent(registered.site_id)}`, {
    site_id: registered.site_id,
    fingerprint: siteFingerprint(),
    url: config.appUrl,
    name: metadata.name,
    description: metadata.description,
    logo: metadata.logo,
    post_count: Number(postCount?.count || 0),
    comment_count: Number(commentCount?.count || 0),
  });
  if (!res.ok) throw new Error(`hub returned HTTP ${res.status}`);
  return { pushed: true, site_id: registered.site_id };
}

async function verifyUtterlogIdToken(utterlogId: string, token: string) {
  const res = await fetch(`${utterlogHub}/api/v1/auth/verify`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Utterlog ID 验证失败');
  const data = payload?.data || payload;
  if (String(data.utterlog_id || '') !== utterlogId) throw new Error('Utterlog ID 不匹配');
  return data as Record<string, unknown>;
}

async function publicFrontendUrl() {
  const siteUrl = (await optionValue('site_url', config.appUrl)).trim() || config.appUrl;
  return siteUrl.replace(/\/+$/, '');
}

export async function networkContentPayload(sp: URLSearchParams) {
  const contentType = sp.get('type') || 'post';
  const since = Number(sp.get('since') || 0);
  const { page, perPage, offset } = pageParams(sp);
  const params: unknown[] = [];
  let sql = '';
  let totalSql = '';
  if (contentType === 'moment') {
    sql = `select * from ${table('moments')} where visibility = 'public'`;
    totalSql = `select count(*)::text as count from ${table('moments')} where visibility = 'public'`;
  } else {
    sql = `select id, title, slug, content, excerpt, cover_url, view_count, comment_count, created_at, updated_at
           from ${table('posts')} where status = 'publish'`;
    totalSql = `select count(*)::text as count from ${table('posts')} where status = 'publish'`;
  }
  if (since > 0) {
    params.push(since);
    sql += ` and created_at > $${params.length}`;
    totalSql += ` and created_at > $${params.length}`;
  }
  const total = await one<{ count: string }>(totalSql, params).catch(() => null);
  const rows = await many<Record<string, unknown>>(`${sql} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`, [...params, perPage, offset]).catch(() => []);
  const meta = await siteMetadata();
  return { site: { name: meta.name, url: meta.url, logo: meta.logo }, items: rows, total: Number(total?.count || 0), page, per_page: perPage };
}

function syncPlatform(raw: unknown) {
  return String(raw || '').trim().toLowerCase() === 'typecho' ? 'typecho' : 'wordpress';
}

async function authSyncEnvelope(body: Record<string, any>, _platform: string) {
  const siteUuid = String(body.site_uuid || '').trim();
  const token = String(body.token || '').trim();
  if (!siteUuid || !token) throw new Error('缺少 site_uuid 或 token');
  const site = await one<{ site_uuid: string; label: string; source_url: string; token_hash: string; disabled: boolean; platform: string }>(
    `select site_uuid, label, source_url, token_hash, disabled, platform from ${table('sync_sites')} where site_uuid = $1 limit 1`,
    [siteUuid],
  );
  if (!site) throw new Error('site_uuid 未注册');
  if (site.disabled) throw new Error('site 已禁用');
  const okHash = await Bun.password.verify(token, site.token_hash).catch(() => false);
  if (!okHash && site.token_hash !== token) throw new Error('token 不匹配');
  await exec(`update ${table('sync_sites')} set last_seen_at = $1 where site_uuid = $2`, [nowUnix(), siteUuid]).catch(() => {});
  return site;
}

async function installationSiteUuid() {
  return (await optionValue('utterlog_site_id', '')).trim();
}

async function recordSyncMap(jobId: string, siteUuid: string, resource: string, sourceId: unknown, localId: number) {
  if (!sourceId || !localId) return;
  await exec(
    `insert into ${table('sync_id_map')} (job_id, site_uuid, resource, source_id, local_id)
     values ($1,$2,$3,$4,$5)
     on conflict (site_uuid, resource, source_id) do update set job_id = excluded.job_id, local_id = excluded.local_id`,
    [jobId, siteUuid, resource, String(sourceId), localId],
  ).catch(() => {});
}

async function localIdFor(siteUuid: string, resource: string, sourceId: unknown) {
  if (!sourceId) return 0;
  const row = await one<{ local_id: number }>(
    `select local_id from ${table('sync_id_map')} where site_uuid = $1 and resource = $2 and source_id = $3`,
    [siteUuid, resource, String(sourceId)],
  ).catch(() => null);
  return Number(row?.local_id || 0);
}

function syncStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function decodeSyncSlug(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20')).trim() || raw;
  } catch {
    return raw;
  }
}

function normalizeSyncTermSlug(raw: unknown, fallback: unknown = '') {
  const decoded = decodeSyncSlug(raw) || String(fallback || '').trim();
  return simpleSlug(decoded);
}

function syncUnixTime(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function syncPublishedDate(value: unknown) {
  const unix = syncUnixTime(value);
  return unix > 0 ? new Date(unix * 1000) : null;
}

function syncCommentStatus(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '1' || raw === 'approved' || raw === 'approve' || raw === 'publish') return 'approved';
  if (raw === 'spam') return 'spam';
  if (raw === 'trash' || raw === 'deleted') return 'trash';
  return raw || 'pending';
}

function syncSafeIp(value: unknown) {
  const ip = String(value || '').trim();
  return isIP(ip) ? ip : '0.0.0.0';
}

function syncTruncate(value: unknown, max: number) {
  return String(value || '').slice(0, max);
}

function syncExcerptFromContent(content: unknown, limit = 200) {
  const text = String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\/?[a-zA-Z][^\]]*\]/g, ' ')
    .replace(/[#*_`>~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, limit).join('');
}

async function attachPostTerms(postId: number, siteUuid: string, categorySlugs: unknown, tagSlugs: unknown) {
  const attach = async (resource: string, slugs: string[]) => {
    for (const slug of slugs) {
      const decoded = decodeSyncSlug(slug);
      const normalized = normalizeSyncTermSlug(slug);
      const metaId = await localIdFor(siteUuid, resource, slug)
        || await localIdFor(siteUuid, resource, decoded)
        || await localIdFor(siteUuid, resource, normalized)
        || Number((await one<{ id: number }>(
          `select id from ${table('metas')} where slug = $1 and type = $2 limit 1`,
          [normalized, resource === 'categories' ? 'category' : 'tag'],
        ).catch(() => null))?.id || 0);
      if (!metaId) continue;
      await exec(
        `insert into ${table('relationships')} (post_id, meta_id, created_at)
         values ($1,$2,$3) on conflict do nothing`,
        [postId, metaId, nowUnix()],
      ).catch(() => {});
    }
  };
  await attach('categories', syncStringList(categorySlugs));
  await attach('tags', syncStringList(tagSlugs));
}

async function importSyncBatch(jobId: string, siteUuid: string, resource: string, items: Record<string, any>[], userId: number, platform = 'wordpress') {
  let imported = 0;
  for (const item of items) {
    const sourceId = item.id || item.ID || item.source_id || item.wp_id || item.cid;
    if (resource === 'categories' || resource === 'tags') {
      const type = resource === 'categories' ? 'category' : 'tag';
      const decodedSlug = decodeSyncSlug(item.slug || item.name || item.title || sourceId);
      const slug = normalizeSyncTermSlug(item.slug, item.name || item.title || sourceId);
      const row = await one<{ id: number }>(
        `insert into ${table('metas')} (name, slug, type, description, created_at, updated_at, source_type, source_id, source_site_uuid)
         values ($1,$2,$3,$4,$5,$5,$6,$7,$8)
         on conflict (slug, type) do update set name = excluded.name, description = excluded.description, updated_at = excluded.updated_at
         returning id`,
        [item.name || item.title || '', slug, type, item.description || '', nowUnix(), syncPlatform(platform), String(sourceId || ''), siteUuid],
      );
      if (row?.id) {
        await recordSyncMap(jobId, siteUuid, resource, sourceId, row.id);
        await recordSyncMap(jobId, siteUuid, resource, decodedSlug, row.id);
        await recordSyncMap(jobId, siteUuid, resource, slug, row.id);
        imported++;
      }
    } else if (resource === 'posts' || resource === 'pages') {
      const postType = resource === 'pages' ? 'page' : 'post';
      const createdAt = syncUnixTime(item.published_at_gmt || item.published_at || item.created_at || item.post_date_gmt) || nowUnix();
      const updatedAt = syncUnixTime(item.updated_at_gmt || item.updated_at || item.modified_at || item.post_modified_gmt) || createdAt;
      const publishedAt = syncPublishedDate(item.published_at_gmt || item.published_at || item.post_date_gmt || createdAt);
      const sourceType = syncPlatform(platform);
      const sourceKey = String(sourceId || '');
      const content = item.content || item.post_content || '';
      const excerpt = String(item.excerpt || item.post_excerpt || '').trim() || syncExcerptFromContent(content);
      const baseValues = [
        item.title || item.post_title || '',
        content,
        excerpt,
        userId || 1,
        ['publish', 'published'].includes(String(item.status || item.post_status || '').toLowerCase()) ? 'publish' : (item.status || item.post_status || 'draft'),
        postType,
        item.cover_url || item.featured_image_url || '',
        item.password || item.post_password || '',
        item.allow_comment === undefined ? true : Boolean(item.allow_comment),
        Boolean(item.is_sticky || item.pinned),
        Number(item.view_count || 0),
        publishedAt,
        updatedAt,
        sourceType,
        siteUuid,
        sourceKey,
      ];
      const existing = sourceKey ? await one<{ id: number; view_count: number }>(
        `select id, coalesce(view_count,0)::int as view_count from ${table('posts')} where source_site_uuid = $1 and source_type = $2 and source_id = $3 limit 1`,
        [siteUuid, sourceType, sourceKey],
      ).catch(() => null) : null;
      let row: { id: number } | null = null;
      if (existing?.id) {
        row = await one<{ id: number }>(
          `update ${table('posts')} set title=$1, content=$2, excerpt=$3, author_id=$4, status=$5, type=$6,
             cover_url=$7, password=$8, allow_comment=$9, pinned=$10, view_count=$11, published_at=$12,
             updated_at=$13, source_type=$14, source_site_uuid=$15, source_id=$16
           where id = $17 returning id`,
          [...baseValues, existing.id],
        );
      } else {
        const baseSlug = simpleSlug(item.slug || item.post_name || item.title || sourceId);
        for (let attempt = 0; attempt < 10 && !row; attempt++) {
          const slug = attempt === 0 ? baseSlug : syncCollisionSlug(baseSlug, siteUuid, sourceKey, attempt);
          row = await one<{ id: number }>(
            `insert into ${table('posts')} (title, slug, content, excerpt, author_id, status, type, cover_url, password, allow_comment, pinned, view_count, published_at, created_at, updated_at, source_type, source_site_uuid, source_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             on conflict (slug) where deleted_at = 0 do nothing
             returning id`,
            [baseValues[0], slug, ...baseValues.slice(1, 12), createdAt, ...baseValues.slice(12)],
          ).catch(() => null);
        }
        if (!row) throw new Error(`文章 slug 冲突过多: ${baseSlug}`);
      }
      if (row?.id) {
        const template = String(item.template || item.page_template || '').trim();
        if (template) await exec(`update ${table('posts')} set template=$1 where id=$2`, [template, row.id]).catch(() => {});
        const oldViewCount = Number(existing?.view_count || 0);
        const nextViewCount = Number(item.view_count || 0);
        const delta = nextViewCount - oldViewCount;
        if (delta !== 0) {
          await exec(`update ${table('stats_global')} set total_views = total_views + $1, updated_at = $2 where id = 1`, [delta, nowUnix()]).catch(() => {});
        }
        await recordSyncMap(jobId, siteUuid, resource, sourceId, row.id);
        await recordSyncMap(jobId, siteUuid, 'posts', sourceId, row.id);
        await attachPostTerms(row.id, siteUuid, item.categories || item.category_slugs, item.tags || item.tag_slugs);
        imported++;
      }
    } else if (resource === 'comments') {
      const postSourceId = item.source_post_id || item.post_source_id || item.post_id || item.comment_post_ID || item.postId;
      const postId = Number(item.local_post_id || await localIdFor(siteUuid, 'posts', postSourceId) || 0);
      if (!postId) continue;
      const parentId = Number(await localIdFor(siteUuid, 'comments', item.parent_source_id || item.parent_id || item.comment_parent) || 0);
      const createdAt = syncUnixTime(item.comment_date_gmt || item.created_at || item.date_gmt) || nowUnix();
      const sourceType = syncPlatform(platform);
      const existing = sourceId ? await one<{ id: number }>(
        `select id from ${table('comments')} where source_site_uuid = $1 and source_type = $2 and source_id = $3 limit 1`,
        [siteUuid, sourceType, String(sourceId)],
      ).catch(() => null) : null;
      const values = [
        postId,
        item.author_name || item.comment_author || '匿名',
        item.author_email || item.comment_author_email || '',
        item.author_url || item.comment_author_url || '',
        syncSafeIp(item.author_ip || item.comment_author_IP),
        syncTruncate(item.author_agent || item.comment_agent, 511),
        item.content || item.comment_content || '',
        parentId,
        syncCommentStatus(item.status || item.comment_approved),
        String(sourceId || ''),
        createdAt,
        syncTruncate(item.client_hints, 2000),
        siteUuid,
        sourceType,
      ];
      const row = existing
        ? await one<{ id: number }>(
          `update ${table('comments')} set post_id=$1, author_name=$2, author_email=$3, author_url=$4,
             author_ip=$5::inet, author_agent=$6, content=$7, parent_id=$8, status=$9, source=$14,
             source_id=$10, created_at=$11, updated_at=$11, client_hints=$12, source_site_uuid=$13, source_type=$14
           where id = $15 returning id`,
          [...values, existing.id],
        )
        : await one<{ id: number }>(
        `insert into ${table('comments')} (post_id, author_name, author_email, author_url, author_ip, author_agent,
             content, parent_id, status, source, source_id, created_at, updated_at, client_hints, source_site_uuid, source_type)
         values ($1,$2,$3,$4,$5::inet,$6,$7,$8,$9,$14,$10,$11,$11,$12,$13,$14)
         returning id`,
        [
          ...values,
        ],
      );
      if (row?.id) {
        await recordSyncMap(jobId, siteUuid, resource, sourceId, row.id);
        imported++;
      }
    } else if (resource === 'links') {
      if (!sourceId || !(item.name || item.title) || !(item.url || item.link_url)) continue;
      const sourceType = syncPlatform(platform);
      const status = item.visible === false || item.status === 0 || String(item.status || '').toLowerCase() === 'hidden' ? 0 : 1;
      const now = nowUnix();
      await exec(
        `insert into ${table('links')} (name, url, description, logo, rel, rss_url, order_num, status, group_name,
             created_at, updated_at, source_type, source_id, source_site_uuid)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'default',$9,$9,$10,$11,$12)
         on conflict (source_site_uuid, source_type, source_id) where source_site_uuid != ''
         do update set name=excluded.name, url=excluded.url, description=excluded.description,
           logo=excluded.logo, rel=excluded.rel, rss_url=excluded.rss_url, status=excluded.status,
           updated_at=excluded.updated_at`,
        [
          item.name || item.title || '',
          item.url || item.link_url || '',
          item.description || '',
          item.logo || item.image || '',
          item.rel || '',
          item.rss_url || '',
          imported + 1,
          status,
          now,
          sourceType,
          String(sourceId || ''),
          siteUuid,
        ],
      );
      imported++;
    } else {
      throw new Error(`未知 resource: ${resource}`);
    }
  }
  return imported;
}

type SyncPlatform = 'wordpress' | 'typecho';

export class ImportSyncServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function requireSyncPlatform(value: unknown): SyncPlatform {
  const platform = String(value || '').trim().toLowerCase();
  if (platform === 'wordpress' || platform === 'typecho') return platform;
  throw new ImportSyncServiceError(404, 'NOT_FOUND', '同步平台不存在');
}

function syncRequestBody(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

async function authenticatedSyncSite(body: Record<string, any>, platform: SyncPlatform) {
  try {
    return await authSyncEnvelope(body, platform);
  } catch (error) {
    throw new ImportSyncServiceError(401, 'BAD_AUTH', error instanceof Error ? error.message : '认证失败');
  }
}

export async function importWordPressPayload(request: Request, userId: number) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new ImportSyncServiceError(400, 'BAD_REQUEST', '请上传 WordPress WXR XML 文件');
    const result = await importWordPressWxr(await file.text(), userId);
    return { imported: result.posts + result.pages, ...result };
  }

  const body = syncRequestBody(await request.json().catch(() => ({})));
  if (!Array.isArray(body.posts)) {
    throw new ImportSyncServiceError(400, 'BAD_REQUEST', '请上传 WordPress WXR XML 文件，或提交 posts 数组');
  }
  let imported = 0;
  for (const post of body.posts) {
    const item = syncRequestBody(post);
    const row = await one<{ id: number }>(
      `insert into ${table('posts')} (title, slug, content, excerpt, author_id, status, type, created_at, updated_at, source_type, source_id)
       values ($1,$2,$3,$4,$5,$6,'post',$7,$7,'wordpress',$8)
       on conflict (slug) where deleted_at = 0 do update set title = excluded.title, content = excluded.content, excerpt = excluded.excerpt, updated_at = excluded.updated_at
       returning id`,
      [item.title || '', item.slug || simpleSlug(item.title || ''), item.content || '', item.excerpt || '', userId || 1, item.status || 'draft', nowUnix(), String(item.id || item.source_id || '')],
    ).catch(() => null);
    if (row?.id) imported++;
  }
  return { imported, posts: imported, pages: 0, comments: 0 };
}

export async function importTypechoPayload(value: unknown, userId: number) {
  const body = syncRequestBody(value);
  if (!Array.isArray(body.posts)) {
    return {
      imported: 0,
      posts: 0,
      pages: 0,
      comments: 0,
      skipped: true,
      message: 'Typecho 旧直连导入已由 Typecho 同步插件替代，请使用 /api/v1/sync/typecho/* 或后台同步站点配置。',
      sync_endpoints: {
        ping: '/api/v1/sync/typecho/ping',
        start: '/api/v1/sync/typecho/start',
        batch: '/api/v1/sync/typecho/batch',
        finish: '/api/v1/sync/typecho/finish',
      },
    };
  }
  let imported = 0;
  for (const post of body.posts) {
    const item = syncRequestBody(post);
    const row = await one<{ id: number }>(
      `insert into ${table('posts')} (title, slug, content, excerpt, author_id, status, type, created_at, updated_at, source_type, source_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8,'typecho',$9)
       on conflict (slug) where deleted_at = 0 do update set title = excluded.title, content = excluded.content, excerpt = excluded.excerpt, updated_at = excluded.updated_at
       returning id`,
      [
        item.title || '',
        item.slug || simpleSlug(item.title || ''),
        item.content || item.text || '',
        item.excerpt || '',
        userId || 1,
        item.status || 'draft',
        item.type === 'page' ? 'page' : 'post',
        Number(item.created_at || item.created || nowUnix()),
        String(item.id || item.cid || item.source_id || ''),
      ],
    ).catch(() => null);
    if (row?.id) imported++;
  }
  return { imported, posts: imported, pages: 0, comments: 0 };
}

export async function syncPingPayload(platformValue: unknown, value: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const site = await authenticatedSyncSite(syncRequestBody(value), platform);
  return {
    ok: true,
    platform,
    app: 'utterlog-bun',
    site_uuid: site.site_uuid,
    label: site.label,
    source_url: site.source_url,
    server_time: nowUnix(),
  };
}

export async function syncStartPayload(platformValue: unknown, value: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const body = syncRequestBody(value);
  const site = await authenticatedSyncSite(body, platform);
  const manifest = syncRequestBody(body.manifest);
  if (manifest.source_url) {
    await exec(`update ${table('sync_sites')} set source_url = $1, updated_at = $2 where site_uuid = $3`, [String(manifest.source_url), nowUnix(), site.site_uuid]).catch(() => {});
  }
  const jobId = `job_${randomBytes(12).toString('hex')}`;
  await exec(
    `insert into ${table('sync_jobs')} (job_id, site_uuid, status, stage, manifest, started_at)
     values ($1,$2,'running','import',$3::jsonb,$4)`,
    [jobId, site.site_uuid, JSON.stringify(manifest), nowUnix()],
  );
  return { job_id: jobId, started_at: nowUnix() };
}

export async function syncBatchPayload(platformValue: unknown, value: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const body = syncRequestBody(value);
  const site = await authenticatedSyncSite(body, platform);
  const jobId = String(body.job_id || '');
  const resource = String(body.resource || '');
  const batchNo = Number(body.batch_no || 0);
  const items = Array.isArray(body.items) ? body.items.map(syncRequestBody) : [];
  if (!jobId || !resource || batchNo <= 0) {
    throw new ImportSyncServiceError(400, 'BAD_REQUEST', '缺少 job_id / resource / batch_no');
  }
  const job = await one<{ site_uuid: string }>(`select site_uuid from ${table('sync_jobs')} where job_id = $1`, [jobId]).catch(() => null);
  if (!job) throw new ImportSyncServiceError(404, 'NOT_FOUND', 'job 不存在');
  if (job.site_uuid !== site.site_uuid) throw new ImportSyncServiceError(403, 'FORBIDDEN', 'job 不属于当前同步站点');
  const seen = await one<{ count: string }>(
    `select count(*)::text as count from ${table('sync_batches')} where job_id = $1 and resource = $2 and batch_no = $3`,
    [jobId, resource, batchNo],
  );
  if (Number(seen?.count || 0) > 0) return { duplicate: true, items_received: items.length };
  try {
    const imported = await importSyncBatch(jobId, site.site_uuid, resource, items, 1, site.platform);
    await exec(
      `insert into ${table('sync_batches')} (job_id, resource, batch_no, received_at, item_count)
       values ($1,$2,$3,$4,$5) on conflict (job_id, resource, batch_no) do nothing`,
      [jobId, resource, batchNo, nowUnix(), imported],
    );
    return { imported, resource, batch_no: batchNo };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败';
    await exec(`update ${table('sync_jobs')} set status = 'error', error_message = $1 where job_id = $2`, [message, jobId]).catch(() => {});
    throw new ImportSyncServiceError(500, 'IMPORT_ERR', message);
  }
}

export async function syncFinishPayload(platformValue: unknown, value: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const body = syncRequestBody(value);
  const site = await authenticatedSyncSite(body, platform);
  const jobId = String(body.job_id || '');
  if (!jobId) throw new ImportSyncServiceError(400, 'BAD_REQUEST', '缺少 job_id');
  const job = await one<{ site_uuid: string }>(`select site_uuid from ${table('sync_jobs')} where job_id = $1`, [jobId]).catch(() => null);
  if (!job) throw new ImportSyncServiceError(404, 'NOT_FOUND', 'job 不存在');
  if (job.site_uuid !== site.site_uuid) throw new ImportSyncServiceError(403, 'FORBIDDEN', 'job 不属于当前同步站点');
  const counts = syncRequestBody(body.summary);
  await exec(`update ${table('sync_jobs')} set status='processing', stage='media_scan', counts=$1::jsonb where job_id=$2`, [JSON.stringify(counts), jobId]);
  void runSyncFinishWorker(jobId, site.site_uuid, counts).catch(() => {});
  return {
    job_id: jobId,
    status: 'processing',
    stage: 'media_scan',
    next_stage: 'media download + content rewrite',
    hint: `轮询 /api/v1/sync/${platform}/job/${jobId}/status`,
  };
}

export async function syncRollbackPayload(platformValue: unknown, value: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const body = syncRequestBody(value);
  const site = await authenticatedSyncSite(body, platform);
  if (String(body.confirm || '') !== site.site_uuid) {
    throw new ImportSyncServiceError(400, 'CONFIRM_MISMATCH', `confirm 字段必须等于 site_uuid (${site.site_uuid})`);
  }
  const rowsRemoved: Record<string, number> = {};
  for (const name of ['comments', 'posts', 'metas', 'media', 'links']) {
    rowsRemoved[name] = await execChanged(`delete from ${table(name)} where source_site_uuid = $1`, [site.site_uuid]).catch(() => 0);
  }
  await exec(`delete from ${table('sync_id_map')} where site_uuid = $1`, [site.site_uuid]).catch(() => {});
  await exec(`delete from ${table('sync_media_queue')} where job_id in (select job_id from ${table('sync_jobs')} where site_uuid = $1)`, [site.site_uuid]).catch(() => {});
  await exec(`delete from ${table('sync_batches')} where job_id in (select job_id from ${table('sync_jobs')} where site_uuid = $1)`, [site.site_uuid]).catch(() => {});
  await exec(`delete from ${table('sync_jobs')} where site_uuid = $1`, [site.site_uuid]).catch(() => {});
  return { rolled_back: true, site_uuid: site.site_uuid, rows_removed: rowsRemoved };
}

export async function syncJobStatusPayload(platformValue: unknown, jobId: unknown) {
  requireSyncPlatform(platformValue);
  const row = await one<Record<string, unknown>>(`select * from ${table('sync_jobs')} where job_id = $1`, [String(jobId || '')]).catch(() => null);
  if (!row) throw new ImportSyncServiceError(404, 'NOT_FOUND', 'job 不存在');
  return row;
}

export async function createSyncSitePayload(platformValue: unknown, value: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const body = syncRequestBody(value);
  let siteUuid = String(body.site_uuid || '').trim();
  if (!siteUuid) {
    const installUuid = await installationSiteUuid();
    if (installUuid) {
      const exists = await one<{ count: string }>(
        `select count(*)::text as count from ${table('sync_sites')} where site_uuid = $1`,
        [installUuid],
      ).catch(() => null);
      siteUuid = Number(exists?.count || 0) > 0 ? '' : installUuid;
    }
  }
  if (!siteUuid) siteUuid = `${platform.slice(0, 2)}_${randomBytes(16).toString('hex')}`;
  const token = randomBytes(24).toString('hex');
  const hash = await Bun.password.hash(token, { algorithm: 'bcrypt' });
  await exec(
    `insert into ${table('sync_sites')} (site_uuid, label, source_url, token_hash, platform, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$6)`,
    [siteUuid, String(body.label || ''), String(body.source_url || ''), hash, platform, nowUnix()],
  );
  return { site_uuid: siteUuid, token, label: body.label || '', platform, note: '请立即保存 token，之后无法再次查看' };
}

export async function listSyncSitesPayload(platformValue: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const rows = await many<Record<string, unknown>>(
    `select s.id, s.site_uuid, s.label, s.source_url, s.disabled, s.platform, s.last_seen_at, s.created_at, s.updated_at,
            coalesce((select count(*) from ${table('sync_jobs')} j where j.site_uuid = s.site_uuid), 0)::int as recent_jobs
     from ${table('sync_sites')} s where s.platform = $1 order by s.created_at desc`,
    [platform],
  ).catch(() => []);
  return { sites: rows };
}

export async function deleteSyncSitePayload(platformValue: unknown, siteUuid: unknown) {
  const platform = requireSyncPlatform(platformValue);
  const uuid = String(siteUuid || '');
  await exec(`delete from ${table('sync_sites')} where site_uuid = $1 and platform = $2`, [uuid, platform]);
  return { deleted: uuid };
}

export async function listSyncJobsPayload(platformValue: unknown, searchParams: URLSearchParams) {
  const platform = requireSyncPlatform(platformValue);
  const limit = Math.max(1, Math.min(200, intParam(searchParams.get('limit') || undefined, 20)));
  const rows = await many<Record<string, unknown>>(
    `select j.job_id, j.site_uuid, j.status, j.stage, j.media_total, j.media_done, j.posts_rewritten, j.started_at, j.finished_at
     from ${table('sync_jobs')} j inner join ${table('sync_sites')} s on s.site_uuid = j.site_uuid
     where s.platform = $1 order by j.started_at desc limit $2`,
    [platform, limit],
  ).catch(() => []);
  return { jobs: rows };
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of secret.replace(/=+$/g, '').toUpperCase()) {
    const idx = base32Alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret: string, step = Math.floor(Date.now() / 1000 / 30)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

function verifyTotp(secret: string, code: string) {
  const normalized = code.replace(/\s+/g, '');
  const step = Math.floor(Date.now() / 1000 / 30);
  return [-1, 0, 1].some((delta) => totpCode(secret, step + delta) === normalized);
}

async function generateTotpBackupCodes() {
  const codes = Array.from({ length: 8 }, () => randomBytes(5).toString('hex'));
  const hashes = await Promise.all(codes.map((code) => Bun.password.hash(code, { algorithm: 'bcrypt' })));
  return { codes, hashes };
}

async function consumeTotpBackupCode(userId: number, backupCodesJson: string | null | undefined, code: string) {
  const hashes = parseJsonOption<string[]>(String(backupCodesJson || '[]'), []);
  if (!hashes.length) return false;
  for (let i = 0; i < hashes.length; i++) {
    const matched = await Bun.password.verify(code, hashes[i]).catch(() => false);
    if (!matched) continue;
    const next = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
    await exec(
      `update ${table('users')} set totp_backup_codes = $1, updated_at = $2 where id = $3`,
      [JSON.stringify(next), nowUnix(), userId],
    ).catch(() => {});
    return true;
  }
  return false;
}

function compareSemver(a: string, b: string) {
  const clean = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const aa = clean(a);
  const bb = clean(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) - (bb[i] || 0);
  }
  return 0;
}

const releaseListCacheTtlMs = 10 * 60 * 1000;
const releaseListStaleMs = 24 * 60 * 60 * 1000;
let releaseListCache: { loadedAt: number; releases: any[] } | null = null;
let releaseListRequest: Promise<any[]> | null = null;

async function fetchReleaseList(force = false) {
  const now = Date.now();
  if (!force && releaseListCache && now - releaseListCache.loadedAt < releaseListCacheTtlMs) {
    return releaseListCache.releases;
  }
  if (releaseListRequest) return releaseListRequest;

  releaseListRequest = (async () => {
    try {
      const source = (await optionValue('version_source_url', '')).trim().replace(/\/+$/, '');
      const url = source ? `${source}/api/releases.json` : 'https://utterlog.io/api/releases.json';
      const fallback = 'https://api.github.com/repos/utterlog/utterlog/releases?per_page=20';
      const payload = await fetchJson<any>(url, 8000).catch(() => fetchJson<any>(fallback, 8000));
      const releases = Array.isArray(payload) ? payload : payload.releases || [];
      releaseListCache = { loadedAt: Date.now(), releases };
      return releases;
    } catch (error) {
      if (releaseListCache && now - releaseListCache.loadedAt < releaseListStaleMs) {
        return releaseListCache.releases;
      }
      throw error;
    } finally {
      releaseListRequest = null;
    }
  })();
  return releaseListRequest;
}

const upgradeLogPath = join(config.uploadDir, 'upgrade.log');

function logTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function readUpgradeLogTail(maxBytes = 8192) {
  try {
    const file = Bun.file(upgradeLogPath);
    if (!file.size) return '';
    const start = Math.max(0, file.size - maxBytes);
    return file.slice(start).text();
  } catch {
    return Promise.resolve('');
  }
}

function upgradeEnvEnabled() {
  const v = String(process.env.UTTERLOG_RUNTIME_UPGRADE || process.env.RUNTIME_UPGRADE_ENABLED || '').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'disabled';
}

function updateInstallDir() {
  return String(process.env.UTTERLOG_INSTALL_DIR || process.cwd()).trim() || process.cwd();
}

function updateRequestFile() {
  return String(process.env.UTTERLOG_UPDATE_REQUEST_FILE || join(updateInstallDir(), '.runtime', 'update.request')).trim();
}

async function runtimeUpgradeProbe() {
  if (!upgradeEnvEnabled()) return { supported: false, reason: 'runtime upgrade disabled by env' };
  const installDir = updateInstallDir();
  const scriptPath = join(installDir, 'scripts', 'update-bun.sh');
  if (!existsSync(scriptPath)) return { supported: false, reason: `update script missing: ${scriptPath}` };

  const pathUnit = String(process.env.UTTERLOG_UPDATE_PATH_UNIT || 'utterlog-update.path').trim();
  try {
    const status = await runCommand(['systemctl', 'is-active', '--quiet', pathUnit]);
    if (status.code !== 0) return { supported: false, reason: `${pathUnit} is not active` };
  } catch {
    return { supported: false, reason: 'systemd is unavailable' };
  }

  const requestFile = updateRequestFile();
  const probeFile = `${requestFile}.${process.pid}.probe`;
  try {
    await mkdir(dirname(requestFile), { recursive: true });
    await Bun.write(probeFile, 'ok');
    await rm(probeFile, { force: true });
  } catch {
    return { supported: false, reason: `update request directory is not writable: ${dirname(requestFile)}` };
  }
  return { supported: true, reason: '', installDir, requestFile, pathUnit };
}

async function upgradeStatusPayload() {
  const stored = parseJsonOption<any>(await ephemeral.get('system:upgrade:status') || '{}', {});
  const logTail = await readUpgradeLogTail();
  const terminal = logTail.includes('[TASK-END]');
  const started = logTail.includes('[START]');
  const success = /升级应用\s+\[Utterlog\]\s+成功\s+\[TASK-END\]/.test(logTail);
  if (terminal) {
    return {
      running: false,
      finished: true,
      success,
      message: success ? '升级完成' : (stored.message || '升级失败（详见日志）'),
      started_at: stored.started_at || '',
      log_tail: logTail,
    };
  }
  return {
    running: Boolean(stored.running) || started,
    finished: Boolean(stored.finished),
    success: Boolean(stored.success),
    message: stored.message || '',
    started_at: stored.started_at || '',
    log_tail: logTail || stored.log_tail || '',
  };
}

async function markUpgradeStatus(patch: Record<string, unknown>) {
  const current = parseJsonOption<any>(await ephemeral.get('system:upgrade:status') || '{}', {});
  await ephemeral.set('system:upgrade:status', JSON.stringify({ ...current, ...patch, updated_at: nowUnix() }), 86400);
}

export async function versionPayload(force = false) {
  const current = appVersion();
  const releases = await fetchReleaseList(force).catch(() => []);
  const latest = releases.find((r: any) => !r.draft) || null;
  const latestVersion = latest?.tag_name || latest?.version || '';
  const upgradeProbe = await runtimeUpgradeProbe().catch((err) => ({ supported: false, reason: err instanceof Error ? err.message : 'runtime probe failed' }));
  return {
    current: {
      version: current,
      runtime: `bun/${Bun.version}`,
      runtime_upgrade_supported: upgradeProbe.supported,
      runtime_upgrade_reason: upgradeProbe.reason,
      commit: process.env.BUILD_COMMIT || '',
      built_at: process.env.BUILD_TIME || '',
    },
    latest: latest ? {
      version: latestVersion,
      name: latest.name || latestVersion,
      body: latest.body || '',
      url: latest.html_url || latest.url || '',
      published_at: latest.published_at || '',
      prerelease: Boolean(latest.prerelease),
    } : null,
    update_available: latestVersion ? compareSemver(latestVersion, current) > 0 : false,
    checked_at: new Date().toISOString(),
  };
}

export class SystemServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function releaseListPayload(force = false) {
  try {
    return { releases: await fetchReleaseList(force), error: '' };
  } catch (error) {
    return { releases: [], error: error instanceof Error ? error.message : '更新历史读取失败' };
  }
}

export async function requestSystemUpgrade() {
  const current = await upgradeStatusPayload();
  if (current.running) throw new SystemServiceError(409, 'UPGRADE_IN_PROGRESS', '升级正在进行，请稍候');
  const probe = await runtimeUpgradeProbe();
  if (!probe.supported) {
    const message = `当前 Bun/systemd 部署未启用后台升级：${probe.reason}。请在部署目录执行 sudo bash scripts/update-bun.sh。`;
    await markUpgradeStatus({ running: false, finished: true, success: false, message, started_at: new Date().toISOString() });
    return { started: false, message };
  }
  await mkdir(config.uploadDir, { recursive: true }).catch(() => {});
  await Bun.write(upgradeLogPath, `${logTime()} 升级请求 已收到\n`);
  await markUpgradeStatus({ running: true, finished: false, success: false, message: '', started_at: new Date().toISOString() });
  await Bun.write(probe.requestFile || updateRequestFile(), JSON.stringify({ requested_at: new Date().toISOString() }));
  return { started: true, log_path: '/uploads/upgrade.log',
    hint: 'systemd 更新任务将拉取源码、使用 Bun 重新构建并重启服务；期间请勿关闭升级日志窗口' };
}

export async function systemUpgradeStatusPayload() {
  return upgradeStatusPayload();
}

export async function rebuildSystemStats() {
  return rebuildStats();
}

export async function clearSystemCache() {
  return { cleared: await clearEphemeralCache(), note: '已清理 Bun 缓存' };
}

export async function clearRssCache() {
  const cleared = await execChanged(`delete from ${table('feed_items')}`);
  await exec(`update ${table('rss_subscriptions')} set last_fetched_at = 0`).catch(() => {});
  return { cleared_items: cleared, note: '下次手动刷新订阅时会重新拉取' };
}

export async function cleanupSystemDatabase() {
  return cleanupDatabase();
}

export async function systemUpdateCheckPayload() {
  const payload = await versionPayload();
  return { has_update: payload.update_available, latest: payload.latest, current: payload.current };
}

export async function adminAnalyticsStatsPayload() {
  const [total, botCount, uniqueVisitors, oldest] = await Promise.all([
    one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')}`).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')} where ${botSqlPattern}`).catch(() => null),
    one<{ count: string }>(
      `select count(distinct coalesce(nullif(visitor_id,''), ip))::text as count from ${table('access_logs')}`,
    ).catch(() => null),
    one<{ oldest: string }>(`select coalesce(min(created_at), 0)::text as oldest from ${table('access_logs')}`).catch(() => null),
  ]);
  const totalRows = Number(total?.count || 0);
  const botRows = Number(botCount?.count || 0);
  return { total_rows: totalRows, bot_rows: botRows, real_rows: Math.max(0, totalRows - botRows),
    unique_visitors: Number(uniqueVisitors?.count || 0), oldest_ts: Number(oldest?.oldest || 0) };
}

export async function purgeAnalytics(query: URLSearchParams) {
  const result = { bots_deleted: 0, duplicates_deleted: 0, aged_deleted: 0 };
  if (query.get('bots') !== '0') {
    result.bots_deleted = await execChanged(`delete from ${table('access_logs')} where ${botSqlPattern}`);
  }
  if (query.get('duplicates') !== '0') {
    result.duplicates_deleted = await execChanged(
      `delete from ${table('access_logs')} where id in (
        select id from (
          select id, row_number() over (
            partition by path, coalesce(nullif(visitor_id,''), ip), (created_at / 30)
            order by created_at asc, id asc
          ) as rn from ${table('access_logs')}
        ) ranked where rn > 1
      )`,
    );
    result.duplicates_deleted += await execChanged(
      `delete from ${table('access_logs')} a
       where coalesce(a.visitor_id,'') = '' and coalesce(a.fingerprint,'') = ''
         and a.user_agent is not null and length(a.user_agent) >= 15 and not (${botSqlPattern})
         and exists (
           select 1 from ${table('access_logs')} b
           where b.path = a.path and b.ip = a.ip and b.visitor_id is not null and b.visitor_id != ''
             and b.created_at between a.created_at - 30 and a.created_at + 30
         )`,
    );
  }
  const days = Number(query.get('older_than_days') || 0);
  if (Number.isFinite(days) && days > 0) {
    result.aged_deleted = await execChanged(
      `delete from ${table('access_logs')} where created_at < extract(epoch from now() - ($1 * interval '1 day'))::bigint`,
      [days],
    );
  }
  return result;
}

export class ExternalContentServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function parseRssUrl(rawUrl: unknown) {
  const url = String(rawUrl || '').trim();
  if (!url) throw new ExternalContentServiceError(400, 'VALIDATION_ERROR', 'url 参数不能为空');
  try {
    return { url, items: await fetchRssFeed(url) };
  } catch (error) {
    throw new ExternalContentServiceError(502, 'RSS_PARSE_FAILED', error instanceof Error ? error.message : 'RSS 解析失败');
  }
}

export async function parseMediaLink(input: Record<string, unknown>) {
  const url = String(input.url || '').trim();
  if (!url) throw new ExternalContentServiceError(400, 'VALIDATION_ERROR', 'URL 不能为空');
  try {
    return await parseMediaUrl(url);
  } catch (error) {
    throw new ExternalContentServiceError(400, 'PARSE_ERROR', error instanceof Error ? error.message : '无法解析此链接');
  }
}

export async function doubanImportPayload(input: Record<string, unknown>) {
  const doubanId = String(input.douban_id || '').trim();
  if (!doubanId) throw new ExternalContentServiceError(400, 'VALIDATION_ERROR', '豆瓣 ID 不能为空');
  const type = ['movie', 'book', 'music'].includes(String(input.type || '')) ? String(input.type) : 'movie';
  const url = `https://${type}.douban.com/people/${encodeURIComponent(doubanId)}/collect`;
  const profile = await parseMediaUrl(url).catch(() => null);
  return { message: '豆瓣导入功能需要豆瓣 API 或 RSS 支持，建议使用 NeoDB 导入', douban_url: url, profile,
    tip: '推荐使用 NeoDB (neodb.social) 绑定豆瓣账号后，通过 NeoDB API 批量导入' };
}

export async function socialFeedTimeline(userId: number, query: URLSearchParams) {
  const page = Math.max(1, intParam(query.get('page') || undefined, 1));
  const perPage = Math.min(500, Math.max(1, intParam(query.get('per_page') || undefined, 20)));
  const total = await one<{ count: string }>(
    `select count(*)::text as count from ${table('feed_items')} fi
     join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id where rs.user_id = $1`, [userId],
  ).catch(() => null);
  const rows = await many<Record<string, unknown>>(
    `select fi.*, rs.site_name, rs.site_url from ${table('feed_items')} fi
     join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id
     where rs.user_id = $1 order by fi.pub_date desc nulls last, fi.id desc limit $2 offset $3`,
    [userId, perPage, (page - 1) * perPage],
  ).catch(() => []);
  const count = Number(total?.count || 0);
  return { rows, meta: { total: count, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(count / perPage)) } };
}

export async function socialFeedStats(userId: number) {
  const sevenDaysAgo = nowUnix() - 7 * 24 * 3600;
  const [count7d, countTotal, rssCount, lastFetched] = await Promise.all([
    one<{ count: string }>(
      `select count(*)::text as count from ${table('feed_items')} fi
       join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id where rs.user_id = $1 and fi.created_at >= $2`,
      [userId, sevenDaysAgo],
    ).catch(() => null),
    one<{ count: string }>(
      `select count(*)::text as count from ${table('feed_items')} fi
       join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id where rs.user_id = $1`, [userId],
    ).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('rss_subscriptions')} where user_id = $1`, [userId]).catch(() => null),
    one<{ last_fetched_at: string }>(
      `select coalesce(max(last_fetched_at), 0)::text as last_fetched_at from ${table('rss_subscriptions')} where user_id = $1`, [userId],
    ).catch(() => null),
  ]);
  return { count_7d: Number(count7d?.count || 0), count_total: Number(countTotal?.count || 0),
    rss_count: Number(rssCount?.count || 0), last_fetched_at: Number(lastFetched?.last_fetched_at || 0) };
}

export function socialFeedFetchStatus() {
  return feedFetchStatus();
}

export function startSocialFeedFetch(force: boolean) {
  let started = false;
  if (!feedFetchProgress.running) {
    started = true;
    feedFetchProgress = { ...emptyFeedFetchProgress(), running: true, force, started_at: nowUnix(), message: '准备刷新订阅' };
    void runFeedFetch({ limit: force ? 0 : 100, force, trackProgress: true, cleanupOrphans: force }).catch((error) => {
      feedFetchProgress = { ...feedFetchProgress, running: false, finished_at: nowUnix(), current_url: '', message: feedErrorMessage(error) };
    });
  }
  return { started, ...feedFetchStatus() };
}

export class FederationServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function acceptFederationFollow(input: Record<string, unknown>) {
  const followerSite = normalizedSiteUrl(input.follower_site || input.site_url || input.follower_url);
  if (!followerSite) throw new FederationServiceError(400, 'VALIDATION_ERROR', 'follower_site 不能为空');
  const now = nowUnix();
  await exec(
    `insert into ${table('followers')} (user_id, following_id, source_site, status, mutual, created_at, updated_at)
     values (0,1,$1,'active',false,$2,$2) on conflict do nothing`, [followerSite, now],
  ).catch(() => {});
  await exec(
    `insert into ${table('notifications')} (user_id, type, title, content, created_at) values (1,'follow',$1,$2,$3)`,
    [`${String(input.follower_name || followerSite)} 关注了你`, `来自 ${followerSite}`, now],
  ).catch(() => {});
  const already = await one<{ count: string }>(
    `select count(*)::text as count from ${table('followers')} where user_id = 1 and source_site = $1`, [followerSite],
  ).catch(() => null);
  const mutual = Number(already?.count || 0) > 0;
  if (mutual) {
    await exec(`update ${table('followers')} set mutual = true where source_site = $1`, [followerSite]).catch(() => {});
    await exec(
      `insert into ${table('links')} (name, url, description, status, order_num, created_at, updated_at)
       values ($1,$2,'互关好友',1,0,$3,$3) on conflict do nothing`,
      [String(input.follower_name || followerSite), followerSite, now],
    ).catch(() => {});
  }
  void sendFollowTelegram({ name: String(input.follower_name || ''), site: followerSite });
  return { accepted: true, mutual };
}

export async function verifyFederationToken(input: Record<string, unknown>) {
  const token = String(input.token || '').trim();
  if (!token) throw new FederationServiceError(400, 'VALIDATION_ERROR', 'token 不能为空');
  try {
    const payload = await verifyFederationTokenLocal(token);
    return { valid: true, user: { id: payload.sub, username: payload.username || '', nickname: payload.nickname || '',
      email: payload.email || '', avatar: payload.avatar || '', site: payload.site || config.appUrl } };
  } catch {
    throw new FederationServiceError(401, 'INVALID_TOKEN', 'Token 无效或已过期');
  }
}

export async function createFederatedComment(input: Record<string, unknown>) {
  const postId = intParam(String(input.post_id || ''));
  const content = String(input.content || '').trim();
  if (!postId || !content) throw new FederationServiceError(400, 'VALIDATION_ERROR', 'post_id 和 content 不能为空');
  let author = '匿名';
  let email = '';
  let url = '';
  let verified = false;
  const token = String(input.federation_token || input.token || '').trim();
  if (token) {
    try {
      const payload = decodeJwt(token) as Record<string, any>;
      if (payload.iss && payload.iss !== config.appUrl) {
        const issuer = await assertPublicHttpUrl(String(payload.iss));
        const response = await fetch(`${issuer}/api/v1/federation/verify`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        const remote = response?.ok ? await response.json().catch(() => null) as any : null;
        verified = Boolean(remote?.success && remote?.data?.valid);
      } else {
        await verifyFederationTokenLocal(token);
        verified = true;
      }
      author = String(payload.nickname || payload.username || author);
      email = String(payload.email || '');
      url = String(payload.site || payload.iss || '');
    } catch {
      verified = false;
    }
  }
  const row = await one<{ id: number }>(
    `insert into ${table('comments')} (post_id, author_name, author_email, author_url, content, status, source, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'federated',$7,$7) returning id`,
    [postId, author, email, url, content, verified ? 'approved' : 'pending', nowUnix()],
  );
  if (verified) await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [postId]).catch(() => {});
  return { id: row?.id || 0, author, verified };
}

export async function receiveFederationWebhook(input: Record<string, unknown>, providedSecret = '') {
  const secret = (await optionValue('federation_webhook_secret', '')).trim();
  if (secret && providedSecret !== secret) throw new FederationServiceError(403, 'FORBIDDEN', 'Invalid federation webhook secret');
  await exec(
    `insert into ${table('notifications')} (user_id, type, title, content, created_at) values (1,'federation',$1,$2,$3)`,
    [String(input.title || input.type || '联邦通知'), JSON.stringify(input).slice(0, 1000), nowUnix()],
  ).catch(() => {});
  return { received: true };
}

export async function issueFederationToken(userId: number) {
  const user = await one<{ id: number; username: string; email: string; nickname: string | null; avatar: string | null }>(
    `select id, username, email, nickname, avatar from ${table('users')} where id = $1`, [userId],
  );
  if (!user) throw new FederationServiceError(404, 'NOT_FOUND', '用户不存在');
  return { token: await signFederationToken(user), user: { id: user.id, username: user.username,
    nickname: user.nickname || user.username, email: user.email, avatar: user.avatar || '', site: config.appUrl } };
}

export async function identifyPassport(input: Record<string, unknown>) {
  const token = String(input.token || '').trim();
  if (!token) throw new FederationServiceError(400, 'VALIDATION_ERROR', '缺少 token');
  const verify = await fetch('https://id.utterlog.com/api/v1/passport/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!verify?.ok) throw new FederationServiceError(401, 'INVALID_PASSPORT', '身份验证失败');
  const payload: any = await verify.json().catch(() => ({}));
  const data: any = payload?.data || {};
  if (!payload.success || !data.valid) throw new FederationServiceError(401, 'INVALID_PASSPORT', '身份验证失败');
  return { identified: true, utterlog_id: data.utterlog_id || '', nickname: data.nickname || '', avatar: data.avatar || '',
    email: data.email || '', email_hash: data.email_hash || '', site_url: data.site_url || '', follow_status: '', is_friend_link: false };
}

export class NetworkServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function networkStatusPayload() {
  const registered = await ensureNetworkRegistered().catch(async () => ({ site_id: await optionValue('utterlog_site_id', ''), connected: false }));
  return { hub: utterlogHub, site_id: registered.site_id, fingerprint: `${siteFingerprint().slice(0, 12)}...`, connected: registered.connected };
}

export async function pushNetworkInfo() {
  try { return await pushNetworkSiteInfo(); }
  catch (error) { throw new NetworkServiceError(502, 'HUB_UNREACHABLE', error instanceof Error ? error.message : '无法连接 Utterlog 中心'); }
}

export async function networkHubFeed(query: URLSearchParams) {
  const page = encodeURIComponent(query.get('page') || '1');
  const perPage = encodeURIComponent(query.get('per_page') || '20');
  try {
    const { res, payload } = await hubRequest('GET', `/api/v1/activity?page=${page}&per_page=${perPage}`);
    return res.ok && payload?.success ? payload.data || { items: [], total: 0 } : { items: [], total: 0, hub_status: 'error' };
  } catch {
    return { items: [], total: 0, hub_status: 'offline' };
  }
}

export async function networkHubSites(query: URLSearchParams) {
  try {
    const { res, payload } = await hubRequest('GET', `/api/v1/sites?page=${encodeURIComponent(query.get('page') || '1')}`);
    return res.ok && payload?.success ? payload.data || { sites: [], total: 0 } : { sites: [], total: 0 };
  } catch {
    return { sites: [], total: 0 };
  }
}

export async function subscribeNetworkSite(userId: number, input: Record<string, unknown>) {
  const siteUrl = normalizedSiteUrl(input.site_url);
  if (!siteUrl) throw new NetworkServiceError(400, 'VALIDATION_ERROR', 'site_url 不能为空');
  const meta = await fetchRemoteMetadata(siteUrl).catch(() => ({ name: siteUrl, logo: '', favicon: '' }));
  const feedUrl = String(input.feed_url || `${siteUrl}/api/v1/feed`);
  await exec(
    `insert into ${table('rss_subscriptions')} (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
     values ($1,$2,$3,$4,$5,0,$6)
     on conflict (user_id, feed_url) do update set site_url=$2, site_name=$4, site_avatar=$5`,
    [userId, siteUrl, feedUrl, meta.name || siteUrl, meta.logo || meta.favicon || '', nowUnix()],
  );
  return { subscribed: true, site_name: meta.name || siteUrl, site_logo: meta.logo || '' };
}

export async function unsubscribeNetworkSite(userId: number, input: Record<string, unknown>) {
  await exec(`delete from ${table('rss_subscriptions')} where user_id = $1 and site_url = $2`, [userId, normalizedSiteUrl(input.site_url)]);
  return { unsubscribed: true };
}

export async function networkSubscriptions(userId: number) {
  return many<Record<string, unknown>>(
    `select * from ${table('rss_subscriptions')} where user_id = $1 order by created_at desc`, [userId],
  ).catch(() => []);
}

export async function pullNetworkContent(query: URLSearchParams) {
  const siteUrl = normalizedSiteUrl(query.get('site_url'));
  if (!siteUrl) throw new NetworkServiceError(400, 'VALIDATION_ERROR', 'site_url 参数不能为空');
  const safeSiteUrl = await assertPublicHttpUrl(siteUrl);
  const url = `${safeSiteUrl}/api/v1/network/content?type=${encodeURIComponent(query.get('type') || 'post')}${query.get('since') ? `&since=${encodeURIComponent(query.get('since') || '')}` : ''}`;
  const payload = await fetchJson<any>(url, 15000).catch((error) => ({ success: false, error: error instanceof Error ? error.message : '拉取内容失败' }));
  if (payload.success === false) throw new NetworkServiceError(502, 'PULL_FAILED', payload.error || '拉取内容失败');
  return payload.data || payload;
}

export async function publishNetworkNotification(input: Record<string, unknown>) {
  const rows = await many<{ source_site: string }>(
    `select distinct source_site from ${table('followers')} where coalesce(source_site,'') != ''`,
  ).catch(() => []);
  let notified = 0;
  for (const row of rows) {
    void assertPublicHttpUrl(row.source_site).then((siteUrl) => fetch(`${siteUrl}/api/v1/federation/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'new_content', site: config.appUrl, title: input.title || '', post_id: input.post_id || 0,
        content_type: input.content_type || 'post' }),
    })).catch(() => {});
    notified++;
  }
  const siteId = await optionValue('utterlog_site_id', '');
  if (siteId) {
    const siteTitle = await optionValue('site_title', 'Utterlog!');
    void hubRequest('POST', '/api/v1/activity', { site_id: siteId, type: 'new_content', title: input.title || '',
      content_type: input.content_type || 'post', url: config.appUrl, name: siteTitle || 'Utterlog!' }).catch(() => {});
  }
  return { notified };
}

export async function bindUtterlogId(userId: number, input: Record<string, unknown>) {
  const utterlogId = String(input.utterlog_id || '').trim();
  const token = String(input.token || '').trim();
  if (!utterlogId || !token) throw new NetworkServiceError(400, 'VALIDATION_ERROR', 'utterlog_id 和 token 不能为空');
  try {
    const data = await verifyUtterlogIdToken(utterlogId, token);
    await exec(`update ${table('users')} set utterlog_id = $1, utterlog_avatar = $2, updated_at = $3 where id = $4`,
      [utterlogId, String(data.avatar || ''), nowUnix(), userId]);
    return { bound: true, utterlog_id: utterlogId, utterlog_avatar: String(data.avatar || '') };
  } catch (error) {
    throw new NetworkServiceError(401, 'INVALID_TOKEN', error instanceof Error ? error.message : 'Utterlog ID 验证失败');
  }
}

export async function unbindUtterlogId(userId: number) {
  await exec(`update ${table('users')} set utterlog_id = '', utterlog_avatar = '', updated_at = $1 where id = $2`, [nowUnix(), userId]).catch(() => {});
  return { unbound: true };
}

export async function utterlogProfile(userId: number) {
  const user = await one<Record<string, unknown>>(
    `select username, email, nickname, avatar, coalesce(utterlog_id,'') as utterlog_id, coalesce(utterlog_avatar,'') as utterlog_avatar
     from ${table('users')} where id = $1`, [userId],
  ).catch(() => null);
  return { utterlog_id: String(user?.utterlog_id || ''), utterlog_avatar: String(user?.utterlog_avatar || ''),
    username: String(user?.username || ''), nickname: String(user?.nickname || user?.username || ''), email: String(user?.email || ''),
    avatar: String(user?.avatar || ''), avatar_url: String(user?.utterlog_avatar || user?.avatar || ''), bound: Boolean(user?.utterlog_id) };
}

export async function networkOauthAuthorization(userId: number) {
  const registered = await ensureNetworkRegistered();
  if (!registered.connected || !registered.site_id) throw new NetworkServiceError(502, 'NOT_CONNECTED', '无法连接 Utterlog 网络');
  const redirectUri = `${(await publicFrontendUrl()).replace(/\/+$/, '')}/api/v1/network/oauth/callback`;
  const state = `${Date.now()}-${userId}`;
  const authUrl = `${utterlogHub}/oauth/authorize?client_id=${encodeURIComponent(registered.site_id)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&response_type=code&scope=profile`;
  return { auth_url: authUrl, url: authUrl, state };
}

export async function networkOauthCallback(query: URLSearchParams) {
  const code = String(query.get('code') || '');
  const state = String(query.get('state') || '');
  const siteId = await optionValue('utterlog_site_id', '');
  const frontend = await publicFrontendUrl();
  const finish = (bound: boolean) => new Response(`<!doctype html><html><body><script>
    if (window.opener) { window.opener.location.reload(); }
    window.close();
    setTimeout(function(){ window.location.href = '${frontend}/admin/utterlog${bound ? '' : '?error=oauth_failed'}'; }, 500);
  </script><p>${bound ? '绑定成功' : '绑定失败'}，正在关闭...</p></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  if (!code || !state || !siteId) return finish(false);
  const { res, payload } = await hubRequest('POST', '/oauth/token', { grant_type: 'authorization_code', code, client_id: siteId,
    fingerprint: siteFingerprint(), redirect_uri: `${frontend}/api/v1/network/oauth/callback` })
    .catch(() => ({ res: null as any, payload: null as any }));
  if (!res?.ok) return finish(false);
  const data = payload?.data || payload || {};
  const userId = intParam(state.split('-').at(-1) || '', 0);
  if (userId > 0) {
    await exec(`update ${table('users')} set utterlog_id = $1, utterlog_avatar = $2, updated_at = $3 where id = $4`,
      [String(data.utterlog_id || ''), String(data.avatar || ''), nowUnix(), userId]).catch(() => {});
  }
  return finish(true);
}

export class SocialServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function followSocialSite(userId: number, input: Record<string, unknown>) {
  const siteUrl = normalizedSiteUrl(input.site_url || input.source_site);
  if (!siteUrl) throw new SocialServiceError(400, 'VALIDATION_ERROR', 'site_url 不能为空');
  let meta: Record<string, unknown>;
  try { meta = await fetchRemoteMetadata(siteUrl); }
  catch { throw new SocialServiceError(400, 'DISCOVERY_FAILED', '无法连接目标站点'); }
  const user = await one<{ username: string; nickname: string | null; avatar: string | null }>(
    `select username, nickname, avatar from ${table('users')} where id = $1`, [userId],
  ).catch(() => null);
  const ownMeta = await siteMetadata();
  void assertPublicHttpUrl(siteUrl).then((safeSiteUrl) => fetch(`${safeSiteUrl}/api/v1/federation/follow`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ follower_site: config.appUrl, follower_name: user?.nickname || user?.username || ownMeta.name || config.appUrl,
      follower_avatar: user?.avatar || ownMeta.logo || '', follower_url: config.appUrl }), signal: AbortSignal.timeout(10000),
  })).catch(() => {});
  const now = nowUnix();
  await exec(
    `insert into ${table('followers')} (user_id, follower_id, source_site, status, mutual, created_at, updated_at)
     values ($1,0,$2,'active',false,$3,$3)
     on conflict (user_id, source_site) where source_site != '' and following_id = 0 do update set status='active', updated_at=$3`,
    [userId, siteUrl, now],
  ).catch(async () => {
    await exec(
      `insert into ${table('followers')} (user_id, follower_id, source_site, status, mutual, created_at, updated_at)
       values ($1,0,$2,'active',false,$3,$3)`, [userId, siteUrl, now],
    ).catch(() => {});
  });
  const siteName = normalizeDisplayName(meta.name || meta.title) || siteUrl;
  const siteLogo = String(meta.logo || meta.favicon || '');
  await exec(
    `insert into ${table('rss_subscriptions')} (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
     values ($1,$2,$3,$4,$5,0,$6)
     on conflict (user_id, feed_url) do update set site_url=$2, site_name=$4, site_avatar=$5`,
    [userId, siteUrl, `${siteUrl}/api/v1/feed`, siteName, siteLogo, now],
  ).catch(() => {});
  const incoming = await one<{ count: string }>(
    `select count(*)::text as count from ${table('followers')} where following_id = $1 and source_site = $2`, [userId, siteUrl],
  ).catch(() => null);
  const mutual = Number(incoming?.count || 0) > 0;
  if (mutual) {
    await exec(`update ${table('followers')} set mutual = true, updated_at = $2 where source_site = $1 and (user_id = $3 or following_id = $3)`,
      [siteUrl, now, userId]).catch(() => {});
    await exec(
      `insert into ${table('links')} (name, url, description, logo, status, order_num, created_at, updated_at)
       values ($1,$2,'互关好友',$3,1,0,$4,$4) on conflict do nothing`, [siteName, siteUrl, siteLogo, now],
    ).catch(() => {});
  }
  return { followed: true, mutual, rss_subscribed: true };
}

export async function unfollowSocialSite(userId: number, input: Record<string, unknown>) {
  const siteUrl = normalizedSiteUrl(input.site_url || input.source_site);
  await exec(`delete from ${table('followers')} where user_id = $1 and source_site = $2`, [userId, siteUrl]).catch(() => {});
  await exec(`delete from ${table('rss_subscriptions')} where user_id = $1 and site_url = $2`, [userId, siteUrl]).catch(() => {});
  return { unfollowed: true };
}

export async function socialFollowStatus(userId: number, rawSiteUrl: unknown) {
  const siteUrl = normalizedSiteUrl(rawSiteUrl);
  if (!siteUrl) throw new SocialServiceError(400, 'VALIDATION_ERROR', 'site_url 参数不能为空');
  const row = await one<{ count: string; mutual: boolean }>(
    `select count(*)::text as count, coalesce(bool_or(mutual), false) as mutual
     from ${table('followers')} where user_id = $1 and source_site = $2`, [userId, siteUrl],
  ).catch(() => null);
  return { following: Number(row?.count || 0) > 0, mutual: row?.mutual === true };
}

export async function socialFollowing(userId: number) {
  return many<Record<string, unknown>>(
    `select f.*, rs.site_name, rs.site_url from ${table('followers')} f
     left join ${table('rss_subscriptions')} rs on f.source_site = rs.site_url and rs.user_id = $1
     where f.user_id = $1 and coalesce(f.source_site,'') != '' order by f.created_at desc`, [userId],
  ).catch(() => []);
}

export async function socialManagement(userId: number) {
  const following = await socialFollowing(userId);
  const followers = await many<Record<string, unknown>>(
    `select * from ${table('followers')} where following_id = $1 and coalesce(source_site,'') != '' order by created_at desc`, [userId],
  ).catch(() => []);
  const mutual = following.filter((row) => row.mutual === true);
  return { following, followers, mutual, counts: { following: following.length, followers: followers.length, mutual: mutual.length } };
}
