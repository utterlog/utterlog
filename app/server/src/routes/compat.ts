import type { Hono } from 'hono';
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
import { appendFile, cp, mkdir, rm } from 'node:fs/promises';
import { isIP } from 'node:net';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, extname, join, posix } from 'node:path';
import { auth, currentUserId, optionalAuth } from '../auth/middleware';
import { signAccessToken, signRefreshToken, verifyAccessToken } from '../auth/jwt';
import { config, table } from '../config';
import { exec, intParam, many, nowUnix, one, pageParams } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';
import { sendConfiguredEmail } from '../email';
import { assertPublicHttpUrl, normalizePublicHttpUrl } from '../http/public-url';
import { badRequest, forbidden, notFound, ok, paginate, unauthorized } from '../http/response';
import { publicStorageUrl, putStorageObject, storageSettings, storeUploadedBytes } from '../media/storage';
import { runtimePaths } from '../paths';
import { ephemeral } from '../store/ephemeral';
import { appVersion } from '../system/metrics';
import { defaultWeatherLocation, fetchVisitorWeather, visitorWeatherLocation } from '../weather';
import { runSyncFinishWorker } from '../sync/worker';
import { lookupGeoIp, normalizeGeoProvider, publicIpForGeo } from '../geoip';
import { sendFollowTelegram } from '../telegram';
import { botSqlPattern } from '../bot-detect';
import { registerCodingRoutes } from './coding';
import { registerAiRoutes } from './ai';
import { registerTelegramRoutes } from './telegram';
import { registerSecurityRoutes } from './security';
import { registerFootprintRoutes } from './footprints';
import { registerExtensionRoutes } from './extensions';
import {
  addCommentReplyOptout,
  verifyCommentReplyUnsubscribe,
} from '../email/comment-reply-unsubscribe';
import {
  registerBackupRoutes,
  startBackupScheduler,
} from './backup';

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
  const appURL = configured.replace(/\/+$/, '') || 'http://localhost:8080';
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

async function runCommandEnv(cmd: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env, PGPASSWORD: config.dbPassword },
  });
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
  const res = await fetch(safeFeedUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
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
     on conflict (user_id, feed_url) do nothing`,
  ).catch(() => {});
}

export async function runFeedFetch(limit = 0) {
  await mirrorLinkSubscriptions();
  const subs = await many<{ id: number; feed_url: string }>(
    `select id, feed_url from ${table('rss_subscriptions')} order by last_fetched_at asc ${limit > 0 ? `limit ${limit}` : ''}`,
  ).catch(() => []);
  let fetched = 0;
  let newItems = 0;
  for (const sub of subs) {
    let items: Awaited<ReturnType<typeof fetchRssFeed>> = [];
    try {
      items = await fetchRssFeed(sub.feed_url);
    } catch {
      continue;
    }
    fetched++;
    const now = nowUnix();
    for (const item of items) {
      const result = await exec(
        `insert into ${table('feed_items')} (subscription_id, title, link, description, pub_date, guid, created_at)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
        [sub.id, item.title, item.link, item.description, item.pub_date, item.guid, now],
      ).catch(() => null);
      if (Array.isArray(result) && (result as any).count) newItems++;
    }
    await exec(`update ${table('rss_subscriptions')} set last_fetched_at = $1 where id = $2`, [now, sub.id]).catch(() => {});
  }
  await exec(`delete from ${table('feed_items')} where created_at < $1`, [nowUnix() - 7 * 24 * 3600]).catch(() => {});
  if (newItems > 0) {
    await exec(
      `insert into ${table('notifications')} (user_id, type, title, content, created_at)
       values (1,'feed','关注动态更新',$1,$2)`,
      [`发现 ${newItems} 条新内容`, nowUnix()],
    ).catch(() => {});
  }
  return { fetched, new_items: newItems };
}

function feedUserId(c: any) {
  return currentUserId(c) || 1;
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

async function siteMetadata() {
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

async function listNetworkContent(c: any) {
  const sp = new URL(c.req.url).searchParams;
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
  return ok(c, { site: { name: meta.name, url: meta.url, logo: meta.logo }, items: rows, total: Number(total?.count || 0), page, per_page: perPage });
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

async function fetchReleaseList() {
  const source = (await optionValue('version_source_url', '')).trim().replace(/\/+$/, '');
  const url = source ? `${source}/api/releases.json` : 'https://utterlog.io/api/releases.json';
  const fallback = 'https://api.github.com/repos/utterlog/utterlog/releases?per_page=20';
  const payload = await fetchJson<any>(url, 8000).catch(() => fetchJson<any>(fallback, 8000));
  return Array.isArray(payload) ? payload : payload.releases || [];
}

const upgradeLogPath = join(config.uploadDir, 'upgrade.log');

function logTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function appendUpgradeLog(line: string) {
  await mkdir(config.uploadDir, { recursive: true }).catch(() => {});
  await appendFile(upgradeLogPath, `${logTime()} ${line}\n`).catch(() => {});
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

async function dockerOk(args: string[]) {
  try {
    const out = await runCommand(['docker', ...args]);
    return out.code === 0;
  } catch {
    return false;
  }
}

async function dockerOutput(args: string[]) {
  try {
    const out = await runCommand(['docker', ...args]);
    return out.code === 0 ? out.stdout.trim() : '';
  } catch {
    return '';
  }
}

async function currentAppContainerName() {
  const explicit = String(process.env.UTTERLOG_APP_CONTAINER || process.env.UTTERLOG_API_CONTAINER || '').trim();
  if (explicit) return explicit;
  const inspected = await dockerOutput(['inspect', '--format', '{{.Name}}', hostname()]);
  const name = inspected.replace(/^\/+/, '').trim();
  return name || 'utterlog-app-1';
}

async function probeComposeWorkingDir(appName: string) {
  const explicit = String(process.env.UTTERLOG_INSTALL_DIR || '').trim();
  const inspected = await dockerOutput([
    'inspect',
    '--format',
    '{{ index .Config.Labels "com.docker.compose.project.working_dir"}}',
    appName,
  ]);
  return inspected || explicit || '/opt/utterlog';
}

async function probeAppUploadsMountSource(appName: string) {
  const out = await dockerOutput([
    'inspect',
    '--format',
    '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Type}}|{{or .Name .Source}}{{end}}{{end}}',
    appName,
  ]);
  const parts = out.split('|');
  return parts.length === 2 ? parts[1].trim() : '';
}

async function runtimeUpgradeProbe() {
  if (!upgradeEnvEnabled()) return { supported: false, reason: 'runtime upgrade disabled by env' };
  if (!existsSync('/var/run/docker.sock')) return { supported: false, reason: 'docker socket not mounted' };
  if (!await dockerOk(['version', '--format', '{{.Server.Version}}'])) return { supported: false, reason: 'docker daemon unavailable' };
  if (!await dockerOk(['compose', 'version'])) return { supported: false, reason: 'docker compose unavailable' };
  const appName = await currentAppContainerName();
  const installDir = await probeComposeWorkingDir(appName);
  return { supported: true, reason: '', appName, installDir };
}

async function upgradeStatusPayload() {
  const stored = parseJsonOption<any>(await ephemeral.get('system:upgrade:status') || '{}', {});
  const logTail = await readUpgradeLogTail();
  const terminal = logTail.includes('[TASK-END]');
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
    running: Boolean(stored.running),
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

async function runSystemUpgrade() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    const probe = await runtimeUpgradeProbe();
    if (!probe.supported) {
      await appendUpgradeLog(`ERROR ${probe.reason}`);
      await appendUpgradeLog('升级应用 [Utterlog] 失败 [TASK-END]');
      await markUpgradeStatus({ running: false, finished: true, success: false, message: probe.reason });
      return;
    }

    const appName = probe.appName || await currentAppContainerName();
    const installDir = probe.installDir || await probeComposeWorkingDir(appName);
    const uploadsSource = await probeAppUploadsMountSource(appName);
    await appendUpgradeLog(`检测容器名 app=[${appName}]`);
    await appendUpgradeLog(`检测安装目录 [${installDir}]`);
    if (uploadsSource) await appendUpgradeLog(`检测 uploads 挂载源 [${uploadsSource}]（与 app 共享）`);

    const script = `
set -e
LOG_DIR="\${APP_UPLOADS_DIR:-$INSTALL_DIR/uploads}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/upgrade.log"
exec >>"$LOG" 2>&1
ts() { date '+%Y/%m/%d %H:%M:%S'; }
log() { echo "$(ts) $*"; }
log "升级应用 [Utterlog] 任务开始 [START]"
log "检测容器名 app=[$APP_CONTAINER]"
log "检测安装目录 [$INSTALL_DIR]"
cd "$INSTALL_DIR"

MODE="\${UTTERLOG_COMPOSE_MODE:-}"
if [ -z "$MODE" ]; then
  if [ -f docker-compose.prod.yml ] && [ -f docker-compose.pull.yml ]; then
    MODE=overlay
  elif [ -f docker-compose.yml ]; then
    MODE=slim
  else
    log "ERROR 未找到 docker-compose 文件 [$INSTALL_DIR]"
    log "升级应用 [Utterlog] 失败 [TASK-END]"
    exit 1
  fi
fi
log "检测部署模式 [$MODE]"

compose() {
  case "$MODE" in
    overlay) docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml "$@" ;;
    slim)    docker compose "$@" ;;
    *)       log "ERROR 未知部署模式 [$MODE]"; return 2 ;;
  esac
}

persist_env() {
  local key="$1" value="$2"
  if [ -f .env ]; then
    if grep -q "^\${key}=" .env 2>/dev/null; then
      sed -i.bak "s|^\${key}=.*|\${key}=\${value}|" .env
    else
      echo "\${key}=\${value}" >> .env
    fi
    rm -f .env.bak
  fi
}

run_timeout() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  else
    "$@"
  fi
}

has_app_manifest() {
  local prefix="$1"
  local tag="\${UTTERLOG_IMAGE_TAG:-latest}"
  run_timeout 20 docker manifest inspect "$prefix/utterlog-app:$tag" >/dev/null 2>&1
}

select_image_source() {
  if [ -n "\${UTTERLOG_IMAGE_PREFIX:-}" ]; then
    export UTTERLOG_IMAGE_PREFIX="\${UTTERLOG_IMAGE_PREFIX%/}"
    persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
    log "使用已配置镜像源 [$UTTERLOG_IMAGE_PREFIX]"
    return 0
  fi
  log "探测镜像源 [registry.utterlog.io/utterlog]"
  if has_app_manifest "registry.utterlog.io/utterlog"; then
    export UTTERLOG_IMAGE_PREFIX="registry.utterlog.io/utterlog"
    persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
    log "选择镜像源 [$UTTERLOG_IMAGE_PREFIX]"
    return 0
  fi
  log "WARN registry.utterlog.io manifest 不可读，切换到 [ghcr.io/utterlog]"
  export UTTERLOG_IMAGE_PREFIX="ghcr.io/utterlog"
  persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
}

select_image_source

if compose config --services | grep -qx postgres; then
  log "拉取基础镜像 [postgres]"
  if compose pull postgres; then
    log "拉取基础镜像 成功"
  else
    log "WARN 拉取 postgres 失败，继续升级 app"
  fi
fi

log "拉取应用镜像 [app] —— 源 [$UTTERLOG_IMAGE_PREFIX]"
if compose pull app; then
  log "拉取应用镜像 成功"
else
  if [ "\${UTTERLOG_IMAGE_PREFIX:-}" != "ghcr.io/utterlog" ]; then
    log "WARN $UTTERLOG_IMAGE_PREFIX 拉取失败，fallback 到 [ghcr.io/utterlog]"
    export UTTERLOG_IMAGE_PREFIX="ghcr.io/utterlog"
    persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
    if compose pull app; then
      log "拉取应用镜像 成功 (ghcr.io fallback)"
    else
      log "ERROR 应用镜像拉取失败 [app]（ghcr.io fallback 也失败）"
      log "升级应用 [Utterlog] 失败 [TASK-END]"
      exit 1
    fi
  else
    log "ERROR 应用镜像拉取失败 [app]"
    log "升级应用 [Utterlog] 失败 [TASK-END]"
    exit 1
  fi
fi

log "重建容器 [app]"
compose up -d --remove-orphans app
log "重建容器 成功"

log "等待 app 健康检查 [$APP_CONTAINER]"
HEALTHY=0
for i in $(seq 1 60); do
  code=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$APP_CONTAINER" 2>/dev/null || echo unknown)
  if [ "$code" = "healthy" ] || [ "$code" = "running" ]; then
    log "app 健康检查 成功 (\${i}s state=$code)"
    HEALTHY=1
    break
  fi
  sleep 2
done
if [ "$HEALTHY" != "1" ]; then
  log "WARN app 120s 内未进入 healthy/running 状态 (state=$code)，请检查 [docker logs $APP_CONTAINER]"
fi

IMG=$(docker inspect "$APP_CONTAINER" --format='{{.Config.Image}}' 2>/dev/null || echo '?')
DIGEST=$(docker inspect "$APP_CONTAINER" --format='{{.Image}}' 2>/dev/null | cut -c1-19)
log "当前镜像 [$IMG] digest=[$DIGEST]"
log "升级应用 [Utterlog] 成功 [TASK-END]"
`;

    const sidecarName = `utterlog-upgrade-${Date.now()}`;
    const dockerArgs = [
      'run', '--rm', '-d',
      '--name', sidecarName,
      '-v', '/var/run/docker.sock:/var/run/docker.sock',
      '-v', `${installDir}:${installDir}`,
    ];
    if (uploadsSource) dockerArgs.push('-v', `${uploadsSource}:/app-uploads`);
    dockerArgs.push(
      '-e', `INSTALL_DIR=${installDir}`,
      '-e', `UTTERLOG_COMPOSE_MODE=${process.env.UTTERLOG_COMPOSE_MODE || ''}`,
      '-e', `APP_CONTAINER=${appName}`,
      ...(uploadsSource ? ['-e', 'APP_UPLOADS_DIR=/app-uploads'] : []),
      '-w', installDir,
      'registry.utterlog.io/utterlog/docker:27-cli',
      'sh', '-c', script,
    );

    const launched = await runCommandEnv(['docker', ...dockerArgs], {
      UTTERLOG_IMAGE_PREFIX: process.env.UTTERLOG_IMAGE_PREFIX || '',
      UTTERLOG_IMAGE_TAG: process.env.UTTERLOG_IMAGE_TAG || '',
    });
    if (launched.code !== 0) {
      await appendUpgradeLog(`ERROR 启动 sidecar 容器失败：${launched.stderr || launched.stdout || 'unknown error'}`);
      await appendUpgradeLog('升级应用 [Utterlog] 失败 [TASK-END]');
      await markUpgradeStatus({ running: false, finished: true, success: false, message: launched.stderr || 'sidecar start failed' });
      return;
    }
    await appendUpgradeLog(`sidecar 容器 [${sidecarName}] 启动 成功`);
    await appendUpgradeLog(`app 容器 [${appName}] 即将被 sidecar 重建（正常现象，sidecar 独立运行）`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upgrade failed';
    await appendUpgradeLog(`ERROR ${message}`);
    await appendUpgradeLog('升级应用 [Utterlog] 失败 [TASK-END]');
    await markUpgradeStatus({ running: false, finished: true, success: false, message });
  }
}

async function versionPayload() {
  const current = appVersion();
  const releases = await fetchReleaseList().catch(() => []);
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

export function registerCompatRoutes(app: Hono) {
  startBackupScheduler();
  registerCodingRoutes(app);
  registerBackupRoutes(app);
  registerAiRoutes(app);
  registerTelegramRoutes(app);
  registerSecurityRoutes(app);
  registerFootprintRoutes(app);
  registerExtensionRoutes(app);

  app.post('/api/v1/auth/totp/setup', auth, async (c) => {
    const existing = await one<{ totp_enabled: boolean }>(
      `select coalesce(totp_enabled, false) as totp_enabled from ${table('users')} where id = $1`,
      [currentUserId(c)],
    ).catch(() => null);
    if (existing?.totp_enabled) return badRequest(c, '两步验证已启用', 'TOTP_ALREADY_ENABLED');
    const secret = base32Encode(randomBytes(20));
    await exec(`update ${table('users')} set totp_secret = $1 where id = $2`, [secret, currentUserId(c)]).catch(() => {});
    const user = await one<{ email: string; username: string }>(`select email, username from ${table('users')} where id = $1`, [currentUserId(c)]).catch(() => null);
    const label = encodeURIComponent(`${await optionValue('site_title', 'Utterlog')}:${user?.email || user?.username || currentUserId(c)}`);
    const issuer = encodeURIComponent(await optionValue('site_title', 'Utterlog'));
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    return ok(c, { secret, uri, qr_code: uri });
  });
  app.post('/api/v1/auth/totp/verify', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const user = await one<{ totp_secret: string; totp_enabled: boolean }>(
      `select totp_secret, coalesce(totp_enabled, false) as totp_enabled from ${table('users')} where id = $1`,
      [currentUserId(c)],
    ).catch(() => null);
    if (user?.totp_enabled) return badRequest(c, '两步验证已启用', 'TOTP_ALREADY_ENABLED');
    if (!user?.totp_secret) return badRequest(c, '请先设置两步验证', 'TOTP_NOT_SETUP');
    if (!user?.totp_secret || !verifyTotp(user.totp_secret, String(body.code || ''))) return c.json({ success: false, error: { code: 'INVALID_TOTP', message: '验证码错误' } }, 400);
    const backup = await generateTotpBackupCodes();
    await exec(
      `update ${table('users')} set totp_enabled = true, totp_backup_codes = $1, updated_at = $2 where id = $3`,
      [JSON.stringify(backup.hashes), nowUnix(), currentUserId(c)],
    ).catch(() => {});
    return ok(c, { enabled: true, backup_codes: backup.codes });
  });
  app.post('/api/v1/auth/totp/disable', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const password = String(body.password || '').trim();
    const code = String(body.code || '').trim();
    if (!password || !code) return badRequest(c, '密码和验证码不能为空');
    const user = await one<{ id: number; password: string; totp_secret: string; totp_enabled: boolean; totp_backup_codes: string | null }>(
      `select id, password, totp_secret, coalesce(totp_enabled, false) as totp_enabled, totp_backup_codes from ${table('users')} where id = $1`,
      [currentUserId(c)],
    ).catch(() => null);
    if (!user) return notFound(c, '用户');
    if (!user.totp_enabled) return badRequest(c, '两步验证未启用', 'TOTP_NOT_ENABLED');
    const passwordOK = await Bun.password.verify(password, user.password).catch(() => false);
    if (!passwordOK) return c.json({ success: false, error: { code: 'INVALID_PASSWORD', message: '密码错误' } }, 401);
    const codeOK = verifyTotp(user.totp_secret, code) || await consumeTotpBackupCode(user.id, user.totp_backup_codes, code);
    if (!codeOK) return badRequest(c, '验证码错误', 'INVALID_CODE');
    await exec(
      `update ${table('users')} set totp_enabled = false, totp_secret = '', totp_backup_codes = '', updated_at = $1 where id = $2`,
      [nowUnix(), currentUserId(c)],
    ).catch(() => {});
    return ok(c, { enabled: false });
  });
  app.post('/api/v1/auth/totp/validate', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const tempToken = String(body.temp_token || '').trim();
    if (!tempToken) return unauthorized(c, '临时 Token 无效或已过期');
    const userId = intParam(await ephemeral.get(`totp-login:${tempToken}`) || '');
    if (!userId) return unauthorized(c, '临时 Token 无效或已过期');
    const user = await one<{ id: number; username: string; email: string; nickname: string | null; avatar: string | null; role: string; totp_secret: string; totp_enabled: boolean; totp_backup_codes: string | null }>(
      `select id, username, email, nickname, avatar, role, totp_secret, totp_enabled, totp_backup_codes from ${table('users')} where id = $1`,
      [userId],
    ).catch(() => null);
    const code = String(body.code || '');
    const codeOK = !!user?.totp_enabled && (verifyTotp(user.totp_secret, code) || await consumeTotpBackupCode(user.id, user.totp_backup_codes, code));
    if (!codeOK) return c.json({ success: false, error: { code: 'INVALID_TOTP', message: '验证码错误' } }, 400);
    if (tempToken) await ephemeral.del(`totp-login:${tempToken}`);
    return ok(c, await issueCompatTokens(user));
  });
  app.post('/api/v1/auth/passkey/register/begin', auth, async (c) => {
    const user = await one<{ id: number; username: string; email: string; nickname: string | null }>(
      `select id, username, email, nickname from ${table('users')} where id = $1`,
      [currentUserId(c)],
    );
    if (!user) return notFound(c, '用户不存在');
    const { rpID } = await webAuthnRp();
    const existing = await many<{ credential_id: Uint8Array }>(`select credential_id from ${table('passkeys')} where user_id = $1`, [user.id]).catch(() => []);
    const publicKey = await generateRegistrationOptions({
      rpName: await optionValue('site_title', 'Utterlog'),
      rpID,
      userID: webAuthnUserId(user.id),
      userName: user.email || user.username,
      userDisplayName: user.nickname || user.username,
      attestationType: 'none',
      excludeCredentials: existing.map((row) => ({ id: bufferToBase64url(row.credential_id) })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    const sessionId = randomUUID();
    await ephemeral.set(`webauthn:${sessionId}`, JSON.stringify({ challenge: publicKey.challenge, user_id: user.id }), 300);
    return ok(c, { publicKey, session_id: sessionId });
  });
  app.post('/api/v1/auth/passkey/register/finish', auth, async (c) => {
    const body = await c.req.json().catch(() => ({})) as RegistrationResponseJSON & { name?: string; session_id?: string };
    const sessionId = c.req.header('X-WebAuthn-Session') || String(body.session_id || '').trim();
    const session = JSON.parse(await ephemeral.get(`webauthn:${sessionId}`) || 'null') as { challenge: string; user_id: number } | null;
    if (!session || session.user_id !== currentUserId(c)) return badRequest(c, '会话已过期，请重试', 'SESSION_EXPIRED');
    await ephemeral.del(`webauthn:${sessionId}`);
    const { origin, rpID } = await webAuthnRp();
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: session.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    }).catch((err) => {
      throw new Error(err instanceof Error ? err.message : 'Passkey 注册验证失败');
    });
    if (!verification.verified || !verification.registrationInfo) return badRequest(c, 'Passkey 注册验证失败', 'REGISTRATION_FAILED');
    const info = verification.registrationInfo;
    await exec(
      `insert into ${table('passkeys')} (user_id, credential_id, public_key, attestation_type, aaguid, sign_count, backup_eligible, backup_state, name, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (credential_id) do update set name = excluded.name`,
      [
        currentUserId(c),
        base64urlToBuffer(info.credential.id),
        Buffer.from(info.credential.publicKey),
        info.fmt || '',
        Buffer.from(String(info.aaguid || '').replace(/-/g, ''), 'hex'),
        info.credential.counter || 0,
        info.credentialDeviceType === 'multiDevice',
        info.credentialBackedUp,
        String(body.name || c.req.query('name') || c.req.header('X-Passkey-Name') || '通行密钥'),
        nowUnix(),
      ],
    );
    return ok(c, { ok: true });
  });
  app.post('/api/v1/auth/passkey/login/begin', async (c) => {
    const owner = await siteOwner();
    if (!owner) return badRequest(c, '未找到管理员', 'NO_USER');
    const credentials = await many<{ credential_id: Uint8Array }>(`select credential_id from ${table('passkeys')} where user_id = $1`, [owner.id]).catch(() => []);
    if (credentials.length === 0) return badRequest(c, '未注册通行密钥', 'NO_PASSKEYS');
    const { rpID } = await webAuthnRp();
    const publicKey = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((row) => ({ id: bufferToBase64url(row.credential_id) })),
      userVerification: 'preferred',
    });
    const sessionId = randomUUID();
    await ephemeral.set(`webauthn:${sessionId}`, JSON.stringify({ challenge: publicKey.challenge, user_id: owner.id }), 300);
    return ok(c, { publicKey, session_id: sessionId });
  });
  app.post('/api/v1/auth/passkey/login/finish', async (c) => {
    const body = await c.req.json().catch(() => ({})) as AuthenticationResponseJSON & { session_id?: string };
    const sessionId = c.req.header('X-WebAuthn-Session') || String(body.session_id || '').trim();
    const session = JSON.parse(await ephemeral.get(`webauthn:${sessionId}`) || 'null') as { challenge: string; user_id: number } | null;
    if (!session) return badRequest(c, '会话已过期', 'SESSION_EXPIRED');
    await ephemeral.del(`webauthn:${sessionId}`);
    const cred = await one<{ user_id: number; credential_id: Uint8Array; public_key: Uint8Array; sign_count: number }>(
      `select user_id, credential_id, public_key, sign_count from ${table('passkeys')} where credential_id = $1`,
      [base64urlToBuffer(body.rawId || body.id)],
    );
    if (!cred || cred.user_id !== session.user_id) return badRequest(c, '通行密钥不存在', 'AUTH_FAILED');
    const { origin, rpID } = await webAuthnRp();
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: session.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: bufferToBase64url(cred.credential_id),
        publicKey: new Uint8Array(cred.public_key),
        counter: Number(cred.sign_count || 0),
      },
      requireUserVerification: false,
    }).catch((err) => {
      throw new Error(err instanceof Error ? err.message : 'Passkey 认证失败');
    });
    if (!verification.verified) return badRequest(c, 'Passkey 认证失败', 'AUTH_FAILED');
    await exec(
      `update ${table('passkeys')} set sign_count = $1, backup_eligible = $2, backup_state = $3, last_used_at = $4 where credential_id = $5`,
      [
        verification.authenticationInfo.newCounter,
        verification.authenticationInfo.credentialDeviceType === 'multiDevice',
        verification.authenticationInfo.credentialBackedUp,
        nowUnix(),
        base64urlToBuffer(verification.authenticationInfo.credentialID),
      ],
    );
    const user = await one<{ id: number; username: string; email: string; nickname: string | null; avatar: string | null; role: string }>(
      `select id, username, email, nickname, avatar, role from ${table('users')} where id = $1`,
      [cred.user_id],
    );
    if (!user) return badRequest(c, '用户不存在', 'NO_USER');
    return ok(c, await issueCompatTokens(user));
  });
  app.get('/api/v1/auth/passkey/available', async (c) => {
    const row = await one<{ count: string }>(`select count(*)::text as count from ${table('passkeys')}`).catch(() => null);
    return ok(c, { available: Number(row?.count || 0) > 0, registered: Number(row?.count || 0) });
  });
  app.get('/api/v1/passkeys', auth, async (c) => {
    const rows = await many<Record<string, unknown>>(
      `select id, name, sign_count, last_used_at, created_at, backup_eligible, backup_state
       from ${table('passkeys')} where user_id = $1 order by created_at desc`,
      [currentUserId(c)],
    ).catch(() => []);
    return ok(c, rows);
  });
  app.delete('/api/v1/passkeys/:id', auth, async (c) => {
    await exec(`delete from ${table('passkeys')} where id = $1 and user_id = $2`, [c.req.param('id'), currentUserId(c)]).catch(() => {});
    return ok(c, null);
  });

  app.post('/api/v1/profile/send-code', auth, async (c) => {
    const user = await one<{ email: string; username: string }>(`select email, username from ${table('users')} where id = $1`, [currentUserId(c)]);
    if (!user?.email) return badRequest(c, '用户邮箱不存在');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await ephemeral.set(`email_code:${currentUserId(c)}`, code, 300);
    await sendConfiguredEmail(user.email, 'Utterlog 验证码', `<p>你的验证码是：<strong>${code}</strong></p><p>5 分钟内有效。</p>`);
    return ok(c, { sent: true });
  });
  app.post('/api/v1/options/test-email', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    let to = String(body.to || '').trim();
    if (!to) to = (await optionValue('admin_email', '')).trim();
    if (!to) {
      const user = await one<{ email: string }>(`select email from ${table('users')} where id = $1`, [currentUserId(c)]).catch(() => null);
      to = String(user?.email || '').trim();
    }
    if (!to) return badRequest(c, '测试收件人不能为空，请先填写管理员邮箱或当前用户邮箱');
    const siteName = await optionValue('site_title', 'Utterlog');
    await sendConfiguredEmail(to, `${siteName} - 测试邮件`, `<p>如果你收到这封邮件，说明 Utterlog 邮件服务已配置成功。</p>`);
    return ok(c, { sent: true, message: `测试邮件已发送到 ${to}`, to });
  });

  app.get('/api/v1/notifications', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const { page, perPage, offset } = pageParams(sp);
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('notifications')} where user_id = $1`, [currentUserId(c)]).catch(() => null);
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('notifications')} where user_id = $1 order by created_at desc, id desc limit $2 offset $3`,
      [currentUserId(c), perPage, offset],
    ).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.get('/api/v1/notifications/unread-count', auth, async (c) => {
    const row = await one<{ count: string }>(
      `select count(*)::text as count from ${table('notifications')} where user_id = $1 and is_read = false`,
      [currentUserId(c)],
    ).catch(() => null);
    return ok(c, { count: Number(row?.count || 0) });
  });
  app.get('/api/v1/notifications/stream', async (c) => {
    const token = String(new URL(c.req.url).searchParams.get('token') || '').trim();
    if (!token) return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '缺少 token' } }, 401);
    let userId = 0;
    try {
      userId = (await verifyAccessToken(token)).userId;
      const user = await one<{ status: string }>(`select status from ${table('users')} where id = $1`, [userId]);
      if (!user || user.status !== 'active') throw new Error('inactive user');
    } catch {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token 无效或已过期' } }, 401);
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`: connected user=${userId}\n\n`));
        timer = setInterval(() => {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        }, 25_000);
      },
      cancel() {
        if (timer) clearInterval(timer);
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });
  app.post('/api/v1/notifications/:id/read', auth, async (c) => {
    await exec(`update ${table('notifications')} set is_read = true where id = $1 and user_id = $2`, [c.req.param('id'), currentUserId(c)]).catch(() => {});
    return ok(c, null);
  });
  app.post('/api/v1/notifications/read-all', auth, async (c) => {
    await exec(`update ${table('notifications')} set is_read = true where user_id = $1`, [currentUserId(c)]).catch(() => {});
    return ok(c, null);
  });
  app.delete('/api/v1/notifications/:id', auth, async (c) => {
    await exec(`delete from ${table('notifications')} where id = $1 and user_id = $2`, [c.req.param('id'), currentUserId(c)]).catch(() => {});
    return ok(c, null);
  });


  app.get('/api/v1/annotations', async (c) => {
    const postId = intParam(new URL(c.req.url).searchParams.get('post_id') || undefined);
    if (!postId) return badRequest(c, 'post_id 不能为空');
    const rows = await many<Record<string, unknown>>(
      `select id, post_id, block_id, user_name, coalesce(user_avatar,'') as user_avatar,
              coalesce(user_site,'') as user_site, coalesce(utterlog_id,'') as utterlog_id,
              content, created_at
       from ${table('annotations')} where post_id = $1 order by created_at asc`,
      [postId],
    );
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const row of rows) {
      const block = String(row.block_id || '');
      grouped[block] ||= [];
      grouped[block].push(row);
    }
    return ok(c, { annotations: grouped, total: rows.length });
  });
  app.post('/api/v1/annotations', optionalAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const postId = intParam(String(body.post_id || ''));
    const blockId = String(body.block_id || '').trim();
    const content = String(body.content || '').trim();
    if (!postId || !blockId || !content) return badRequest(c, 'post_id、block_id、content 不能为空');

    let userName = '';
    let userEmail = '';
    let userAvatar = '';
    let userSite = '';
    let utterlogId = '';

    if (body.federation_token) {
      try {
        const claims: any = decodeJwt(String(body.federation_token));
        userName = String(claims.nickname || claims.name || '');
        userEmail = String(claims.email || '');
        userAvatar = String(claims.avatar || '');
        userSite = String(claims.site || '');
        utterlogId = String(claims.utterlog_id || '');
      } catch {
        // Invalid remote tokens fall through to local identity.
      }
    }

    const userId = currentUserId(c);
    if (!userName && userId > 0) {
      const user = await one<Record<string, unknown>>(
        `select username, email, nickname, avatar, utterlog_avatar, utterlog_id from ${table('users')} where id = $1`,
        [userId],
      );
      if (user) {
        userName = String(user.nickname || user.username || '');
        userEmail = String(user.email || '');
        userAvatar = String(user.utterlog_avatar || user.avatar || '');
        userSite = config.appUrl;
        utterlogId = String(user.utterlog_id || '');
      }
    }

    if (!userName) return forbidden(c, '需要登录才能发表点评');
    const rows = await many<{ id: number }>(
      `insert into ${table('annotations')}
       (post_id, block_id, user_name, user_email, user_avatar, user_site, utterlog_id, content, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [postId, blockId, userName, userEmail, userAvatar, userSite, utterlogId, content, nowUnix()],
    );
    return ok(c, { id: rows[0]?.id || 0 });
  });
  app.get('/api/v1/admin/annotations', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const { page, perPage, offset } = pageParams(sp);
    const postId = intParam(sp.get('post_id') || undefined);
    const where = postId ? 'where a.post_id = $1' : '';
    const params: unknown[] = postId ? [postId] : [];
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('annotations')} a ${where}`, params);
    const rows = await many<Record<string, unknown>>(
      `select a.id, a.post_id, a.block_id, a.user_name, coalesce(a.user_email,'') as user_email,
              coalesce(a.user_avatar,'') as user_avatar, coalesce(a.user_site,'') as user_site,
              coalesce(a.utterlog_id,'') as utterlog_id, a.content, a.created_at,
              coalesce(p.title,'') as post_title, coalesce(p.slug,'') as post_slug
       from ${table('annotations')} a left join ${table('posts')} p on p.id = a.post_id
       ${where} order by a.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    );
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.delete('/api/v1/admin/annotations/:id', auth, async (c) => {
    await exec(`delete from ${table('annotations')} where id = $1`, [c.req.param('id')]);
    return ok(c, { deleted: true });
  });
  app.post('/api/v1/admin/annotations/batch-delete', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0) : [];
    if (ids.length === 0) return badRequest(c, 'ids 不能为空');
    await exec(`delete from ${table('annotations')} where id = any($1::int[])`, [ids]);
    return ok(c, { deleted: ids.length });
  });

  app.get('/api/v1/visitor/weather', async (c) => {
    c.header('Cache-Control', 'private, max-age=600');
    const optionReader = (name: string, fallback = '') => optionValue(name, fallback);
    const ip = (
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-real-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      '127.0.0.1'
    );
    let { location, fallback } = await visitorWeatherLocation(ip, optionReader);
    let data = await fetchVisitorWeather(location, optionReader).catch(() => null);
    if (!data && location.source !== 'default') {
      location = await defaultWeatherLocation(optionReader);
      fallback = true;
      data = await fetchVisitorWeather(location, optionReader).catch(() => null);
    }
    if (!data) {
      data = {
        ...(await defaultWeatherLocation(optionReader)),
        temperature: null,
        apparent_temperature: null,
        humidity: null,
        weather_code: null,
        is_day: true,
        wind_speed: null,
        timezone: '',
        time: '',
        fallback: true,
        stale: true,
      };
    }
    data.fallback = data.fallback || fallback;
    return ok(c, data);
  });
  app.get('/api/v1/rss/parse', async (c) => {
    const feedUrl = String(new URL(c.req.url).searchParams.get('url') || '').trim();
    if (!feedUrl) return badRequest(c, 'url 参数不能为空');
    try {
      return ok(c, { url: feedUrl, items: await fetchRssFeed(feedUrl) });
    } catch (err) {
      return c.json({ success: false, error: { code: 'RSS_PARSE_FAILED', message: err instanceof Error ? err.message : 'RSS 解析失败' } }, 502);
    }
  });
  app.get('/api/v1/social/feed-timeline', optionalAuth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const { page, perPage, offset } = pageParams(sp);
    const userId = feedUserId(c);
    const total = await one<{ count: string }>(
      `select count(*)::text as count from ${table('feed_items')} fi
       join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id where rs.user_id = $1`,
      [userId],
    ).catch(() => null);
    const rows = await many<Record<string, unknown>>(
      `select fi.*, rs.site_name, rs.site_url from ${table('feed_items')} fi
       join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id
       where rs.user_id = $1 order by fi.pub_date desc nulls last, fi.id desc limit $2 offset $3`,
      [userId, perPage, offset],
    ).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.get('/api/v1/social/feed-stats', optionalAuth, async (c) => {
    const userId = feedUserId(c);
    const sevenDaysAgo = nowUnix() - 7 * 24 * 3600;
    const [count7d, countTotal, rssCount, lastFetched] = await Promise.all([
      one<{ count: string }>(
        `select count(*)::text as count from ${table('feed_items')} fi
         join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id where rs.user_id = $1 and fi.created_at >= $2`,
        [userId, sevenDaysAgo],
      ).catch(() => null),
      one<{ count: string }>(
        `select count(*)::text as count from ${table('feed_items')} fi
         join ${table('rss_subscriptions')} rs on fi.subscription_id = rs.id where rs.user_id = $1`,
        [userId],
      ).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('rss_subscriptions')} where user_id = $1`, [userId]).catch(() => null),
      one<{ last_fetched_at: string }>(
        `select coalesce(max(last_fetched_at), 0)::text as last_fetched_at from ${table('rss_subscriptions')} where user_id = $1`,
        [userId],
      ).catch(() => null),
    ]);
    return ok(c, {
      count_7d: Number(count7d?.count || 0),
      count_total: Number(countTotal?.count || 0),
      rss_count: Number(rssCount?.count || 0),
      last_fetched_at: Number(lastFetched?.last_fetched_at || 0),
    });
  });
  app.post('/api/v1/social/fetch-feeds', auth, async (c) => ok(c, await runFeedFetch(100)));



  app.get('/api/v1/admin/system/version', auth, async (c) => ok(c, await versionPayload()));
  app.get('/api/v1/admin/system/releases', auth, async (c) => {
    try {
      return ok(c, { releases: await fetchReleaseList(), error: '' });
    } catch (err) {
      return ok(c, { releases: [], error: err instanceof Error ? err.message : '更新历史读取失败' });
    }
  });
  app.post('/api/v1/admin/system/upgrade', auth, async (c) => {
    const current = await upgradeStatusPayload();
    if (current.running) {
      return c.json({ success: false, error: { code: 'UPGRADE_IN_PROGRESS', message: '升级正在进行，请稍候' } }, 409);
    }
    const probe = await runtimeUpgradeProbe();
    if (!probe.supported) {
      const message = `当前 Bun 容器未启用运行时升级：${probe.reason}。请在部署目录执行 docker compose pull app && docker compose up -d app。`;
      await markUpgradeStatus({ running: false, finished: true, success: false, message, started_at: new Date().toISOString() });
      return ok(c, { started: false, message });
    }
    await mkdir(config.uploadDir, { recursive: true }).catch(() => {});
    await Bun.write(upgradeLogPath, `${logTime()} 升级请求 已收到\n`);
    await markUpgradeStatus({
      running: true,
      finished: false,
      success: false,
      message: '',
      started_at: new Date().toISOString(),
    });
    runSystemUpgrade();
    return ok(c, {
      started: true,
      log_path: '/uploads/upgrade.log',
      hint: 'app 容器将在 sidecar 中被重新拉取并重建；期间请勿关闭升级日志窗口',
    });
  });
  app.get('/api/v1/admin/system/upgrade/status', auth, async (c) => ok(c, await upgradeStatusPayload()));
  app.post('/api/v1/admin/system/rebuild-stats', auth, async (c) => ok(c, await rebuildStats()));
  app.post('/api/v1/admin/system/clear-cache', auth, async (c) => {
    const cleared = await clearEphemeralCache();
    return ok(c, {
      cleared,
      note: '已清理 Bun 缓存',
    });
  });
  app.post('/api/v1/admin/system/clear-rss-cache', auth, async (c) => {
    const cleared = await execChanged(`delete from ${table('feed_items')}`);
    await exec(`update ${table('rss_subscriptions')} set last_fetched_at = 0`).catch(() => {});
    return ok(c, { cleared_items: cleared, note: '下次手动刷新订阅时会重新拉取' });
  });
  app.post('/api/v1/admin/system/cleanup-database', auth, async (c) => ok(c, await cleanupDatabase()));
  app.get('/api/v1/system/update-check', auth, async (c) => {
    const payload = await versionPayload();
    return ok(c, { has_update: payload.update_available, latest: payload.latest, current: payload.current });
  });
  app.get('/api/v1/admin/analytics/stats', auth, async (c) => {
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
    return ok(c, {
      total_rows: totalRows,
      bot_rows: botRows,
      real_rows: Math.max(0, totalRows - botRows),
      unique_visitors: Number(uniqueVisitors?.count || 0),
      oldest_ts: Number(oldest?.oldest || 0),
    });
  });
  app.post('/api/v1/admin/analytics/purge', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const result = { bots_deleted: 0, duplicates_deleted: 0, aged_deleted: 0 };
    if (sp.get('bots') !== '0') {
      result.bots_deleted = await execChanged(`delete from ${table('access_logs')} where ${botSqlPattern}`);
    }
    if (sp.get('duplicates') !== '0') {
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
         where coalesce(a.visitor_id,'') = ''
           and coalesce(a.fingerprint,'') = ''
           and a.user_agent is not null
           and length(a.user_agent) >= 15
           and not (${botSqlPattern})
           and exists (
             select 1 from ${table('access_logs')} b
             where b.path = a.path
               and b.ip = a.ip
               and b.visitor_id is not null
               and b.visitor_id != ''
               and b.created_at between a.created_at - 30 and a.created_at + 30
           )`,
      );
    }
    const days = Number(sp.get('older_than_days') || 0);
    if (Number.isFinite(days) && days > 0) {
      result.aged_deleted = await execChanged(
        `delete from ${table('access_logs')} where created_at < extract(epoch from now() - ($1 * interval '1 day'))::bigint`,
        [days],
      );
    }
    return ok(c, result);
  });

  app.post('/api/v1/media/parse', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const url = String(body.url || '').trim();
    if (!url) return badRequest(c, 'URL 不能为空');
    try {
      return ok(c, await parseMediaUrl(url));
    } catch (err) {
      return c.json({ success: false, error: { code: 'PARSE_ERROR', message: err instanceof Error ? err.message : '无法解析此链接' } }, 400);
    }
  });
  app.post('/api/v1/media/douban-import', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const doubanId = String(body.douban_id || '').trim();
    if (!doubanId) return badRequest(c, '豆瓣 ID 不能为空');
    const type = ['movie', 'book', 'music'].includes(String(body.type || '')) ? String(body.type) : 'movie';
    const url = `https://${type}.douban.com/people/${encodeURIComponent(doubanId)}/collect`;
    let profile = null;
    try {
      profile = await parseMediaUrl(url);
    } catch {
      profile = null;
    }
    return ok(c, {
      message: '豆瓣导入功能需要豆瓣 API 或 RSS 支持，建议使用 NeoDB 导入',
      douban_url: url,
      profile,
      tip: '推荐使用 NeoDB (neodb.social) 绑定豆瓣账号后，通过 NeoDB API 批量导入',
    });
  });

  app.get('/api/v1/federation/metadata', async (c) => ok(c, await siteMetadata()));
  app.post('/api/v1/federation/follow', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const followerSite = normalizedSiteUrl(body.follower_site || body.site_url || body.follower_url);
    if (!followerSite) return badRequest(c, 'follower_site 不能为空');
    const now = nowUnix();
    await exec(
      `insert into ${table('followers')} (user_id, following_id, source_site, status, mutual, created_at, updated_at)
       values (0,1,$1,'active',false,$2,$2) on conflict do nothing`,
      [followerSite, now],
    ).catch(() => {});
    await exec(
      `insert into ${table('notifications')} (user_id, type, title, content, created_at)
       values (1,'follow',$1,$2,$3)`,
      [String(body.follower_name || followerSite) + ' 关注了你', `来自 ${followerSite}`, now],
    ).catch(() => {});
    const already = await one<{ count: string }>(`select count(*)::text as count from ${table('followers')} where user_id = 1 and source_site = $1`, [followerSite]).catch(() => null);
    const mutual = Number(already?.count || 0) > 0;
    if (mutual) {
      await exec(`update ${table('followers')} set mutual = true where source_site = $1`, [followerSite]).catch(() => {});
      await exec(
        `insert into ${table('links')} (name, url, description, status, order_num, created_at, updated_at)
         values ($1,$2,'互关好友',1,0,$3,$3) on conflict do nothing`,
        [String(body.follower_name || followerSite), followerSite, now],
      ).catch(() => {});
    }
    void sendFollowTelegram({ name: String(body.follower_name || ''), site: followerSite });
    return ok(c, { accepted: true, mutual });
  });
  app.post('/api/v1/federation/verify', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    if (!token) return badRequest(c, 'token 不能为空');
    try {
      const payload = await verifyFederationTokenLocal(token);
      return ok(c, {
        valid: true,
        user: {
          id: payload.sub,
          username: payload.username || '',
          nickname: payload.nickname || '',
          email: payload.email || '',
          avatar: payload.avatar || '',
          site: payload.site || config.appUrl,
        },
      });
    } catch {
      return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token 无效或已过期' } }, 401);
    }
  });
  app.post('/api/v1/comments/federated', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const postId = intParam(String(body.post_id || ''));
    const content = String(body.content || '').trim();
    if (!postId || !content) return badRequest(c, 'post_id 和 content 不能为空');
    let author = '匿名';
    let email = '';
    let url = '';
    let verified = false;
    const token = String(body.federation_token || body.token || '').trim();
    if (token) {
      try {
        const payload = decodeJwt(token) as Record<string, any>;
        if (payload.iss && payload.iss !== config.appUrl) {
          const issuer = await assertPublicHttpUrl(String(payload.iss));
          const resp = await fetch(`${issuer}/api/v1/federation/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
            signal: AbortSignal.timeout(5000),
          }).catch(() => null);
          const remote = resp?.ok ? await resp.json().catch(() => null) as any : null;
          verified = !!remote?.success && !!remote?.data?.valid;
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
    return ok(c, { id: row?.id || 0, author, verified });
  });
  app.post('/api/v1/federation/webhook', async (c) => {
    const secret = (await optionValue('federation_webhook_secret', '')).trim();
    if (secret && c.req.header('X-Utterlog-Webhook-Secret') !== secret) {
      return forbidden(c, 'Invalid federation webhook secret');
    }
    const body = await c.req.json().catch(() => ({}));
    await exec(
      `insert into ${table('notifications')} (user_id, type, title, content, created_at)
       values (1,'federation',$1,$2,$3)`,
      [String(body.title || body.type || '联邦通知'), JSON.stringify(body).slice(0, 1000), nowUnix()],
    ).catch(() => {});
    return ok(c, { received: true });
  });
  app.post('/api/v1/federation/token', auth, async (c) => {
    const user = await one<{ id: number; username: string; email: string; nickname: string | null; avatar: string | null }>(
      `select id, username, email, nickname, avatar from ${table('users')} where id = $1`,
      [currentUserId(c)],
    );
    if (!user) return notFound(c, '用户不存在');
    const token = await signFederationToken(user);
    return ok(c, { token, user: { id: user.id, username: user.username, nickname: user.nickname || user.username, email: user.email, avatar: user.avatar || '', site: config.appUrl } });
  });
  app.post('/api/v1/passport/identify', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    if (!token) return badRequest(c, '缺少 token');
    const verify = await fetch('https://id.utterlog.com/api/v1/passport/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (!verify?.ok) return c.json({ success: false, error: { code: 'INVALID_PASSPORT', message: '身份验证失败' } }, 401);
    const payload: any = await verify.json().catch(() => ({}));
    const data: any = payload?.data || {};
    if (!payload.success || !data.valid) return c.json({ success: false, error: { code: 'INVALID_PASSPORT', message: '身份验证失败' } }, 401);
    return ok(c, {
      identified: true,
      utterlog_id: data.utterlog_id || '',
      nickname: data.nickname || '',
      avatar: data.avatar || '',
      email: data.email || '',
      email_hash: data.email_hash || '',
      site_url: data.site_url || '',
      follow_status: '',
      is_friend_link: false,
    });
  });

  app.get('/api/v1/network/status', auth, async (c) => {
    const registered = await ensureNetworkRegistered().catch(async () => ({ site_id: await optionValue('utterlog_site_id', ''), connected: false }));
    return ok(c, {
      hub: utterlogHub,
      site_id: registered.site_id,
      fingerprint: `${siteFingerprint().slice(0, 12)}...`,
      connected: registered.connected,
    });
  });
  app.post('/api/v1/network/push-info', auth, async (c) => {
    try {
      return ok(c, await pushNetworkSiteInfo());
    } catch (err) {
      return c.json({ success: false, error: { code: 'HUB_UNREACHABLE', message: err instanceof Error ? err.message : '无法连接 Utterlog 中心' } }, 502);
    }
  });
  app.get('/api/v1/network/feed', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const page = encodeURIComponent(sp.get('page') || '1');
    const perPage = encodeURIComponent(sp.get('per_page') || '20');
    try {
      const { res, payload } = await hubRequest('GET', `/api/v1/activity?page=${page}&per_page=${perPage}`);
      if (res.ok && payload?.success) return ok(c, payload.data || { items: [], total: 0 });
      return ok(c, { items: [], total: 0, hub_status: 'error' });
    } catch {
      return ok(c, { items: [], total: 0, hub_status: 'offline' });
    }
  });
  app.get('/api/v1/network/sites', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const page = encodeURIComponent(sp.get('page') || '1');
    try {
      const { res, payload } = await hubRequest('GET', `/api/v1/sites?page=${page}`);
      if (res.ok && payload?.success) return ok(c, payload.data || { sites: [], total: 0 });
      return ok(c, { sites: [], total: 0 });
    } catch {
      return ok(c, { sites: [], total: 0 });
    }
  });
  app.post('/api/v1/network/subscribe', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const siteUrl = normalizedSiteUrl(body.site_url);
    if (!siteUrl) return badRequest(c, 'site_url 不能为空');
    const meta = await fetchRemoteMetadata(siteUrl).catch(() => ({ name: siteUrl, logo: '' }));
    const feedUrl = String(body.feed_url || `${siteUrl}/api/v1/feed`);
    await exec(
      `insert into ${table('rss_subscriptions')} (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
       values ($1,$2,$3,$4,$5,0,$6)
       on conflict (user_id, feed_url) do update set site_url=$2, site_name=$4, site_avatar=$5`,
      [currentUserId(c), siteUrl, feedUrl, meta.name || siteUrl, meta.logo || meta.favicon || '', nowUnix()],
    );
    return ok(c, { subscribed: true, site_name: meta.name || siteUrl, site_logo: meta.logo || '' });
  });
  app.post('/api/v1/network/unsubscribe', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    await exec(`delete from ${table('rss_subscriptions')} where user_id = $1 and site_url = $2`, [currentUserId(c), normalizedSiteUrl(body.site_url)]);
    return ok(c, { unsubscribed: true });
  });
  app.get('/api/v1/network/subscriptions', auth, async (c) => {
    const rows = await many<Record<string, unknown>>(`select * from ${table('rss_subscriptions')} where user_id = $1 order by created_at desc`, [currentUserId(c)]).catch(() => []);
    return ok(c, rows);
  });
  app.get('/api/v1/network/pull-content', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const siteUrl = normalizedSiteUrl(sp.get('site_url'));
    if (!siteUrl) return badRequest(c, 'site_url 参数不能为空');
    const safeSiteUrl = await assertPublicHttpUrl(siteUrl);
    const url = `${safeSiteUrl}/api/v1/network/content?type=${encodeURIComponent(sp.get('type') || 'post')}${sp.get('since') ? `&since=${encodeURIComponent(sp.get('since') || '')}` : ''}`;
    const payload = await fetchJson<any>(url, 15000).catch((err) => ({ success: false, error: err instanceof Error ? err.message : '拉取内容失败' }));
    if (payload.success === false) return c.json({ success: false, error: { code: 'PULL_FAILED', message: payload.error || '拉取内容失败' } }, 502);
    return ok(c, payload.data || payload);
  });
  app.post('/api/v1/network/publish-notify', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const rows = await many<{ source_site: string }>(`select distinct source_site from ${table('followers')} where coalesce(source_site,'') != ''`).catch(() => []);
    let notified = 0;
    for (const row of rows) {
      assertPublicHttpUrl(row.source_site).then((siteUrl) => fetch(`${siteUrl}/api/v1/federation/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'new_content', site: config.appUrl, title: body.title || '', post_id: body.post_id || 0, content_type: body.content_type || 'post' }),
      })).catch(() => {});
      notified++;
    }
    const siteId = await optionValue('utterlog_site_id', '');
    if (siteId) {
      const siteTitle = await optionValue('site_title', 'Utterlog!');
      hubRequest('POST', '/api/v1/activity', {
        site_id: siteId,
        type: 'new_content',
        title: body.title || '',
        content_type: body.content_type || 'post',
        url: config.appUrl,
        name: siteTitle || 'Utterlog!',
      }).catch(() => {});
    }
    return ok(c, { notified });
  });
  app.post('/api/v1/network/bind-utterlog-id', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const utterlogId = String(body.utterlog_id || '').trim();
    const token = String(body.token || '').trim();
    if (!utterlogId || !token) return badRequest(c, 'utterlog_id 和 token 不能为空');
    try {
      const data = await verifyUtterlogIdToken(utterlogId, token);
      await exec(
        `update ${table('users')} set utterlog_id = $1, utterlog_avatar = $2, updated_at = $3 where id = $4`,
        [utterlogId, String(data.avatar || ''), nowUnix(), currentUserId(c)],
      );
      return ok(c, { bound: true, utterlog_id: utterlogId, utterlog_avatar: String(data.avatar || '') });
    } catch (err) {
      return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: err instanceof Error ? err.message : 'Utterlog ID 验证失败' } }, 401);
    }
  });
  app.post('/api/v1/network/unbind-utterlog-id', auth, async (c) => {
    await exec(`update ${table('users')} set utterlog_id = '', utterlog_avatar = '', updated_at = $1 where id = $2`, [nowUnix(), currentUserId(c)]).catch(() => {});
    return ok(c, { unbound: true });
  });
  app.get('/api/v1/network/utterlog-profile', auth, async (c) => {
    const user = await one<Record<string, unknown>>(
      `select username, email, nickname, avatar, coalesce(utterlog_id,'') as utterlog_id, coalesce(utterlog_avatar,'') as utterlog_avatar
       from ${table('users')} where id = $1`,
      [currentUserId(c)],
    ).catch(() => null);
    return ok(c, {
      utterlog_id: String(user?.utterlog_id || ''),
      utterlog_avatar: String(user?.utterlog_avatar || ''),
      username: String(user?.username || ''),
      nickname: String(user?.nickname || user?.username || ''),
      email: String(user?.email || ''),
      avatar: String(user?.avatar || ''),
      avatar_url: String(user?.utterlog_avatar || user?.avatar || ''),
      bound: Boolean(user?.utterlog_id),
    });
  });
  app.get('/api/v1/network/oauth/authorize', auth, async (c) => {
    const registered = await ensureNetworkRegistered();
    if (!registered.connected || !registered.site_id) {
      return c.json({ success: false, error: { code: 'NOT_CONNECTED', message: '无法连接 Utterlog 网络' } }, 502);
    }
    const redirectUri = `${(await publicFrontendUrl()).replace(/\/+$/, '')}/api/v1/network/oauth/callback`;
    const state = `${Date.now()}-${currentUserId(c)}`;
    const authUrl = `${utterlogHub}/oauth/authorize?client_id=${encodeURIComponent(registered.site_id)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&response_type=code&scope=profile`;
    return ok(c, { auth_url: authUrl, url: authUrl, state });
  });
  app.get('/api/v1/network/content', (c) => listNetworkContent(c));
  app.get('/api/v1/network/oauth/callback', async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const code = String(sp.get('code') || '');
    const state = String(sp.get('state') || '');
    const siteId = await optionValue('utterlog_site_id', '');
    const frontend = await publicFrontendUrl();
    const finish = (okBind: boolean) => new Response(`<!doctype html><html><body><script>
      if (window.opener) { window.opener.location.reload(); }
      window.close();
      setTimeout(function(){ window.location.href = '${frontend}/admin/utterlog${okBind ? '' : '?error=oauth_failed'}'; }, 500);
    </script><p>${okBind ? '绑定成功' : '绑定失败'}，正在关闭...</p></body></html>`, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    if (!code || !state || !siteId) return finish(false);
    const { res, payload } = await hubRequest('POST', '/oauth/token', {
      grant_type: 'authorization_code',
      code,
      client_id: siteId,
      fingerprint: siteFingerprint(),
      redirect_uri: `${frontend}/api/v1/network/oauth/callback`,
    }).catch(() => ({ res: null as any, payload: null as any }));
    if (!res?.ok) return finish(false);
    const data = payload?.data || payload || {};
    const userId = intParam(state.split('-').at(-1) || '', 0);
    if (userId > 0) {
      await exec(
        `update ${table('users')} set utterlog_id = $1, utterlog_avatar = $2, updated_at = $3 where id = $4`,
        [String(data.utterlog_id || ''), String(data.avatar || ''), nowUnix(), userId],
      ).catch(() => {});
    }
    return finish(true);
  });
  app.post('/api/v1/social/follow', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const siteUrl = normalizedSiteUrl(body.site_url || body.source_site);
    if (!siteUrl) return badRequest(c, 'site_url 不能为空');
    let meta: Record<string, unknown>;
    try {
      meta = await fetchRemoteMetadata(siteUrl);
    } catch {
      return c.json({ success: false, error: { code: 'DISCOVERY_FAILED', message: '无法连接目标站点' } }, 400);
    }
    const userId = currentUserId(c);
    const user = await one<{ username: string; nickname: string | null; avatar: string | null }>(
      `select username, nickname, avatar from ${table('users')} where id = $1`,
      [userId],
    ).catch(() => null);
    const ownMeta = await siteMetadata();
    await assertPublicHttpUrl(siteUrl).then((safeSiteUrl) => fetch(`${safeSiteUrl}/api/v1/federation/follow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        follower_site: config.appUrl,
        follower_name: user?.nickname || user?.username || ownMeta.name || config.appUrl,
        follower_avatar: user?.avatar || ownMeta.logo || '',
        follower_url: config.appUrl,
      }),
      signal: AbortSignal.timeout(10000),
    })).catch(() => {});

    const now = nowUnix();
    await exec(
      `insert into ${table('followers')} (user_id, follower_id, source_site, status, mutual, created_at, updated_at)
       values ($1,0,$2,'active',false,$3,$3)
       on conflict (user_id, source_site) where source_site != '' and following_id = 0 do update set status='active', updated_at=$3`,
      [userId, siteUrl, now],
    ).catch(async () => {
      await exec(`insert into ${table('followers')} (user_id, follower_id, source_site, status, mutual, created_at, updated_at) values ($1,0,$2,'active',false,$3,$3)`, [userId, siteUrl, now]).catch(() => {});
    });
    const siteName = normalizeDisplayName(meta.name || meta.title) || siteUrl;
    const siteLogo = String(meta.logo || meta.favicon || '');
    const feedUrl = `${siteUrl}/api/v1/feed`;
    await exec(
      `insert into ${table('rss_subscriptions')} (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
       values ($1,$2,$3,$4,$5,0,$6)
       on conflict (user_id, feed_url) do update set site_url=$2, site_name=$4, site_avatar=$5`,
      [userId, siteUrl, feedUrl, siteName, siteLogo, now],
    ).catch(() => {});

    const incoming = await one<{ count: string }>(
      `select count(*)::text as count from ${table('followers')} where following_id = $1 and source_site = $2`,
      [userId, siteUrl],
    ).catch(() => null);
    const mutual = Number(incoming?.count || 0) > 0;
    if (mutual) {
      await exec(`update ${table('followers')} set mutual = true, updated_at = $2 where source_site = $1 and (user_id = $3 or following_id = $3)`, [siteUrl, now, userId]).catch(() => {});
      await exec(
        `insert into ${table('links')} (name, url, description, logo, status, order_num, created_at, updated_at)
         values ($1,$2,'互关好友',$3,1,0,$4,$4) on conflict do nothing`,
        [siteName, siteUrl, siteLogo, now],
      ).catch(() => {});
    }
    return ok(c, { followed: true, mutual, rss_subscribed: true });
  });
  app.post('/api/v1/social/unfollow', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const siteUrl = normalizedSiteUrl(body.site_url || body.source_site);
    await exec(`delete from ${table('followers')} where user_id = $1 and source_site = $2`, [currentUserId(c), siteUrl]).catch(() => {});
    await exec(`delete from ${table('rss_subscriptions')} where user_id = $1 and site_url = $2`, [currentUserId(c), siteUrl]).catch(() => {});
    return ok(c, { unfollowed: true });
  });
  app.get('/api/v1/social/follow-status', optionalAuth, async (c) => {
    const siteUrl = normalizedSiteUrl(new URL(c.req.url).searchParams.get('site_url'));
    if (!siteUrl) return badRequest(c, 'site_url 参数不能为空');
    const userId = currentUserId(c) || 1;
    const row = await one<{ count: string; mutual: boolean }>(
      `select count(*)::text as count, coalesce(bool_or(mutual), false) as mutual
       from ${table('followers')} where user_id = $1 and source_site = $2`,
      [userId, siteUrl],
    ).catch(() => null);
    return ok(c, { following: Number(row?.count || 0) > 0, mutual: row?.mutual === true });
  });
  app.get('/api/v1/social/following', auth, async (c) => {
    const rows = await many<Record<string, unknown>>(
      `select f.*, rs.site_name, rs.site_url from ${table('followers')} f
       left join ${table('rss_subscriptions')} rs on f.source_site = rs.site_url and rs.user_id = $1
       where f.user_id = $1 and coalesce(f.source_site,'') != '' order by f.created_at desc`,
      [currentUserId(c)],
    ).catch(() => []);
    return ok(c, rows);
  });
  app.get('/api/v1/social/management', auth, async (c) => {
    const following = await many<Record<string, unknown>>(
      `select f.*, rs.site_name, rs.site_url from ${table('followers')} f
       left join ${table('rss_subscriptions')} rs on f.source_site = rs.site_url and rs.user_id = $1
       where f.user_id = $1 and coalesce(f.source_site,'') != '' order by f.created_at desc`,
      [currentUserId(c)],
    ).catch(() => []);
    const followers = await many<Record<string, unknown>>(
      `select * from ${table('followers')} where following_id = $1 and coalesce(source_site,'') != '' order by created_at desc`,
      [currentUserId(c)],
    ).catch(() => []);
    const mutual = following.filter((row) => row.mutual === true);
    return ok(c, { following, followers, mutual, counts: { following: following.length, followers: followers.length, mutual: mutual.length } });
  });

  app.post('/api/v1/import/wordpress', auth, async (c) => {
    const type = c.req.header('content-type') || '';
    if (type.includes('multipart/form-data')) {
      const form = await c.req.formData().catch(() => null);
      const file = form?.get('file');
      if (!(file instanceof File)) return badRequest(c, '请上传 WordPress WXR XML 文件');
      const xml = await file.text();
      const result = await importWordPressWxr(xml, currentUserId(c));
      return ok(c, { imported: result.posts + result.pages, ...result });
    }
    const body = await c.req.json().catch(() => ({}));
    if (!Array.isArray(body.posts)) return badRequest(c, '请上传 WordPress WXR XML 文件，或提交 posts 数组');
    let imported = 0;
    for (const post of body.posts) {
      const row = await one<{ id: number }>(
        `insert into ${table('posts')} (title, slug, content, excerpt, author_id, status, type, created_at, updated_at, source_type, source_id)
         values ($1,$2,$3,$4,$5,$6,'post',$7,$7,'wordpress',$8)
         on conflict (slug) where deleted_at = 0 do update set title = excluded.title, content = excluded.content, excerpt = excluded.excerpt, updated_at = excluded.updated_at
         returning id`,
        [post.title || '', post.slug || simpleSlug(post.title || ''), post.content || '', post.excerpt || '', currentUserId(c) || 1, post.status || 'draft', nowUnix(), String(post.id || post.source_id || '')],
      ).catch(() => null);
      if (row?.id) imported++;
    }
    return ok(c, { imported, posts: imported, pages: 0, comments: 0 });
  });
  app.post('/api/v1/import/typecho', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!Array.isArray(body.posts)) {
      return ok(c, {
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
      });
    }
    let imported = 0;
    for (const post of body.posts) {
      const row = await one<{ id: number }>(
        `insert into ${table('posts')} (title, slug, content, excerpt, author_id, status, type, created_at, updated_at, source_type, source_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8,'typecho',$9)
         on conflict (slug) where deleted_at = 0 do update set title = excluded.title, content = excluded.content, excerpt = excluded.excerpt, updated_at = excluded.updated_at
         returning id`,
        [
          post.title || '',
          post.slug || simpleSlug(post.title || ''),
          post.content || post.text || '',
          post.excerpt || '',
          currentUserId(c) || 1,
          post.status || 'draft',
          post.type === 'page' ? 'page' : 'post',
          Number(post.created_at || post.created || nowUnix()),
          String(post.id || post.cid || post.source_id || ''),
        ],
      ).catch(() => null);
      if (row?.id) imported++;
    }
    return ok(c, { imported, posts: imported, pages: 0, comments: 0 });
  });
  for (const platform of ['wordpress', 'typecho']) {
    app.post(`/api/v1/sync/${platform}/ping`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      try {
        const site = await authSyncEnvelope(body, platform);
        return ok(c, { ok: true, platform, app: 'utterlog-bun', site_uuid: site.site_uuid, label: site.label, source_url: site.source_url, server_time: nowUnix() });
      } catch (err) {
        return c.json({ success: false, error: { code: 'BAD_AUTH', message: err instanceof Error ? err.message : '认证失败' } }, 401);
      }
    });
    app.post(`/api/v1/sync/${platform}/start`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      let site: Awaited<ReturnType<typeof authSyncEnvelope>>;
      try {
        site = await authSyncEnvelope(body, platform);
      } catch (err) {
        return c.json({ success: false, error: { code: 'BAD_AUTH', message: err instanceof Error ? err.message : '认证失败' } }, 401);
      }
      const manifest = body.manifest || {};
      if (manifest.source_url) await exec(`update ${table('sync_sites')} set source_url = $1, updated_at = $2 where site_uuid = $3`, [String(manifest.source_url), nowUnix(), site.site_uuid]).catch(() => {});
      const jobId = `job_${randomBytes(12).toString('hex')}`;
      await exec(
        `insert into ${table('sync_jobs')} (job_id, site_uuid, status, stage, manifest, started_at)
         values ($1,$2,'running','import',$3::jsonb,$4)`,
        [jobId, site.site_uuid, JSON.stringify(manifest || {}), nowUnix()],
      );
      return ok(c, { job_id: jobId, started_at: nowUnix() });
    });
    app.post(`/api/v1/sync/${platform}/batch`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      let site: Awaited<ReturnType<typeof authSyncEnvelope>>;
      try {
        site = await authSyncEnvelope(body, platform);
      } catch (err) {
        return c.json({ success: false, error: { code: 'BAD_AUTH', message: err instanceof Error ? err.message : '认证失败' } }, 401);
      }
      const jobId = String(body.job_id || '');
      const resource = String(body.resource || '');
      const batchNo = Number(body.batch_no || 0);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!jobId || !resource || batchNo <= 0) return badRequest(c, '缺少 job_id / resource / batch_no');
      const job = await one<{ site_uuid: string }>(`select site_uuid from ${table('sync_jobs')} where job_id = $1`, [jobId]).catch(() => null);
      if (!job) return notFound(c, 'job 不存在');
      if (job.site_uuid !== site.site_uuid) return forbidden(c, 'job 不属于当前同步站点');
      const seen = await one<{ count: string }>(`select count(*)::text as count from ${table('sync_batches')} where job_id = $1 and resource = $2 and batch_no = $3`, [jobId, resource, batchNo]);
      if (Number(seen?.count || 0) > 0) return ok(c, { duplicate: true, items_received: items.length });
      try {
        const imported = await importSyncBatch(jobId, site.site_uuid, resource, items, 1, site.platform);
        await exec(
          `insert into ${table('sync_batches')} (job_id, resource, batch_no, received_at, item_count)
           values ($1,$2,$3,$4,$5) on conflict (job_id, resource, batch_no) do nothing`,
          [jobId, resource, batchNo, nowUnix(), imported],
        );
        return ok(c, { imported, resource, batch_no: batchNo });
      } catch (err) {
        await exec(`update ${table('sync_jobs')} set status = 'error', error_message = $1 where job_id = $2`, [err instanceof Error ? err.message : '导入失败', jobId]).catch(() => {});
        return c.json({ success: false, error: { code: 'IMPORT_ERR', message: err instanceof Error ? err.message : '导入失败' } }, 500);
      }
    });
    app.post(`/api/v1/sync/${platform}/finish`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      let site: Awaited<ReturnType<typeof authSyncEnvelope>>;
      try {
        site = await authSyncEnvelope(body, platform);
      } catch (err) {
        return c.json({ success: false, error: { code: 'BAD_AUTH', message: err instanceof Error ? err.message : '认证失败' } }, 401);
      }
      const jobId = String(body.job_id || '');
      if (!jobId) return badRequest(c, '缺少 job_id');
      const job = await one<{ site_uuid: string }>(`select site_uuid from ${table('sync_jobs')} where job_id = $1`, [jobId]).catch(() => null);
      if (!job) return notFound(c, 'job 不存在');
      if (job.site_uuid !== site.site_uuid) return forbidden(c, 'job 不属于当前同步站点');
      const counts = body.summary && typeof body.summary === 'object' && !Array.isArray(body.summary) ? body.summary : {};
      await exec(`update ${table('sync_jobs')} set status='processing', stage='media_scan', counts=$1::jsonb where job_id=$2`, [JSON.stringify(counts), jobId]);
      void runSyncFinishWorker(jobId, site.site_uuid, counts).catch(() => {});
      return ok(c, {
        job_id: jobId,
        status: 'processing',
        stage: 'media_scan',
        next_stage: 'media download + content rewrite',
        hint: `轮询 /api/v1/sync/${platform}/job/${jobId}/status`,
      });
    });
    app.post(`/api/v1/sync/${platform}/rollback`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      let site: Awaited<ReturnType<typeof authSyncEnvelope>>;
      try {
        site = await authSyncEnvelope(body, platform);
      } catch (err) {
        return c.json({ success: false, error: { code: 'BAD_AUTH', message: err instanceof Error ? err.message : '认证失败' } }, 401);
      }
      if (String(body.confirm || '') !== site.site_uuid) return badRequest(c, `confirm 字段必须等于 site_uuid (${site.site_uuid})`, 'CONFIRM_MISMATCH');
      const rowsRemoved: Record<string, number> = {};
      for (const name of ['comments', 'posts', 'metas', 'media', 'links']) {
        rowsRemoved[name] = await execChanged(`delete from ${table(name)} where source_site_uuid = $1`, [site.site_uuid]).catch(() => 0);
      }
      await exec(`delete from ${table('sync_id_map')} where site_uuid = $1`, [site.site_uuid]).catch(() => {});
      await exec(`delete from ${table('sync_media_queue')} where job_id in (select job_id from ${table('sync_jobs')} where site_uuid = $1)`, [site.site_uuid]).catch(() => {});
      await exec(`delete from ${table('sync_batches')} where job_id in (select job_id from ${table('sync_jobs')} where site_uuid = $1)`, [site.site_uuid]).catch(() => {});
      await exec(`delete from ${table('sync_jobs')} where site_uuid = $1`, [site.site_uuid]).catch(() => {});
      return ok(c, { rolled_back: true, site_uuid: site.site_uuid, rows_removed: rowsRemoved });
    });
    app.get(`/api/v1/sync/${platform}/job/:id/status`, async (c) => {
      const row = await one<Record<string, unknown>>(`select * from ${table('sync_jobs')} where job_id = $1`, [c.req.param('id')]).catch(() => null);
      if (!row) return notFound(c, 'job 不存在');
      return ok(c, row);
    });
    app.post(`/api/v1/admin/sync/${platform}/sites`, auth, async (c) => {
      const body = await c.req.json().catch(() => ({}));
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
      return ok(c, { site_uuid: siteUuid, token, label: body.label || '', platform, note: '请立即保存 token，之后无法再次查看' });
    });
    app.get(`/api/v1/admin/sync/${platform}/sites`, auth, async (c) => {
      const rows = await many<Record<string, unknown>>(
        `select s.id, s.site_uuid, s.label, s.source_url, s.disabled, s.platform, s.last_seen_at, s.created_at, s.updated_at,
                coalesce((select count(*) from ${table('sync_jobs')} j where j.site_uuid = s.site_uuid), 0)::int as recent_jobs
         from ${table('sync_sites')} s where s.platform = $1 order by s.created_at desc`,
        [platform],
      ).catch(() => []);
      return ok(c, { sites: rows });
    });
    app.delete(`/api/v1/admin/sync/${platform}/sites/:uuid`, auth, async (c) => {
      await exec(`delete from ${table('sync_sites')} where site_uuid = $1 and platform = $2`, [c.req.param('uuid'), platform]);
      return ok(c, { deleted: c.req.param('uuid') });
    });
    app.get(`/api/v1/admin/sync/${platform}/jobs`, auth, async (c) => {
      const limit = Math.max(1, Math.min(200, intParam(new URL(c.req.url).searchParams.get('limit') || undefined, 20)));
      const rows = await many<Record<string, unknown>>(
        `select j.job_id, j.site_uuid, j.status, j.stage, j.media_total, j.media_done, j.posts_rewritten, j.started_at, j.finished_at
         from ${table('sync_jobs')} j inner join ${table('sync_sites')} s on s.site_uuid = j.site_uuid
         where s.platform = $1 order by j.started_at desc limit $2`,
        [platform, limit],
      ).catch(() => []);
      return ok(c, { jobs: rows });
    });
  }

  app.get('/api/v1/unsubscribe/comment-reply', async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const title = await optionValue('site_title', 'Utterlog');
    const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '') || '/';
    const email = await verifyCommentReplyUnsubscribe(sp.get('e') || '', sp.get('t') || '');
    if (!email) {
      return c.html(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>链接无效 - ${htmlEscape(title)}</title><style>body{margin:0;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f6f9;color:#0d1a2d;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.05);padding:36px 40px;max-width:460px;width:100%;text-align:center}h1{font-size:18px;color:#dc2626;margin:0 0 12px}p{font-size:13px;color:#5a6b7f}.home{display:inline-block;margin-top:18px;font-size:12px;color:#8ea0b4;text-decoration:none;border-bottom:1px solid #cdd5df}</style></head><body><div class="card"><h1>链接无效</h1><p>这条退订链接已损坏或过期。如果你确实想停止接收通知，请到任一邮件底部点击新的退订链接。</p><a class="home" href="${htmlEscape(siteUrl)}">返回首页</a></div></body></html>`, 400);
    }
    await addCommentReplyOptout(email);
    return c.html(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>已退订 - ${htmlEscape(title)}</title><style>body{margin:0;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f6f9;color:#0d1a2d;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.05);padding:36px 40px;max-width:460px;width:100%;text-align:center}h1{font-size:18px;color:#0052d9;margin:0 0 12px}.email{font-family:ui-monospace,SFMono-Regular,monospace;color:#0d1a2d;background:#f5f7fa;padding:2px 6px;border-radius:2px;font-size:12px}p{font-size:13px;color:#5a6b7f}.home{display:inline-block;margin-top:18px;font-size:12px;color:#8ea0b4;text-decoration:none;border-bottom:1px solid #cdd5df}</style></head><body><div class="card"><h1>已退订</h1><p><span class="email">${htmlEscape(email)}</span> 后续不再接收来自《${htmlEscape(title)}》的评论回复通知。</p><p style="font-size:12px;color:#8ea0b4;margin-top:18px">若想恢复接收，回复任意一条评论或在站点重新留言即可。</p><a class="home" href="${htmlEscape(siteUrl)}">返回首页</a></div></body></html>`);
  });
}
