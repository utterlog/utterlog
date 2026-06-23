import type { Context, Hono } from 'hono';
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
import { validateBackupZipEntries, validateExtensionZipEntries } from '../backup/zip-safety';
import { config, table } from '../config';
import { normalizeBlogTheme, SUPPORTED_BLOG_THEMES } from '../blog-themes';
import { exec, intParam, many, nowUnix, one, pageParams } from '../db/helpers';
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

async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
}

async function saveOption(name: string, value: string) {
  const now = nowUnix();
  await exec(
    `insert into ${table('options')} (name, value, created_at, updated_at)
     values ($1, $2, $3, $3)
     on conflict (name) do update set value = $2, updated_at = $3`,
    [name, value, now],
  );
}

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

async function telegramApi(method: string, token: string, payload?: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, payload ? {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  } : undefined);
  const data = await res.json().catch(() => ({})) as Record<string, any>;
  if (!res.ok || data.ok === false) throw new Error(String(data.description || `Telegram ${method} failed`));
  return data;
}

async function telegramFileUrl(token: string, fileId: string) {
  const data = await telegramApi('getFile', token, { file_id: fileId });
  const filePath = String(data.result?.file_path || '');
  if (!filePath) throw new Error('Telegram 未返回文件路径');
  return {
    url: `https://api.telegram.org/file/bot${token}/${filePath}`,
    path: filePath,
  };
}

async function saveTelegramPhotoMoment(token: string, chatId: string, photo: Record<string, unknown>, caption: string, publishMoment: boolean) {
  const fileId = String(photo.file_id || '');
  if (!fileId) throw new Error('Telegram 图片缺少 file_id');
  const file = await telegramFileUrl(token, fileId);
  const res = await fetch(file.url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`下载图片失败: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const ext = (extname(file.path).replace('.', '').toLowerCase() || 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg';
  const mimeType = res.headers.get('content-type') || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const stored = await storeUploadedBytes(bytes, ext, mimeType, 'moments');
  const ts = nowUnix();
  await exec(
    `insert into ${table('media')} (name, filename, url, mime_type, size, driver, category, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'image',$7,$7)`,
    [`telegram_photo.${ext}`, stored.relativePath, stored.url, mimeType, bytes.length, stored.driver, ts],
  ).catch(() => {});
  if (publishMoment) {
    const content = caption.trim() || '来自 Telegram';
    await exec(
      `insert into ${table('moments')} (content, images, source, author_id, visibility, created_at, updated_at)
       values ($1, $2::text[], 'telegram', 1, 'public', $3, $3)`,
      [content, [stored.url], ts],
    );
    await telegramApi('sendMessage', token, { chat_id: chatId, text: `图片已上传并发布说说\n${stored.url}` }).catch(() => {});
    return;
  }
  await telegramApi('sendMessage', token, { chat_id: chatId, text: `图片已上传到媒体库\n${stored.url}` }).catch(() => {});
}

function telegramReplyCommentId(message: any) {
  const text = String(message?.text || message?.caption || '');
  const marker = /#comment:(\d+)/i.exec(text) || /评论(?:ID|编号)?[:：\s#]*(\d+)/i.exec(text);
  if (marker) return intParam(marker[1]);
  const keyboard = message?.reply_markup?.inline_keyboard;
  if (Array.isArray(keyboard)) {
    for (const row of keyboard) {
      if (!Array.isArray(row)) continue;
      for (const button of row) {
        const [, raw] = String(button?.callback_data || '').split(':', 2);
        const id = intParam(raw);
        if (id) return id;
      }
    }
  }
  return 0;
}

async function publishTelegramCommentReply(commentId: number, content: string) {
  const parent = await one<{
    post_id: number;
    author_name: string;
    author_email: string | null;
    content: string;
    role: string | null;
  }>(
    `select c.post_id, c.author_name, c.author_email, c.content, coalesce(u.role, '') as role
     from ${table('comments')} c left join ${table('users')} u on u.id = c.user_id where c.id = $1`,
    [commentId],
  );
  if (!parent) throw new Error('评论不存在');
  const admin = await one<{ id: number; email: string; username: string; nickname: string | null }>(
    `select id, email, username, nickname from ${table('users')} where role = 'admin' order by id asc limit 1`,
  ).catch(() => null);
  const adminId = Number(admin?.id || 1);
  const now = nowUnix();
  const reply = content.trim().slice(0, 5000);
  if (!reply) throw new Error('回复内容不能为空');
  const inserted = await one<{ id: number }>(
    `insert into ${table('comments')}
       (post_id, parent_id, user_id, author_name, author_email, content, status, source, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'approved','telegram',$7,$7)
     returning id`,
    [
      parent.post_id,
      commentId,
      adminId,
      admin?.nickname || admin?.username || 'Admin',
      admin?.email || '',
      reply,
      now,
    ],
  );
  await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [parent.post_id]).catch(() => {});

  const recipient = String(parent.author_email || '').trim().toLowerCase();
  if (recipient && parent.role !== 'admin' && recipient !== String(admin?.email || '').trim().toLowerCase() && !(await isCommentReplyOptedOut(recipient))) {
    const post = await one<{ title: string; slug: string | null }>(`select title, slug from ${table('posts')} where id = $1`, [parent.post_id]).catch(() => null);
    const siteTitle = await optionValue('site_title', 'Utterlog');
    const siteUrl = (await optionValue('site_url', config.appUrl)).replace(/\/+$/, '');
    const postUrl = `${siteUrl}/posts/${encodeURIComponent(post?.slug || String(parent.post_id))}#comment-${inserted?.id || ''}`;
    const unsubscribe = await commentReplyUnsubscribeUrl(siteUrl, recipient);
    await sendConfiguredEmail(
      recipient,
      `你的评论收到了回复 - ${siteTitle}`,
      `<div style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0d1a2d">
        <p>${htmlEscape(parent.author_name || '你好')}，你在《${htmlEscape(post?.title || '')}》下的评论收到了回复。</p>
        <blockquote style="margin:12px 0;padding:10px 14px;background:#f5f7fa;border-left:3px solid #cdd5df;color:#5a6b7f">${htmlEscape(String(parent.content || '').slice(0, 300))}</blockquote>
        <div style="margin:12px 0;padding:12px 14px;background:#fff;border:1px solid #e5eaf0">${htmlEscape(reply.slice(0, 500))}</div>
        <p><a href="${htmlEscape(postUrl)}">查看回复</a></p>
        <p style="font-size:12px;color:#8ea0b4">不想再收到回复通知？<a href="${htmlEscape(unsubscribe)}">点击此处退订</a>。</p>
      </div>`,
    ).catch(() => {});
  }
  return inserted?.id || 0;
}

function extensionDir(kind: 'theme' | 'plugin') {
  return join(config.contentDir, kind === 'theme' ? 'themes' : 'plugins');
}

function isBuiltinTheme(id: string) {
  return Boolean(id) && existsSync(join(runtimePaths.builtinThemesDir, id));
}

function extensionExists(kind: 'theme' | 'plugin', id: string) {
  if (!id) return false;
  if (kind === 'theme' && isBuiltinTheme(id)) return true;
  const builtinDir = kind === 'theme' ? runtimePaths.builtinThemesDir : runtimePaths.builtinPluginsDir;
  return existsSync(join(extensionDir(kind), id)) || existsSync(join(builtinDir, id));
}

async function uploadExtension(c: Context, kind: 'theme' | 'plugin') {
  const body = await c.req.parseBody().catch(() => ({}));
  const file = Object.values(body).find((v) => v instanceof File) as File | undefined;
  if (!file) return badRequest(c, '请上传 zip 文件');
  if (!file.name.toLowerCase().endsWith('.zip')) return badRequest(c, '仅支持 .zip 格式');
  if (file.size > 50 * 1024 * 1024) return badRequest(c, '文件过大（最大 50MB）');
  const tmp = mkdtempSync(join(tmpdir(), `utterlog-${kind}-`));
  const zipPath = join(tmp, `${safeId(file.name.replace(/\.zip$/i, '')) || kind}.zip`);
  const uploadedBytes = new Uint8Array(await file.arrayBuffer());
  try {
    validateExtensionZipEntries(uploadedBytes);
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, err instanceof Error ? err.message : '扩展包 ZIP 文件不安全');
  }
  writeFileSync(zipPath, uploadedBytes);
  const unzip = Bun.spawn(['unzip', '-q', zipPath, '-d', tmp], { stdout: 'pipe', stderr: 'pipe' });
  const code = await unzip.exited;
  if (code !== 0) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, '扩展包解压失败');
  }
  const primaryManifest = kind === 'theme' ? 'theme.json' : 'plugin.json';
  const manifestNames = ['manifest.json', primaryManifest];
  const manifestIn = (dir: string) => manifestNames.find((name) => existsSync(join(dir, name)));
  const candidates = readdirSync(tmp, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(tmp, d.name))
    .filter((dir) => Boolean(manifestIn(dir)));
  const root = manifestIn(tmp) ? tmp : candidates[0];
  const manifest = root ? manifestIn(root) : '';
  if (!root) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, `扩展包缺少 manifest.json 或 ${primaryManifest}`);
  }
  const meta = JSON.parse(readFileSync(join(root, manifest || primaryManifest), 'utf8')) as Record<string, unknown>;
  const id = safeId(String(meta.id || basename(root)));
  if (!id) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, '扩展 ID 只能包含字母、数字、下划线和短横线');
  }
  if (kind === 'theme' && isBuiltinTheme(id)) {
    await rm(tmp, { recursive: true, force: true });
    return badRequest(c, '不能覆盖内置主题，请更换 manifest 里的 id');
  }
  const target = join(extensionDir(kind), id);
  await mkdir(extensionDir(kind), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await cp(root, target, { recursive: true });
  await rm(tmp, { recursive: true, force: true });
  return ok(c, { id, ...meta });
}

async function setPluginActive(id: string, active: boolean) {
  const current = parseJsonOption<string[]>(await optionValue('active_plugins', '[]'), []);
  const next = active
    ? Array.from(new Set([...current, id]))
    : current.filter((value) => value !== id);
  await saveOption('active_plugins', JSON.stringify(next));
  return next;
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
}

async function securitySettings() {
  const countries = await optionValue('geo_countries', 'CN,HK,TW,MO');
  return {
    cc_enabled: boolValue(await optionValue('cc_enabled', 'false')),
    cc_limit_5s: Number(await optionValue('cc_limit_5s', '30')) || 30,
    cc_limit_60s: Number(await optionValue('cc_limit_60s', '120')) || 120,
    geo_enabled: boolValue(await optionValue('geo_enabled', 'false')),
    geo_mode: await optionValue('geo_mode', 'whitelist'),
    geo_countries: countries.split(',').map((v) => v.trim()).filter(Boolean),
    ip_geo_provider: normalizeGeoProvider(await optionValue('ip_geo_provider', 'ipx')),
  };
}

async function logSecurityEvent(ip: string, eventType: string, detail = '') {
  await exec(
    `insert into ${table('security_events')} (ip, event_type, detail, score_delta, created_at)
     values ($1, $2, $3, 0, $4)`,
    [ip || '', eventType, detail || '', nowUnix()],
  ).catch(() => {});
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

async function unsubscribeSecret() {
  let secret = (await optionValue('unsubscribe_secret', '')).trim();
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    await saveOption('unsubscribe_secret', secret);
  }
  return secret;
}

async function verifyCommentReplyUnsubscribe(emailEnc: string, sig: string) {
  if (!emailEnc || !sig) return '';
  let email = '';
  try {
    email = Buffer.from(emailEnc, 'base64url').toString('utf8').trim().toLowerCase();
  } catch {
    return '';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  const mac = createHmac('sha256', await unsubscribeSecret()).update(`comment_reply:${email}`).digest('base64url').slice(0, 22);
  const a = Buffer.from(sig);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return '';
  return email;
}

async function commentReplyUnsubscribeUrl(siteUrl: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  const enc = Buffer.from(normalized).toString('base64url');
  const sig = createHmac('sha256', await unsubscribeSecret()).update(`comment_reply:${normalized}`).digest('base64url').slice(0, 22);
  return `${siteUrl.replace(/\/+$/, '')}/api/v1/unsubscribe/comment-reply?e=${enc}&t=${sig}`;
}

async function isCommentReplyOptedOut(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const optouts = parseJsonOption<Record<string, unknown>>(await optionValue('comment_reply_optouts_v1', '{}'), {});
  return Object.prototype.hasOwnProperty.call(optouts, normalized);
}

async function addCommentReplyOptout(email: string) {
  const option = 'comment_reply_optouts_v1';
  const current = parseJsonOption<Record<string, number>>(await optionValue(option, '{}'), {});
  current[email.toLowerCase()] = nowUnix();
  await saveOption(option, JSON.stringify(current));
}

const backupDir = process.env.BACKUP_DIR || 'backups';

function safeBackupPath(filename?: string) {
  if (!filename) return '';
  const clean = basename(filename);
  if (!clean || clean !== filename || !clean.endsWith('.zip')) return '';
  return join(backupDir, clean);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function dirSize(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  return readdirSync(path).reduce((sum, name) => sum + dirSize(join(path, name)), 0);
}

function fileCount(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return 1;
  if (!stat.isDirectory()) return 0;
  return readdirSync(path).reduce((sum, name) => sum + fileCount(join(path, name)), 0);
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = Math.max(1, date.getDate());
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { time, date: (year << 9) | (month << 5) | day };
}

function collectZipFiles(root: string, prefix: string, files: { name: string; data: Buffer }[]) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    const zipName = `${prefix}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) collectZipFiles(full, zipName, files);
    else if (entry.isFile()) files.push({ name: zipName, data: readFileSync(full) });
  }
}

function buildZip(files: { name: string; data: Buffer }[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + file.data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function backupDestinationValue(value: string): 'local' | 's3' | 'r2' {
  return value === 's3' || value === 'r2' ? value : 'local';
}

async function configuredBackupDestination() {
  return backupDestinationValue((await optionValue('backup_destination', 'local')).trim().toLowerCase());
}

async function createBackupArchive(options: { includeUploads?: boolean } = {}) {
  const includeUploads = options.includeUploads !== false;
  mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const filename = `utterlog-backup-${ts}.zip`;
  const dbDumpPath = join(backupDir, `db-${ts}.sql`);
  const dump = await runCommand([
    'pg_dump',
    '-h', config.dbHost,
    '-p', String(config.dbPort),
    '-U', config.dbUser,
    '-d', config.dbName,
    '--no-owner',
    '--no-acl',
    '-f', dbDumpPath,
  ]);
  if (dump.code !== 0) {
    rmSync(dbDumpPath, { force: true });
    throw new Error(dump.stderr || '数据库导出失败');
  }
  const files: { name: string; data: Buffer }[] = [{ name: 'database.sql', data: readFileSync(dbDumpPath) }];
  if (includeUploads) collectZipFiles(config.uploadDir, 'uploads', files);
  collectZipFiles(config.contentDir, 'content', files);
  const zipPath = join(backupDir, filename);
  writeFileSync(zipPath, buildZip(files));
  rmSync(dbDumpPath, { force: true });
  const stat = statSync(zipPath);
  return {
    filename,
    path: zipPath,
    size: stat.size,
    url: `${config.appUrl.replace(/\/$/, '')}/api/v1/backup/download/${encodeURIComponent(filename)}`,
    created: ts,
  };
}

async function syncBackupToCloud(backup: Awaited<ReturnType<typeof createBackupArchive>>, destination: 's3' | 'r2') {
  const baseSettings = await storageSettings();
  const settings = { ...baseSettings, driver: destination };
  const objectKey = `backups/${backup.filename}`;
  await putStorageObject(settings, objectKey, readFileSync(backup.path), 'application/zip');
  return {
    driver: destination,
    key: objectKey,
    url: publicStorageUrl(settings, objectKey),
  };
}

async function createConfiguredBackup() {
  const destination = await configuredBackupDestination();
  const backup = await createBackupArchive({ includeUploads: destination === 'local' });
  if (destination === 's3' || destination === 'r2') {
    const cloud = await syncBackupToCloud(backup, destination);
    return { ...backup, destination, cloud };
  }
  return { ...backup, destination };
}

let backupSchedulerStarted = false;
let backupJobRunning = false;

function cleanupOldBackups(keep: number) {
  if (!Number.isFinite(keep) || keep <= 0 || !existsSync(backupDir)) return 0;
  const backups = readdirSync(backupDir)
    .filter((name) => name.endsWith('.zip'))
    .map((name) => ({ name, path: join(backupDir, name), mtime: statSync(join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const stale = backups.slice(keep);
  for (const item of stale) rmSync(item.path, { force: true });
  return stale.length;
}

async function backupKeepLimit() {
  const value = Number(await optionValue('backup_keep', '10'));
  return Number.isFinite(value) && value >= 0 ? value : 10;
}

async function runScheduledBackup() {
  if (backupJobRunning) return;
  const schedule = (await optionValue('backup_schedule', 'off')).trim().toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(schedule)) return;
  const interval = schedule === 'daily' ? 86400 : schedule === 'weekly' ? 7 * 86400 : 30 * 86400;
  const now = nowUnix();
  const last = Number(await optionValue('backup_last_run_at', '0')) || 0;
  if (last > 0 && now - last < interval) return;

  backupJobRunning = true;
  try {
    const backup = await createConfiguredBackup();
    const keep = await backupKeepLimit();
    const deleted = cleanupOldBackups(keep);
    await Promise.all([
      saveOption('backup_last_run_at', String(now)),
      saveOption('backup_last_status', `ok: ${backup.filename}, destination=${backup.destination}, deleted=${deleted}`),
    ]);
    console.log(`[backup-scheduler] created=${backup.filename} destination=${backup.destination} deleted=${deleted}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'backup failed';
    await saveOption('backup_last_status', `error: ${message.slice(0, 240)}`).catch(() => {});
    console.error('[backup-scheduler] error', err);
  } finally {
    backupJobRunning = false;
  }
}

function startBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;
  const run = () => runScheduledBackup().catch((err) => console.error('[backup-scheduler] error', err));
  setTimeout(run, 5 * 60_000).unref();
  setInterval(run, 60 * 60_000).unref();
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

function parseFootprintDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    return Math.floor(new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0).getTime() / 1000);
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function slugifyRoute(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
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

async function upsertFootprintPlace(input: Record<string, unknown>) {
  const countryName = String(input.country_name || '').trim();
  const countryCode = String(input.country_code || '').trim().toUpperCase();
  const cityName = String(input.city_name || '').trim();
  if (!countryName && !countryCode && !cityName) return 0;
  const latitude = nullableNumber(input.latitude);
  const longitude = nullableNumber(input.longitude);
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

async function upsertFootprintRoute(nameValue: unknown) {
  const name = String(nameValue || '').trim();
  if (!name) return 0;
  const existing = await one<{ id: number }>(`select id from ${table('footprint_routes')} where lower(name)=lower($1) limit 1`, [name]);
  if (existing?.id) return existing.id;
  const inserted = await one<{ id: number }>(
    `insert into ${table('footprint_routes')} (name, slug, description, sort_order, created_at, updated_at)
     values ($1,$2,'',0,$3,$3) returning id`,
    [name, slugifyRoute(name), nowUnix()],
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
  );
}

async function updatePostFootprint(id: number, input: Record<string, unknown>) {
  const old = await one<{ place_id: number }>(`select coalesce(place_id,0) as place_id from ${table('post_footprints')} where id = $1`, [id]);
  let placeId = Number(input.place_id || 0);
  if (!placeId) placeId = await upsertFootprintPlace(input);
  let routeId = Number(input.route_id || 0);
  if (!routeId) routeId = await upsertFootprintRoute(input.route_name);
  await exec(
    `update ${table('post_footprints')}
     set place_id=$1, route_id=$2, visited_at=$3, route_order=$4, keywords=$5, note=$6, updated_at=$7
     where id=$8`,
    [
      placeId || null,
      routeId || 0,
      parseFootprintDate(input.visited_at),
      Number(input.route_order || 0),
      String(input.keywords || '').trim(),
      String(input.note || '').trim(),
      nowUnix(),
      id,
    ],
  );
  await refreshFootprintVisitCount(Number(old?.place_id || 0));
  await refreshFootprintVisitCount(placeId);
}

async function listFootprints(c: any, admin: boolean) {
  const sp = new URL(c.req.url).searchParams;
  const where = [`p.type = 'post'`];
  const params: unknown[] = [];
  if (!admin) {
    where.push(`p.status = 'publish'`, `pf.place_id is not null`);
  }
  const addIlike = (sql: string, value: string) => {
    const term = value.trim();
    if (!term) return;
    params.push(`%${term}%`);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  addIlike(`coalesce(fp.city_name,'') ilike ?`, sp.get('city') || '');
  addIlike(`(coalesce(fp.country_name,'') ilike ? or coalesce(fp.country_code,'') ilike ?)`, sp.get('country') || '');
  addIlike(`fr.name ilike ?`, sp.get('route') || '');
  addIlike(
    `(coalesce(fp.city_name,'') ilike ? or coalesce(fp.country_name,'') ilike ? or coalesce(fp.country_code,'') ilike ?)`,
    sp.get('keyword') || '',
  );
  const rows = await many<Record<string, unknown>>(
    `select pf.id, pf.post_id, p.status, p.title, p.slug, p.cover_url, p.display_id, p.created_at,
            pf.visited_at, pf.route_order, coalesce(pf.keywords,'') as keywords,
            coalesce(fp.id,0) as place_id,
            coalesce(fp.country_name,'') as country_name,
            coalesce(fp.country_code,'') as country_code,
            coalesce(fp.city_name,'') as city_name,
            fp.latitude, fp.longitude,
            coalesce(fr.id,0) as route_id, coalesce(fr.name,'') as route_name
     from ${table('post_footprints')} pf
     join ${table('posts')} p on p.id = pf.post_id
     left join ${table('footprint_places')} fp on fp.id = pf.place_id
     left join ${table('footprint_routes')} fr on fr.id = pf.route_id
     where ${where.join(' and ')}
     order by coalesce(nullif(pf.visited_at,0), p.created_at) desc, pf.id desc
     limit 200`,
    params,
  ).catch(() => []);
  return ok(c, rows);
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function mapValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function pickGeocodeCity(results: any[]) {
  for (const preferred of ['locality', 'administrative_area_level_1']) {
    for (const result of results || []) {
      if (Array.isArray(result.types) && result.types.includes(preferred)) return String(result.long_name || '');
    }
  }
  return '';
}

async function reverseGeocodeMapbox(lat: number, lng: number) {
  const token = (await optionValue('mapbox_access_token', '')).trim() || (await optionValue('footprint_mapbox_token', '')).trim();
  if (!token) throw new Error('mapbox token missing');
  const apiUrl = ((await optionValue('mapbox_api_url', 'https://api.mapbox.com')).trim() || 'https://api.mapbox.com').replace(/\/+$/, '');
  const q = new URLSearchParams({ access_token: token, language: 'zh', types: 'place,locality,district,region,country' });
  const payload = await fetchJson<any>(`${apiUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(`${lng.toFixed(6)},${lat.toFixed(6)}`)}.json?${q}`);
  for (const preferred of ['place', 'locality', 'district', 'region', 'country']) {
    for (const feature of payload.features || []) {
      if (!Array.isArray(feature.place_type) || !feature.place_type.includes(preferred)) continue;
      const name = firstNonEmpty(feature.text, feature.place_name);
      if (!name) continue;
      const result: Record<string, string> = { location: name, provider: 'mapbox' };
      if (['place', 'locality', 'district'].includes(preferred)) result.city = name;
      if (preferred === 'region') result.region = name;
      if (preferred === 'country') result.country = name;
      for (const ctx of feature.context || []) {
        if (!result.region && String(ctx.id || '').startsWith('region.')) result.region = String(ctx.text || '').trim();
        if (!result.country && String(ctx.id || '').startsWith('country.')) result.country = String(ctx.text || '').trim();
      }
      return result;
    }
  }
  throw new Error('mapbox no result');
}

async function reverseGeocodeAmap(lat: number, lng: number) {
  const key = (await optionValue('amap_api_key', '')).trim();
  if (!key) throw new Error('amap key missing');
  const q = new URLSearchParams({ key, location: `${lng.toFixed(6)},${lat.toFixed(6)}`, extensions: 'base', output: 'json' });
  const payload = await fetchJson<Record<string, unknown>>(`https://restapi.amap.com/v3/geocode/regeo?${q}`, 5000);
  if (String(payload.status || '') !== '1') throw new Error(`amap status ${payload.status}`);
  const component = mapValue(mapValue(payload.regeocode).addressComponent);
  const city = firstNonEmpty(component.city, component.district, component.province);
  const region = firstNonEmpty(component.province);
  const country = firstNonEmpty(component.country);
  const location = firstNonEmpty(city, region, country);
  if (!location) throw new Error('amap no result');
  return { location, city, region, country, provider: 'amap' };
}

async function reverseGeocodeTencent(lat: number, lng: number) {
  const key = (await optionValue('tencent_maps_api_key', '')).trim();
  if (!key) throw new Error('tencent key missing');
  const q = new URLSearchParams({ key, location: `${lat.toFixed(6)},${lng.toFixed(6)}`, get_poi: '0' });
  const payload = await fetchJson<any>(`https://apis.map.qq.com/ws/geocoder/v1/?${q}`, 5000);
  if (payload.status !== 0) throw new Error(`tencent status ${payload.status}`);
  const component = payload.result?.address_component || {};
  const city = firstNonEmpty(component.city, component.district, component.province);
  const location = firstNonEmpty(city, component.province, component.nation);
  if (!location) throw new Error('tencent no result');
  return { location, city, region: component.province || '', country: component.nation || '', provider: 'tencent' };
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

function cleanLongText(input: string, limit = 8000) {
  const text = decodeEntities(String(input || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_\-~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
  return text.length > limit ? text.slice(0, limit) : text;
}

const githubOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const githubRepoPattern = /^[A-Za-z0-9._-]+$/;
const githubReservedPaths = new Set([
  'about', 'apps', 'blog', 'collections', 'contact', 'enterprise', 'events', 'explore',
  'features', 'github', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications',
  'orgs', 'organizations', 'pricing', 'pulls', 'search', 'settings', 'sponsors', 'topics', 'trending',
]);

type GitHubProfile = {
  login?: string;
  type?: string;
  name?: string;
  avatar_url?: string;
  html_url?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  public_repos?: number;
  followers?: number;
  following?: number;
  created_at?: string;
};

type GitHubRepo = {
  name?: string;
  full_name?: string;
  html_url?: string;
  description?: string;
  language?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  license?: { spdx_id?: string } | null;
  pushed_at?: string;
  updated_at?: string;
  archived?: boolean;
  fork?: boolean;
};

type CodingRepo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  open_issues: number;
  license: string;
  pushed_at: string;
  updated_at: string;
  archived: boolean;
  fork: boolean;
  activities?: CodingActivity[];
};

type CodingActivity = {
  type: string;
  label: string;
  repo: string;
  url: string;
  created_at: string;
  created_unix: number;
  count: number;
};

function splitCodingSources(raw: string) {
  return String(raw || '').split(/[\s,，;；]+/).map((value) => value.trim()).filter(Boolean);
}

function extractGitHubOwnerRepo(raw: unknown) {
  let value = String(raw || '').trim().replace(/^@/, '').replace(/\/+$/, '');
  if (!value) return { owner: '', repo: '' };
  if (!value.includes('://') && value.toLowerCase().includes('github.com')) value = `https://${value}`;
  let parts: string[] = [];
  if (value.includes('://')) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return { owner: '', repo: '' };
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'github.com') return { owner: '', repo: '' };
    parts = parsed.pathname.split('/').map((part) => decodeURIComponent(part)).filter(Boolean);
  } else {
    parts = value.split('/').filter(Boolean);
  }
  const owner = String(parts[0] || '').trim();
  let repo = String(parts[1] || '').trim().replace(/\.git$/, '');
  if (!owner || githubReservedPaths.has(owner.toLowerCase()) || !githubOwnerPattern.test(owner)) return { owner: '', repo: '' };
  if (repo && !githubRepoPattern.test(repo)) repo = '';
  return { owner, repo };
}

function parseSelectedRepos(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((item) => String(item).toLowerCase()).filter(Boolean));
  } catch {
    // Legacy comma format.
  }
  return new Set(raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}

async function resolveCodingSources() {
  const custom = (await optionValue('coding_github_url', '')).trim();
  if (custom) return { source: 'custom', raw: splitCodingSources(custom) };
  const legacy = (await optionValue('social_github', '')).trim();
  if (legacy) return { source: 'social_github', raw: splitCodingSources(legacy) };
  const socialLinks = (await optionValue('social_links', '')).trim();
  if (!socialLinks) return { source: '', raw: [] as string[] };
  try {
    const links = JSON.parse(socialLinks);
    if (!Array.isArray(links)) return { source: '', raw: [] as string[] };
    return {
      source: 'profile_social_links',
      raw: links
        .filter((item) => `${item?.name || ''} ${item?.icon || ''} ${item?.url || ''}`.toLowerCase().includes('github'))
        .map((item) => String(item?.url || '').trim())
        .filter(Boolean),
    };
  } catch {
    return { source: '', raw: [] as string[] };
  }
}

async function githubHeaders() {
  const token = (await optionValue('github_access_token', '')).trim();
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'Utterlog-Bun',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson<T>(path: string, timeoutMs = 12000): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: await githubHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as any).message || `GitHub HTTP ${res.status}`));
  return payload as T;
}

function toCodingRepo(repo: GitHubRepo): CodingRepo {
  return {
    name: String(repo.name || ''),
    full_name: String(repo.full_name || ''),
    html_url: String(repo.html_url || ''),
    description: String(repo.description || ''),
    language: String(repo.language || ''),
    stars: Number(repo.stargazers_count || 0),
    forks: Number(repo.forks_count || 0),
    open_issues: Number(repo.open_issues_count || 0),
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : '',
    pushed_at: String(repo.pushed_at || ''),
    updated_at: String(repo.updated_at || ''),
    archived: Boolean(repo.archived),
    fork: Boolean(repo.fork),
  };
}

function eventLabel(event: any) {
  const type = String(event.type || '').replace(/Event$/, '');
  if (type === 'Push') return `Pushed ${Array.isArray(event.payload?.commits) ? event.payload.commits.length : 1} commit(s)`;
  if (type === 'PullRequest') return `${event.payload?.action || 'updated'} pull request`;
  if (type === 'Issues') return `${event.payload?.action || 'updated'} issue`;
  if (type === 'IssueComment') return 'Commented on issue';
  if (type === 'Create') return `Created ${event.payload?.ref_type || 'repository'}`;
  if (type === 'Watch') return 'Starred repository';
  if (type === 'Fork') return 'Forked repository';
  return type || 'GitHub activity';
}

function eventUrl(event: any) {
  return String(
    event.payload?.pull_request?.html_url ||
    event.payload?.issue?.html_url ||
    event.payload?.comment?.html_url ||
    (event.repo?.name ? `https://github.com/${event.repo.name}` : ''),
  );
}

function toCodingActivity(event: any): CodingActivity {
  const createdAt = String(event.created_at || '');
  const createdUnix = Math.floor((Date.parse(createdAt) || Date.now()) / 1000);
  const count = event.type === 'PushEvent' && Array.isArray(event.payload?.commits)
    ? Math.max(1, event.payload.commits.length)
    : 1;
  return {
    type: String(event.type || ''),
    label: eventLabel(event),
    repo: String(event.repo?.name || ''),
    url: eventUrl(event),
    created_at: createdAt,
    created_unix: createdUnix,
    count,
  };
}

function eventCode(type: string) {
  const normalized = String(type || '').replace(/Event$/, '').toUpperCase();
  if (normalized.includes('PULLREQUESTREVIEW')) return 'REV';
  if (normalized.includes('PULLREQUEST')) return 'PR';
  if (normalized.includes('ISSUECOMMENT')) return 'CMT';
  if (normalized.includes('ISSUE')) return 'ISS';
  if (normalized.includes('PUSH')) return 'PUSH';
  if (normalized.includes('CREATE')) return 'NEW';
  if (normalized.includes('DELETE')) return 'DEL';
  if (normalized.includes('FORK')) return 'FORK';
  if (normalized.includes('WATCH')) return 'STAR';
  return normalized.slice(0, 4) || 'LOG';
}

function emptyContributionDays(now = new Date()) {
  const days: { date: string; count: number }[] = [];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return days;
}

function activityDays(events: CodingActivity[], repos: CodingRepo[], selected: Set<string>) {
  const repoMap = new Map(repos.map((repo) => [repo.full_name.toLowerCase(), repo]));
  const hasSelection = selected.size > 0;
  const byDay = new Map<string, { date: string; label: string; total: number; repo_count: number; repos: any[]; repoMap: Map<string, any>; latest: number }>();
  for (const event of events) {
    const repoKey = event.repo.toLowerCase();
    if (hasSelection && !selected.has(repoKey)) continue;
    const date = new Date(event.created_at).toISOString().slice(0, 10);
    if (!byDay.has(date)) byDay.set(date, { date, label: date, total: 0, repo_count: 0, repos: [], repoMap: new Map(), latest: 0 });
    const day = byDay.get(date)!;
    const meta = repoMap.get(repoKey);
    if (!day.repoMap.has(repoKey)) {
      day.repoMap.set(repoKey, {
        name: meta?.name || event.repo.split('/').pop() || event.repo || 'Repository',
        full_name: meta?.full_name || event.repo,
        html_url: meta?.html_url || (event.repo ? `https://github.com/${event.repo}` : ''),
        summary: '',
        counts: {},
        events: [],
        latest: 0,
      });
    }
    const group = day.repoMap.get(repoKey);
    const code = eventCode(event.type);
    group.counts[code] = Number(group.counts[code] || 0) + Math.max(1, event.count || 1);
    if (group.events.length < 5) group.events.push(event);
    group.latest = Math.max(group.latest, event.created_unix);
    day.total += Math.max(1, event.count || 1);
    day.latest = Math.max(day.latest, event.created_unix);
  }
  return Array.from(byDay.values())
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 30)
    .map((day) => {
      const groups = Array.from(day.repoMap.values()).sort((a, b) => b.latest - a.latest);
      return {
        date: day.date,
        label: day.label,
        summary: `${day.total} activities across ${groups.length} repos`,
        total: day.total,
        repo_count: groups.length,
        repos: groups.map(({ latest, ...repo }) => ({ ...repo, summary: Object.entries(repo.counts).map(([k, v]) => `${v} ${k}`).join(' · ') })),
      };
    });
}

async function codingPayload(c: Context) {
  const enabled = (await optionValue('page_coding', 'true')) !== 'false';
  const includeRepos = new URL(c.req.url).searchParams.get('include_repos') === 'true' && currentUserId(c) > 0;
  const { source, raw } = await resolveCodingSources();
  const seenOwners = new Set<string>();
  const sourceRepos = new Set<string>();
  const owners: string[] = [];
  for (const item of raw) {
    const parsed = extractGitHubOwnerRepo(item);
    if (!parsed.owner) continue;
    const ownerKey = parsed.owner.toLowerCase();
    if (!seenOwners.has(ownerKey)) {
      seenOwners.add(ownerKey);
      owners.push(parsed.owner);
    }
    if (parsed.repo) sourceRepos.add(`${parsed.owner}/${parsed.repo}`.toLowerCase());
  }
  if (!owners.length) {
    return {
      enabled,
      configured: false,
      source,
      username: '',
      repos: [],
      events: [],
      activity_days: [],
      contributions: emptyContributionDays(),
      stats: { total_contributions: 0, all_contributions: 0, recent_events: 0, recent_repos: 0, public_repos: 0, followers: 0 },
      updated_at: nowUnix(),
    };
  }
  const optionSelected = parseSelectedRepos(await optionValue('coding_selected_repos', ''));
  const selected = new Set([...sourceRepos, ...optionSelected]);
  const cacheKey = `coding:v3:${owners.join(',').toLowerCase()}:${Array.from(selected).sort().join(',')}:${includeRepos ? 'with-repos' : 'public'}`;
  const cached = await ephemeral.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const profiles: GitHubProfile[] = [];
  const allRepos = new Map<string, CodingRepo>();
  const events: CodingActivity[] = [];
  let firstError = '';
  for (const owner of owners) {
    try {
      const [profile, reposRaw, eventsRaw] = await Promise.all([
        githubJson<GitHubProfile>(`/users/${encodeURIComponent(owner)}`),
        githubJson<GitHubRepo[]>(`/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`),
        githubJson<any[]>(`/users/${encodeURIComponent(owner)}/events/public?per_page=100`),
      ]);
      profiles.push(profile);
      for (const repo of reposRaw) {
        const item = toCodingRepo(repo);
        if (item.full_name) allRepos.set(item.full_name.toLowerCase(), item);
      }
      events.push(...eventsRaw.map(toCodingActivity));
    } catch (err) {
      firstError ||= err instanceof Error ? err.message : 'GitHub 数据读取失败';
    }
  }
  const repos = Array.from(allRepos.values()).sort((a, b) => String(b.pushed_at || b.updated_at).localeCompare(String(a.pushed_at || a.updated_at)));
  const hasSelection = selected.size > 0;
  const displayRepos = repos
    .filter((repo) => !hasSelection || selected.has(repo.full_name.toLowerCase()))
    .slice(0, 12)
    .map((repo) => ({ ...repo, activities: events.filter((event) => event.repo.toLowerCase() === repo.full_name.toLowerCase()).slice(0, 5) }));
  const dayIndex = new Map(emptyContributionDays().map((day, index) => [day.date, index]));
  const contributions = emptyContributionDays();
  for (const event of events) {
    if (hasSelection && !selected.has(event.repo.toLowerCase())) continue;
    const date = new Date(event.created_at).toISOString().slice(0, 10);
    const idx = dayIndex.get(date);
    if (idx !== undefined) contributions[idx].count += Math.max(1, event.count || 1);
  }
  const totalContributions = contributions.reduce((sum, day) => sum + day.count, 0);
  const payload = {
    enabled,
    configured: true,
    source,
    username: owners.join(','),
    profile: profiles[0] || null,
    profiles,
    repos: displayRepos,
    available_repos: includeRepos ? repos : undefined,
    events: events.sort((a, b) => b.created_unix - a.created_unix).slice(0, 40),
    activity_days: activityDays(events, repos, selected),
    contributions,
    stats: {
      total_contributions: totalContributions,
      all_contributions: totalContributions,
      recent_events: events.length,
      recent_repos: displayRepos.length,
      public_repos: repos.length,
      followers: profiles.reduce((sum, profile) => sum + Number(profile.followers || 0), 0),
    },
    updated_at: nowUnix(),
    error: firstError || undefined,
  };
  await ephemeral.set(cacheKey, JSON.stringify(payload), firstError ? 300 : 3600);
  return payload;
}

async function callEmbedding(text: string, userId: number) {
  const provider = await activeAiProvider('embedding');
  if (!provider) throw new Error('请先配置 embedding 类型的 AI 提供商');
  const endpoint = String(provider.endpoint || '');
  const model = String(provider.model || '');
  const apiKey = String(provider.api_key || '');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(Math.max(10, Number(provider.timeout || 30)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) {
    const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
    await logAi(userId, provider, 'embedding', 'error', String(message));
    throw new Error(String(message));
  }
  const embedding = payload.data?.[0]?.embedding || payload.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) throw new Error('embedding provider 返回为空');
  await logAi(userId, provider, 'embedding', 'success', `embedding:${embedding.length}`, { tokens: payload.usage || {} });
  return embedding.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value));
}

function embeddingLiteral(values: number[]) {
  if (!values.length) throw new Error('embedding 为空');
  return `[${values.join(',')}]`;
}

async function rebuildEmbeddings(limit = 0, userId = 0) {
  const posts = await many<{ id: number; title: string; content: string | null }>(
    `select id, title, content from ${table('posts')}
     where status = 'publish' and type = 'post'
     order by id asc${limit > 0 ? ` limit ${Math.min(500, Math.max(1, limit))}` : ''}`,
  );
  let embedded = 0;
  let failed = 0;
  for (const post of posts) {
    const text = `${post.title} ${cleanLongText(post.content || '', 8000)}`.trim();
    try {
      const vector = embeddingLiteral(await callEmbedding(text, userId));
      await exec(`update ${table('posts')} set embedding = $1, updated_at = $2 where id = $3`, [vector, nowUnix(), post.id]);
      embedded++;
      await Bun.sleep(200);
    } catch {
      failed++;
    }
  }
  return { total: posts.length, embedded, failed };
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
  for (const prefix of ['captcha:', 'online:', 'stats:', 'views:', 'geo:', 'coding:', 'weather:', 'reader-chat:']) {
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

function aiPurposeForAction(action: string) {
  if (['chat', 'reader-chat'].includes(action)) return 'chat';
  if (['comment-reply'].includes(action)) return 'comment-reply';
  if (['comment-audit'].includes(action)) return 'comment-audit';
  if (['slug', 'summary', 'tags', 'format', 'query', 'batch-summary', 'batch-questions', 'search-rebuild', 'embedding'].includes(action)) return 'content';
  return '';
}

type ReaderMessage = { role: string; content: string };
const READER_CHAT_TTL = 7200;

async function getReaderSession(sessionId: string) {
  const raw = await ephemeral.get(`reader-chat:${sessionId}`);
  if (!raw) return { messages: [] as ReaderMessage[], lastUsed: Date.now() };
  try {
    return JSON.parse(raw) as { messages: ReaderMessage[]; lastUsed: number };
  } catch {
    return { messages: [] as ReaderMessage[], lastUsed: Date.now() };
  }
}

async function saveReaderSession(sessionId: string, session: { messages: ReaderMessage[]; lastUsed: number }) {
  await ephemeral.set(`reader-chat:${sessionId}`, JSON.stringify(session), READER_CHAT_TTL);
}

async function activeAiProvider(type = 'text', purpose = '') {
  const providers = await activeAiProviders(type, purpose);
  return providers[0] || null;
}

async function activeAiProviders(type = 'text', purpose = '') {
  const providers: Record<string, unknown>[] = [];
  const seen = new Set<number>();
  if (type === 'text' && purpose) {
    const assigned = intParam(await optionValue(`ai_purpose_${purpose}_provider`, '0'));
    if (assigned > 0) {
      const row = await one<Record<string, unknown>>(
        `select * from ${table('ai_providers')} where id = $1 and type = 'text' and is_active = true limit 1`,
        [assigned],
      ).catch(() => null);
      if (row) {
        providers.push(row);
        seen.add(Number(row.id || 0));
      }
    }
  }
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('ai_providers')} where type = $1 and is_active = true order by is_default desc, sort_order asc, id asc`,
    [type],
  ).catch(() => []);
  for (const row of rows) {
    const id = Number(row.id || 0);
    if (!seen.has(id)) {
      providers.push(row);
      seen.add(id);
    }
  }
  return providers;
}

const aiPresets = {
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-5.5', 'gpt-5', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'] },
  deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', models: ['deepseek-v4', 'deepseek-v3', 'deepseek-chat', 'deepseek-reasoner'] },
  gemini: { name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  qwen: { name: 'Qwen · 文本', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: ['qwen3-max', 'qwen-plus', 'qwen-turbo'] },
  kimi: { name: 'Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-latest'] },
  minimax: { name: 'MiniMax', endpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2', models: ['MiniMax-M2.5'] },
  zhipu: { name: '智谱 AI', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['glm-4.7-flash'] },
  doubao: { name: '豆包', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', models: ['doubao-seed-1.8'] },
  anthropic: { name: 'Anthropic Claude', endpoint: 'https://api.anthropic.com/v1/messages', models: ['claude-opus-4-7', 'claude-sonnet-4-7', 'claude-opus-4-5', 'claude-sonnet-4-5'] },
  'openai-embedding': { name: 'OpenAI Embedding', endpoint: 'https://api.openai.com/v1/embeddings', models: ['text-embedding-3-small', 'text-embedding-3-large'], type: 'embedding' },
  'qwen-embedding': { name: 'Qwen · Embedding', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', models: ['text-embedding-v3'], type: 'embedding' },
  'openai-image': { name: 'OpenAI 图像', endpoint: 'https://api.openai.com/v1/images/generations', models: ['gpt-image-2', 'gpt-image-1', 'dall-e-3'], type: 'image' },
  'qwen-image': { name: 'Qwen · 图像', endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', models: ['qwen-image-2.0-pro'], type: 'image' },
  imagen: { name: 'Google Imagen', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-preview-06-06:predict', models: ['imagen-4.0-generate-preview-06-06', 'imagen-3.0-generate-002'], type: 'image' },
};

const aiPurposes = [
  { key: 'content', label: '内容生成', hint: 'AI 摘要 / Slug / 关键词 / 排版润色 / 批量问答 / SQL 查询都走这一个' },
  { key: 'chat', label: '聊天', hint: '后台 AI 助手 + 前台读者陪读 + Telegram /ai 命令统一走这一个' },
  { key: 'comment-audit', label: '评论审核', hint: '访客评论提交后的 AI 合规判断，可单独使用低成本文本模型' },
  { key: 'comment-reply', label: '评论回复', hint: 'AI 智能回复评论，可单独使用更自然的对话模型' },
];

const aiPromptDefaults = {
  summary: `你是一名专业编辑，请为以下文章写一段中文摘要。

要求：
1. 字数严格控制在 {min_len}-{max_len} 字
2. 提炼文章核心观点和关键信息，不要简单复述第一段
3. 用陈述句直接表达，不用"本文介绍了"、"通过…作者表达了"、"这篇文章讨论了"等套话开头
4. 保持中性客观语气，不要加自己的评价
5. 直接输出摘要内容，不要前缀、引号、Markdown 标记、emoji 或解释
6. 不要换行，全部写成一段

标题：{title}
{excerpt_section}正文：{content}`,
  slug: `为以下文章生成 SEO 友好的英文 URL slug。

规则：
- 提取标题里的 2-5 个关键概念词，用 - 连接（不是整句翻译）
- 全小写字母 + 数字 + 连字符 -，禁用下划线 / 空格 / 任何标点
- 长度 20-50 字符为佳，不超过 60 字符
- 跳过冠词 / 介词等无意义词（the / a / an / of / for / to / in / on / and）
- 保留版本号、年份等关键数字（如 v2 / 2024）
- 不要文件后缀（不加 .html / .htm）

直接输出 slug 字符串，不加任何引号、解释或前后缀。

文章标题：{title}`,
  keywords: `从以下文章中提取恰好 {tags_count} 个最能代表文章主题的关键词作为标签。

要求：
- 优先级：具体技术名 / 工具 / 产品 > 主题领域 > 概念抽象（避免泛词）
- 每个标签 2-6 字，单个名词或专有名词，不要短语或句子
- 禁用泛词：博客、技术、文章、内容、教程、分享、笔记、随笔、生活、思考
- 输出语言跟随原文（中文文章 → 中文标签；英文文章 → 英文标签）
- 仅输出 {tags_count} 个标签，用英文逗号 ", " 分隔
- 不要编号、不要解释、不要 emoji、不要引号

标题：{title}
内容：{content}`,
  polish: `请优化以下 Markdown 格式的文章排版与文字流畅度。这是排版润色，不是改写或改稿。

只能改：
- 错别字、明显的标点误用、多余空格
- 中英文 / 中数字之间的空格规范化
- 段落分布（过长的段落适度拆开，过碎的段落适度合并）
- 必要时补充 Markdown 标题层级（## ###）和列表 / 引用，前提是原文语义已经隐含这些结构
- 表格、代码块、引用块的对齐 / 缩进

绝对不能改：
- 任何代码块（Markdown 三反引号围栏 + 缩进式代码块）的内容一字不改，包括缩进和注释
- 任何技术术语、产品名、命令、URL、文件路径、版本号
- 作者的人称（保持"我 / 你"原样）和口吻
- 文字内容本身：不增加新观点、不删减信息、不替换表述方式
- 文章语言：中文保中文、英文保英文，不翻译

输出要求：
- 只输出优化后的 Markdown 全文，不加任何解释或注释
- 不要在文章前后加"总结 / 前言 / 修改说明"等额外段落
- 不要把整篇文章再包一层 Markdown 代码围栏
- 保留原文开头和结尾的所有内容

文章原文：

{content}`,
  questions: `阅读以下文章，假设你是一名感兴趣的读者，生成 3 个具体、有价值的提问。

要求：
- 问题必须基于文章实际内容，提到文中出现的具体名词、概念或场景
- 每个问题 8-20 字，简洁直接，便于显示成胶囊式按钮
- 三个问题角度尽量分散
- 用与文章相同的语言
- 每行一个问题，纯文本，不要编号、不要 emoji、不要引号

标题：{title}
{excerpt_section}内容：{content}`,
  cover: `画面要求：纯视觉抽象插画，画面里不能出现任何文字、字母、数字、英文单词、Logo、水印或 UI 元素。

{excerpt_block}画面表达的氛围（仅供色调和构图参考，不要把这段文字画到画面里）：{title}

视觉风格：
- 现代极简数字插画，柔和渐变色块为主体，配少量几何线条或抽象光影
- 配色：低饱和度，2-3 种和谐色调，留白充足
- 构图：16:9 横版，画面左侧或中间留出 30-40% 干净空白区域
- 画质：高清细腻，专业级数字艺术，柔光过渡

绝对禁止：
- 任何形态的文字 / 字母 / 单词 / 数字 / 符号
- 写实人物面部特写
- 复杂混乱的细节、过度饱和的色彩、噪点纹理过重
- 流行 logo / 品牌元素 / 软件 UI 截图
- 字幕、标题栏、版权水印`,
  'comment-audit': `你是博客评论审核员，对访客评论做内容合规判定。请只输出严格 JSON。

判定 不通过 的情形：
1. 政治敏感、煽动民族 / 群体对立
2. 色情、淫秽、暴力血腥、恐怖威胁
3. 赌博、毒品、违法行为引导或宣传
4. 针对个人的辱骂、攻击性脏话、人身羞辱
5. 垃圾广告（推销、推广链接、刷单兼职诱导、诈骗）
6. 完全无意义的字符重复 / 刷屏

判定 通过 的情形：
- 简短表态、正常负面观点、表情符号、合规闲聊、建议、提问、纠错

只输出严格 JSON，单行，不加任何前后说明 / Markdown / 代码块：
{"passed": true|false, "confidence": 0.0-1.0, "reason": "简要原因，限 30 字内"}

待审核评论：
{content}`,
  'comment-reply': `你是这个博客的博主本人，正在用自己的语气回复读者评论。请像跟朋友聊天一样自然，避免任何机械感。

回复风格：
- 直接切入主题，不要任何客套开头
- 第一人称用"我"，不用"小编 / 笔者 / 编辑 / 博主"
- 不要复述对方说了什么，直接回应观点
- 长度 30-100 字，跟评论同语言
- 不加签名、不加"祝好"等结尾

{context_block}读者评论：
{content}

直接输出回复内容（纯文本，不加引号 / 前缀 / 署名 / 任何解释）：`,
};

function templateHasContentRef(tpl: string) {
  return ['{title}', '{content}', '{excerpt}', '{excerpt_section}'].some((key) => tpl.includes(key));
}

function renderPrompt(tpl: string, vars: Record<string, string>) {
  let out = tpl;
  if (!templateHasContentRef(tpl)) {
    const tail: string[] = ['', ''];
    if ('title' in vars) tail.push('标题：{title}');
    if (vars.excerpt_section) tail.push('{excerpt_section}'.trim());
    if ('content' in vars) tail.push('内容：{content}');
    out += tail.join('\n');
  }
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

async function resolvedPrompt(optionKey: string, defaultKey: keyof typeof aiPromptDefaults) {
  const saved = (await optionValue(optionKey, '')).trim();
  return saved || aiPromptDefaults[defaultKey];
}

function excerptSection(excerpt: unknown) {
  const text = String(excerpt || '').trim();
  return text ? `摘要：${text}\n` : '';
}

function excerptBlock(excerpt: unknown) {
  const text = String(excerpt || '').trim();
  return text ? `文章主题：${text}\n` : '';
}

function usageToken(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

async function logAi(userId: number, provider: Record<string, unknown> | null, action: string, status: string, message: string, metadata: Record<string, unknown> = {}) {
  const usage = metadata.usage && typeof metadata.usage === 'object' ? metadata.usage as Record<string, unknown> : {};
  const promptTokens = usageToken(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = usageToken(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = usageToken(usage.total_tokens) || promptTokens + completionTokens;
  await exec(
    `insert into ${table('ai_logs')} (user_id, provider, model, action, prompt_tokens, completion_tokens, total_tokens, status, message, metadata, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      userId || null,
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

function agentToolDef(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
      },
    },
  };
}

const agentStringProp = (description: string) => ({ type: 'string', description });
const agentNumberProp = (description: string) => ({ type: 'integer', description });
const agentToolDefs = [
  agentToolDef('query_database', '对数据库执行只读 SELECT 查询，获取任意数据（文章、评论、用户、选项等）', {
    sql: agentStringProp('完整的 SELECT SQL 语句'),
  }, ['sql']),
  agentToolDef('get_site_stats', '获取站点核心统计（文章数、评论数、浏览量、待审核等）'),
  agentToolDef('list_pending_comments', '获取待审核评论列表', {
    limit: agentNumberProp('返回数量，默认10，最大50'),
  }),
  agentToolDef('approve_comment', '批准/通过一条评论', {
    comment_id: agentNumberProp('评论ID'),
  }, ['comment_id']),
  agentToolDef('reject_comment', '拒绝评论并移至回收站', {
    comment_id: agentNumberProp('评论ID'),
  }, ['comment_id']),
  agentToolDef('add_link', '添加友情链接', {
    name: agentStringProp('站点名称'),
    url: agentStringProp('站点URL'),
    description: agentStringProp('简介（可选）'),
    logo: agentStringProp('Logo图片URL（可选）'),
    group_name: agentStringProp('分组名，默认 default'),
  }, ['name', 'url']),
  agentToolDef('list_links', '获取全部友情链接列表'),
  agentToolDef('update_link', '更新友情链接信息', {
    id: agentNumberProp('链接ID'),
    name: agentStringProp('新名称（可选）'),
    url: agentStringProp('新URL（可选）'),
    description: agentStringProp('新简介（可选）'),
    logo: agentStringProp('新Logo（可选）'),
    group_name: agentStringProp('新分组（可选）'),
  }, ['id']),
  agentToolDef('delete_link', '删除友情链接', {
    id: agentNumberProp('链接ID'),
  }, ['id']),
  agentToolDef('list_posts', '获取文章列表', {
    status: agentStringProp('状态筛选：publish/draft/trash/all，默认all'),
    limit: agentNumberProp('返回数量，默认20'),
  }),
  agentToolDef('update_post_status', '修改文章状态（发布、下线、移入回收站）', {
    post_id: agentNumberProp('文章ID'),
    status: agentStringProp('新状态：publish/draft/trash'),
  }, ['post_id', 'status']),
  agentToolDef('get_options', '读取站点配置项（含存储、邮件、Telegram、AI等所有配置）', {
    keys: {
      type: 'array',
      items: { type: 'string' },
      description: '要读取的 key 列表，不传则返回所有配置',
    },
  }),
  agentToolDef('update_options', '更新站点配置（S3/R2存储、邮件、Telegram、外观、SEO等所有配置均可）', {
    options: {
      type: 'object',
      description: 'key-value 配置项对象',
      additionalProperties: { type: 'string' },
    },
  }, ['options']),
  agentToolDef('create_backup', '创建站点完整数据备份（数据库SQL导出+上传文件打包）'),
  agentToolDef('list_backups', '列出所有可用备份文件'),
];

function agentToInt(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function agentText(value: unknown) {
  return String(value ?? '').trim();
}

function agentToolLabel(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'query_database': {
      const sql = agentText(args.sql);
      return `查询数据库：${sql.length > 60 ? `${sql.slice(0, 60)}...` : sql}`;
    }
    case 'get_site_stats': return '获取站点统计';
    case 'list_pending_comments': return '获取待审核评论';
    case 'approve_comment': return `通过评论 #${args.comment_id}`;
    case 'reject_comment': return `拒绝评论 #${args.comment_id}`;
    case 'add_link': return `添加友链：${args.name || ''}`;
    case 'list_links': return '获取友情链接列表';
    case 'update_link': return `更新友链 #${args.id}`;
    case 'delete_link': return `删除友链 #${args.id}`;
    case 'list_posts': return '获取文章列表';
    case 'update_post_status': return `修改文章 #${args.post_id} -> ${args.status}`;
    case 'get_options': return '读取站点配置';
    case 'update_options': {
      const opts = args.options && typeof args.options === 'object' ? Object.keys(args.options as Record<string, unknown>) : [];
      return `更新配置：${opts.join(', ') || 'options'}`;
    }
    case 'create_backup': return '创建数据备份';
    case 'list_backups': return '获取备份列表';
    default: return name;
  }
}

function safeReadonlySql(input: unknown, rowLimit = 100) {
  const sql = String(input || '').trim().replace(/;+$/g, '');
  if (!sql) return { error: '错误：sql 不能为空' };
  if (sql.includes(';')) return { error: '错误：仅允许单条 SELECT 查询' };

  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  if (!/^select\b/i.test(normalized)) return { error: '错误：仅允许 SELECT 查询' };

  const blocked = [
    'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'EXEC', 'GRANT', 'REVOKE', 'CREATE',
    'COPY', 'CALL', 'DO', 'MERGE', 'VACUUM', 'ANALYZE', 'SET', 'RESET', 'NOTIFY', 'LISTEN', 'UNLISTEN', 'LOCK',
  ];
  for (const kw of blocked) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(normalized)) return { error: `错误：不允许包含操作 ${kw}` };
  }

  const limit = Math.min(500, Math.max(1, Math.trunc(Number(rowLimit) || 100)));
  return { sql, limitedSql: `select * from (${sql}) as utterlog_ai_query limit ${limit}` };
}

async function executeAgentTool(name: string, args: Record<string, unknown>) {
  try {
    switch (name) {
      case 'query_database': {
        const safe = safeReadonlySql(args.sql);
        if (safe.error) return safe.error;
        const rows = await many<Record<string, unknown>>(safe.limitedSql || '').catch((err) => {
          throw new Error(err instanceof Error ? err.message : '查询失败');
        });
        return rows.length ? JSON.stringify(rows) : '查询结果为空';
      }
      case 'get_site_stats': {
        const [posts, comments, pending, views, title] = await Promise.all([
          one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type = 'post' and status = 'publish'`),
          one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'approved'`),
          one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'pending'`),
          one<{ total: string }>(`select coalesce(sum(view_count), 0)::text as total from ${table('posts')}`),
          optionValue('site_title', 'Utterlog'),
        ]);
        return `已发布文章：${posts?.count || 0}篇\n待审核评论：${pending?.count || 0}条\n已通过评论：${comments?.count || 0}条\n总浏览量：${views?.total || 0}次\n站点名称：${title}`;
      }
      case 'list_pending_comments': {
        const limit = Math.min(50, Math.max(1, agentToInt(args.limit) || 10));
        const rows = await many<Record<string, unknown>>(
          `select id, author_name as author, coalesce(author_email,'') as email, coalesce(author_url,'') as url,
                  content, coalesce(author_ip,'') as ip, post_id
             from ${table('comments')}
            where status = 'pending'
            order by created_at desc, id desc
            limit $1`,
          [limit],
        );
        return rows.length ? JSON.stringify(rows) : '暂无待审核评论';
      }
      case 'approve_comment': {
        const id = agentToInt(args.comment_id);
        if (!id) return '错误：comment_id 无效';
        const old = await one<{ status: string; post_id: number }>(`select status, post_id from ${table('comments')} where id = $1`, [id]);
        if (!old) return `错误：评论 #${id} 不存在`;
        await exec(`update ${table('comments')} set status = 'approved' where id = $1`, [id]);
        if (['pending', 'spam'].includes(old.status) && old.post_id) {
          await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [old.post_id]).catch(() => {});
        }
        return `评论 #${id} 已批准`;
      }
      case 'reject_comment': {
        const id = agentToInt(args.comment_id);
        if (!id) return '错误：comment_id 无效';
        await exec(`update ${table('comments')} set status = 'trash' where id = $1`, [id]);
        return `评论 #${id} 已移至回收站`;
      }
      case 'add_link': {
        const nameValue = agentText(args.name);
        const url = agentText(args.url);
        if (!nameValue || !url) return '错误：name 和 url 为必填';
        const now = nowUnix();
        const row = await one<{ id: number }>(
          `insert into ${table('links')} (name, url, description, logo, group_name, order_num, status, created_at, updated_at)
           values ($1,$2,$3,$4,$5,0,1,$6,$6) returning id`,
          [nameValue, url, agentText(args.description), agentText(args.logo), agentText(args.group_name) || 'default', now],
        );
        return `友链「${nameValue}」已添加，ID: ${row?.id || 0}`;
      }
      case 'list_links': {
        const rows = await many<Record<string, unknown>>(
          `select id, name, url, coalesce(description,'') as description, group_name as "group", coalesce(logo,'') as logo
             from ${table('links')}
            order by group_name, order_num, id`,
        );
        return rows.length ? JSON.stringify(rows) : '暂无友情链接';
      }
      case 'update_link': {
        const id = agentToInt(args.id);
        if (!id) return '错误：id 无效';
        const sets = ['updated_at=$1'];
        const values: unknown[] = [nowUnix()];
        let idx = 2;
        for (const field of ['name', 'url', 'description', 'logo', 'group_name']) {
          const value = agentText(args[field]);
          if (value) {
            sets.push(`${field}=$${idx++}`);
            values.push(value);
          }
        }
        values.push(id);
        await exec(`update ${table('links')} set ${sets.join(', ')} where id = $${idx}`, values);
        return `友链 #${id} 已更新`;
      }
      case 'delete_link': {
        const id = agentToInt(args.id);
        if (!id) return '错误：id 无效';
        await exec(`delete from ${table('links')} where id = $1`, [id]);
        return `友链 #${id} 已删除`;
      }
      case 'list_posts': {
        const status = agentText(args.status);
        const limit = Math.min(100, Math.max(1, agentToInt(args.limit) || 20));
        const params: unknown[] = [];
        let where = `where type = 'post'`;
        if (status && status !== 'all') {
          if (!['publish', 'draft', 'trash'].includes(status)) return '错误：status 只能是 publish/draft/trash/all';
          params.push(status);
          where += ` and status = $${params.length}`;
        }
        params.push(limit);
        const rows = await many<Record<string, unknown>>(
          `select id, title, slug, status, view_count as views, comment_count as comments
             from ${table('posts')} ${where}
            order by created_at desc, id desc
            limit $${params.length}`,
          params,
        );
        return rows.length ? JSON.stringify(rows) : '暂无文章';
      }
      case 'update_post_status': {
        const id = agentToInt(args.post_id);
        const status = agentText(args.status);
        if (!id) return '错误：post_id 无效';
        if (!['publish', 'draft', 'trash'].includes(status)) return '错误：status 只能是 publish/draft/trash';
        await exec(`update ${table('posts')} set status = $1, updated_at = $2 where id = $3 and type = 'post'`, [status, nowUnix(), id]);
        return `文章 #${id} 状态已更新为 ${status}`;
      }
      case 'get_options': {
        const keys = Array.isArray(args.keys) ? args.keys.map((key) => agentText(key)).filter(Boolean) : [];
        if (keys.length) {
          const out: Record<string, string> = {};
          for (const key of keys) out[key] = await optionValue(key, '');
          return JSON.stringify(out);
        }
        const rows = await many<{ name: string; value: string }>(`select name, value from ${table('options')} order by name`);
        return JSON.stringify(Object.fromEntries(rows.map((row) => [row.name, row.value])));
      }
      case 'update_options': {
        const raw = args.options;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '错误：options 必须为对象';
        const keys: string[] = [];
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          await saveOption(key, String(value ?? ''));
          keys.push(key);
        }
        return `已更新配置项：${keys.join(', ')}`;
      }
      case 'create_backup': {
        const backup = await createConfiguredBackup();
        const destination = backup.destination === 'local' ? '本地' : backup.destination.toUpperCase();
        return `备份已创建：${backup.filename} (${formatBytes(backup.size)})，目标：${destination}`;
      }
      case 'list_backups': {
        mkdirSync(backupDir, { recursive: true });
        const rows = readdirSync(backupDir)
          .filter((nameValue) => nameValue.endsWith('.zip'))
          .map((nameValue) => {
            const stat = statSync(join(backupDir, nameValue));
            return `${nameValue} (${formatBytes(stat.size)})`;
          });
        return rows.length ? rows.join('\n') : '暂无备份文件';
      }
      default:
        return `未知工具：${name}`;
    }
  } catch (err) {
    return `错误：${err instanceof Error ? err.message : '工具执行失败'}`;
  }
}

async function buildAdminSystemPrompt() {
  let base = await optionValue('ai_system_prompt', '');
  if (!base.trim()) {
    base = '你是 Utterlog 博客系统的专属 AI 助手，服务于博客管理员。你可以帮助管理文章、评论、主题和插件，分析站点数据，并根据博主资料提供个性化建议。回复时使用与用户相同的语言，格式清晰，内容简洁。';
  }
  const profile: string[] = [];
  const bloggerName = await optionValue('ai_blogger_name', '');
  const bloggerBio = await optionValue('ai_blogger_bio', '');
  const bloggerStyle = await optionValue('ai_blogger_style', '');
  const bloggerMemory = await optionValue('ai_blogger_memory', '');
  if (bloggerName.trim()) profile.push(`博主昵称：${bloggerName.trim()}`);
  if (bloggerBio.trim()) profile.push(`博客简介：${bloggerBio.trim()}`);
  if (bloggerStyle.trim()) profile.push(`写作风格：${bloggerStyle.trim()}`);
  if (profile.length) base += `\n\n## 博主资料\n${profile.join('\n')}`;
  if (bloggerMemory.trim()) base += `\n\n## AI 记忆\n${bloggerMemory.trim()}`;

  const permissions = parseJsonOption<Record<string, boolean>>(await optionValue('ai_data_permissions', '{}'), {});
  const ctx: string[] = [];
  if (permissions.site_basics) {
    const [title, siteUrl, posts, comments] = await Promise.all([
      optionValue('site_title', 'Utterlog'),
      optionValue('site_url', config.appUrl),
      one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type = 'post' and status = 'publish'`),
      one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status = 'approved'`),
    ]);
    ctx.push(`## 站点信息\n站点名称：${title}\nURL：${siteUrl}\n已发布文章：${posts?.count || 0} 篇\n已通过评论：${comments?.count || 0} 条`);
  }
  if (permissions.posts) {
    const rows = await many<{ title: string; slug: string; view_count: number }>(
      `select title, slug, view_count from ${table('posts')} where type = 'post' and status = 'publish' order by created_at desc, id desc limit 50`,
    ).catch(() => []);
    if (rows.length) ctx.push(`## 文章列表（最近 ${rows.length} 篇）\n${rows.map((row) => `- ${row.title} (slug: ${row.slug}, 浏览: ${row.view_count || 0})`).join('\n')}`);
  }
  if (permissions.taxonomies) {
    const rows = await many<{ name: string; count: number }>(
      `select name, count from ${table('metas')} where type = 'category' order by count desc, id asc limit 20`,
    ).catch(() => []);
    if (rows.length) ctx.push(`## 分类\n${rows.map((row) => `${row.name}(${row.count || 0})`).join('、')}`);
  }
  if (permissions.comments) {
    const rows = await many<{ author_name: string; content: string; status: string }>(
      `select author_name, content, status from ${table('comments')} order by created_at desc, id desc limit 10`,
    ).catch(() => []);
    if (rows.length) {
      ctx.push(`## 最近评论（10条）\n${rows.map((row) => {
        const preview = String(row.content || '').slice(0, 60);
        return `- [${row.status}] ${row.author_name || '访客'}: ${preview}${String(row.content || '').length > 60 ? '...' : ''}`;
      }).join('\n')}`);
    }
  }
  if (permissions.users_count) {
    const [admins, authors] = await Promise.all([
      one<{ count: string }>(`select count(*)::text as count from ${table('users')} where role = 'admin'`),
      one<{ count: string }>(`select count(*)::text as count from ${table('users')} where role = 'author'`),
    ]);
    ctx.push(`## 用户\n管理员：${admins?.count || 0} 人，作者：${authors?.count || 0} 人`);
  }
  if (permissions.theme_info) {
    ctx.push(`## 主题\n当前主题：${await optionValue('active_theme', 'Utterlog')}`);
  }
  if (ctx.length) base += `\n\n---\n以下是当前站点数据，你可以根据这些信息回答问题：\n\n${ctx.join('\n\n')}`;
  if (permissions.database_query) {
    base += '\n\n你可以在需要时调用 query_database 工具执行只读 SELECT 查询获取更多数据。';
  }
  return base;
}

type AgentMessage = Record<string, unknown> & { role: string; content?: unknown };

async function callAiTextWithTools(messages: AgentMessage[], userId: number, onEvent: (event: Record<string, unknown>) => void) {
  const provider = await activeAiProvider('text', 'chat');
  if (!provider) throw new Error('未配置启用的文本 AI 提供商');
  const endpoint = String(provider.endpoint || '');
  if (endpoint.includes('api.anthropic.com')) {
    const fallback = await callAiText(messages.filter((m) => typeof m.content === 'string').map((m) => ({ role: m.role, content: String(m.content || '') })), 'chat', userId);
    return fallback.content;
  }
  const model = String(provider.model || '');
  const apiKey = String(provider.api_key || '');
  const timeout = Math.max(5, Number(provider.timeout || 30) + 30) * 1000;
  const temperature = Number(provider.temperature ?? 0.7);
  const maxTokens = Number(provider.max_tokens || 4096);
  let hadToolCalls = false;

  for (let iter = 0; iter < 6; iter++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        tools: agentToolDefs,
        tool_choice: 'auto',
      }),
      signal: AbortSignal.timeout(timeout),
    });
    const payload: any = await res.json().catch(() => ({}));
    if (!res.ok || payload.error) {
      if (!hadToolCalls && iter === 0) {
        const fallback = await callAiText(messages.filter((m) => typeof m.content === 'string').map((m) => ({ role: m.role, content: String(m.content || '') })), 'chat', userId);
        return fallback.content;
      }
      const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
      await logAi(userId, provider, 'chat', 'error', String(message), { status: res.status, tool_calling: true });
      throw new Error(String(message));
    }
    const choice = payload.choices?.[0];
    const msg = choice?.message || {};
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (toolCalls.length) {
      hadToolCalls = true;
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });
      for (const call of toolCalls) {
        const name = String(call.function?.name || '');
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(call.function?.arguments || '{}'));
        } catch {
          args = {};
        }
        onEvent({ type: 'tool_call', tool: name, label: agentToolLabel(name, args) });
        const result = await executeAgentTool(name, args);
        const success = !result.startsWith('错误');
        onEvent({ type: 'tool_result', tool: name, result, success });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      continue;
    }
    const content = String(msg.content || payload.choices?.[0]?.text || '').trim();
    await logAi(userId, provider, 'chat', 'success', content, { usage: payload.usage || {}, tool_calling: hadToolCalls });
    return content;
  }
  return '工具调用轮次过多，已停止。';
}

async function callAiText(messages: { role: string; content: string }[], action: string, userId = 0) {
  const providers = await activeAiProviders('text', aiPurposeForAction(action));
  if (!providers.length) throw new Error('未配置启用的文本 AI 提供商');
  const errors: string[] = [];

  for (const provider of providers) {
    const endpoint = String(provider.endpoint || '');
    const model = String(provider.model || '');
    const apiKey = String(provider.api_key || '');
    const timeout = Math.max(5, Number(provider.timeout || 30)) * 1000;
    const temperature = Number(provider.temperature ?? 0.7);
    const maxTokens = Number(provider.max_tokens || 4096);

    let body: Record<string, unknown>;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (endpoint.includes('api.anthropic.com')) {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      const system = messages.find((m) => m.role === 'system')?.content || '';
      body = { model, system, messages: messages.filter((m) => m.role !== 'system'), max_tokens: maxTokens, temperature };
    } else {
      headers.authorization = `Bearer ${apiKey}`;
      body = { model, messages, max_tokens: maxTokens, temperature };
    }

    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) {
        const message = payload.error?.message || payload.error || `HTTP ${res.status}`;
        await logAi(userId, provider, action, 'error', String(message), { status: res.status });
        errors.push(`[${provider.name || provider.slug || model}] ${message}`);
        continue;
      }
      const content = endpoint.includes('api.anthropic.com')
        ? (payload.content || []).map((part: any) => part.text || '').join('\n').trim()
        : String(payload.choices?.[0]?.message?.content || payload.choices?.[0]?.text || '').trim();
      if (!content) {
        const message = 'AI 返回内容为空';
        await logAi(userId, provider, action, 'error', message, { status: res.status });
        errors.push(`[${provider.name || provider.slug || model}] ${message}`);
        continue;
      }
      await logAi(userId, provider, action, 'success', content, { usage: payload.usage || {} });
      return { content, provider, usage: payload.usage || {} };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 请求失败';
      await logAi(userId, provider, action, 'error', message);
      errors.push(`[${provider.name || provider.slug || model}] ${message}`);
    }
  }

  throw new Error(errors.join(' · ') || 'AI 服务不可用');
}

function pixelSizeForRatio(ratio: string) {
  switch (ratio) {
    case '16:9': return '1536x1024';
    case '9:16': return '1024x1536';
    case '1:1': return '1024x1024';
    case '4:3':
    case '3:2':
      return '1536x1024';
    default:
      return '1024x1024';
  }
}

function detectImageFlavor(endpoint: string) {
  const e = endpoint.toLowerCase();
  if (e.includes('googleapis.com') && (e.includes(':predict') || e.includes('imagen'))) return 'imagen';
  if (e.includes('/services/aigc/multimodal-generation/generation')) return 'qwen-multimodal';
  if (e.includes('/services/aigc/text2image')) return 'dashscope';
  return 'openai';
}

function extFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('avif')) return 'avif';
  if (m.includes('gif')) return 'gif';
  return 'png';
}

function detectImageMime(bytes: Buffer, fallback = 'image/png') {
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && bytes.subarray(4, 12).toString() === 'ftypavif') return 'image/avif';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) return 'image/gif';
  return fallback.split(';')[0] || 'image/png';
}

async function reencodeAiImage(bytes: Buffer, mimeType: string) {
  const requested = (await optionValue('ai_image_format', 'webp')).toLowerCase().trim();
  const target = requested === 'jpeg' ? 'jpg' : requested;
  if (!['webp', 'jpg', 'png'].includes(target)) return { bytes, mimeType };
  if (extFromMime(mimeType) === target) return { bytes, mimeType };

  const qualityRaw = Number.parseInt(await optionValue('ai_image_quality', '82'), 10);
  const quality = Number.isFinite(qualityRaw) && qualityRaw >= 1 && qualityRaw <= 100 ? qualityRaw : 82;
  const sharpModule = await (new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>)('sharp').catch(() => null);
  const sharp = (sharpModule as any)?.default || sharpModule;
  if (!sharp) return { bytes, mimeType };

  let pipeline = sharp(bytes, { animated: false }).rotate();
  let nextMime = 'image/webp';
  switch (target) {
    case 'jpg':
      pipeline = pipeline.jpeg({ quality });
      nextMime = 'image/jpeg';
      break;
    case 'png':
      pipeline = pipeline.png();
      nextMime = 'image/png';
      break;
    default:
      pipeline = pipeline.webp({ quality });
      nextMime = 'image/webp';
      break;
  }

  const output = await pipeline.toBuffer().catch(() => null);
  if (!output || output.length === 0 || output.length > Math.floor(bytes.length * 1.05)) {
    return { bytes, mimeType };
  }
  return { bytes: output, mimeType: nextMime };
}

async function fetchImageBytes(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`下载图片失败: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error('下载图片为空');
  return { bytes, mimeType: detectImageMime(bytes, res.headers.get('content-type') || 'image/png') };
}

async function generateOpenAiCompatImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const model = String(provider.model || '');
  const body: Record<string, unknown> = { model, prompt, n: 1, size };
  if (model.toLowerCase().startsWith('dall-e')) body.response_format = 'b64_json';
  const res = await fetch(String(provider.endpoint || ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.api_key || ''}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(60, Number(provider.timeout || 60)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(String(payload.error?.message || payload.error || `HTTP ${res.status}`));
  const first = payload.data?.[0] || {};
  if (first.b64_json) {
    const bytes = Buffer.from(String(first.b64_json), 'base64');
    return { bytes, mimeType: detectImageMime(bytes) };
  }
  if (first.url) return fetchImageBytes(String(first.url));
  throw new Error('响应既没有 b64_json 也没有 url 字段');
}

async function generateImagenImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const aspect = size === '1536x1024' ? '16:9' : size === '1024x1536' ? '9:16' : '1:1';
  const endpoint = String(provider.endpoint || '');
  const url = endpoint.includes('key=') ? endpoint : `${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${encodeURIComponent(String(provider.api_key || ''))}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: aspect },
    }),
    signal: AbortSignal.timeout(Math.max(120, Number(provider.timeout || 120)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(String(payload.error?.message || payload.error || `HTTP ${res.status}`));
  const first = payload.predictions?.[0] || {};
  const b64 = first.bytesBase64Encoded || first.bytes_base64_encoded || '';
  if (!b64) throw new Error('Imagen 响应中没有图片数据');
  return { bytes: Buffer.from(String(b64), 'base64'), mimeType: first.mimeType || 'image/png' };
}

async function generateQwenMultimodalImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const res = await fetch(String(provider.endpoint || ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.api_key || ''}` },
    body: JSON.stringify({
      model: provider.model || '',
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { size: size.replace('x', '*'), n: 1 },
    }),
    signal: AbortSignal.timeout(Math.max(120, Number(provider.timeout || 120)) * 1000),
  });
  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok || payload.error || payload.code) throw new Error(String(payload.error?.message || payload.message || `HTTP ${res.status}`));
  const content = payload.output?.choices?.[0]?.message?.content || [];
  const imageUrl = content.find((item: any) => item?.image)?.image;
  if (!imageUrl) throw new Error('Qwen 响应中没有 image URL');
  return fetchImageBytes(String(imageUrl));
}

async function generateDashScopeImage(provider: Record<string, unknown>, prompt: string, size: string) {
  const submit = await fetch(String(provider.endpoint || ''), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.api_key || ''}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: provider.model || '',
      input: { prompt },
      parameters: { size: size.replace('x', '*'), n: 1 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const started: any = await submit.json().catch(() => ({}));
  if (!submit.ok || started.error || started.code) throw new Error(String(started.error?.message || started.message || `HTTP ${submit.status}`));
  const taskId = started.output?.task_id;
  if (!taskId) throw new Error('DashScope 未返回 task_id');
  const taskUrl = String(provider.endpoint || '').replace(/\/services\/aigc\/text2image\/image-synthesis.*$/, `/tasks/${taskId}`);
  const deadline = Date.now() + Math.max(120, Number(provider.timeout || 120)) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await fetch(taskUrl, { headers: { authorization: `Bearer ${provider.api_key || ''}` }, signal: AbortSignal.timeout(15000) });
    const payload: any = await poll.json().catch(() => ({}));
    const status = payload.output?.task_status || payload.task_status;
    if (status === 'SUCCEEDED') {
      const imageUrl = payload.output?.results?.[0]?.url || payload.results?.[0]?.url;
      if (!imageUrl) throw new Error('DashScope 任务成功但没有图片 URL');
      return fetchImageBytes(String(imageUrl));
    }
    if (status === 'FAILED' || status === 'CANCELED') throw new Error(payload.output?.message || payload.message || `DashScope ${status}`);
  }
  throw new Error('DashScope 图片生成超时');
}

async function persistAiImage(bytes: Buffer, mimeType: string, provider: Record<string, unknown>) {
  const encoded = await reencodeAiImage(bytes, mimeType);
  const ext = extFromMime(encoded.mimeType);
  const stored = await storeUploadedBytes(encoded.bytes, ext, encoded.mimeType, 'ai');
  const ts = nowUnix();
  const row = await one<{ id: number }>(
    `insert into ${table('media')} (name, filename, url, mime_type, size, driver, category, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'image',$7,$7) returning id`,
    [`ai-generated-${ts}.${ext}`, stored.relativePath, stored.url, encoded.mimeType, encoded.bytes.length, stored.driver, ts],
  ).catch(() => null);
  return { url: stored.url, media_id: row?.id || 0, provider: provider.name || provider.slug || '', model: provider.model || '', size: encoded.bytes.length, mime: encoded.mimeType, driver: stored.driver };
}

async function callAiImage(prompt: string, userId: number, requestedSize = '') {
  const provider = await activeAiProvider('image');
  if (!provider) throw new Error('未配置启用的图片 AI 提供商');
  const endpoint = String(provider.endpoint || '');
  const size = /^[1-9]\d{2,4}x[1-9]\d{2,4}$/.test(requestedSize)
    ? requestedSize
    : pixelSizeForRatio(await optionValue('ai_image_ratio', '16:9'));
  try {
    const flavor = detectImageFlavor(endpoint);
    const generated = flavor === 'imagen'
      ? await generateImagenImage(provider, prompt, size)
      : flavor === 'qwen-multimodal'
        ? await generateQwenMultimodalImage(provider, prompt, size)
        : flavor === 'dashscope'
          ? await generateDashScopeImage(provider, prompt, size)
          : await generateOpenAiCompatImage(provider, prompt, size);
    const saved = await persistAiImage(generated.bytes, generated.mimeType || 'image/png', provider);
    await logAi(userId, provider, 'image', 'success', saved.url, { flavor, size });
    return saved;
  } catch (err) {
    const message = err instanceof Error ? err.message : '图片生成失败';
    await logAi(userId, provider, 'image', 'error', String(message));
    throw new Error(String(message));
  }
}

type AiBatchType = 'questions' | 'summary' | 'all';

type AiBatchStatus = {
  type: AiBatchType;
  total: number;
  done: number;
  failed: number;
  running: boolean;
  started_at: number;
  finished_at?: number;
  last_error?: string;
};

function aiBatchStatusKey(type: AiBatchType) {
  return `ai:batch:${type}:status`;
}

function aiBatchCancelKey(type: AiBatchType) {
  return `ai:batch:${type}:cancel`;
}

async function getAiBatchStatus(type: AiBatchType) {
  const raw = await ephemeral.get(aiBatchStatusKey(type));
  if (!raw) return { type, total: 0, done: 0, failed: 0, running: false, started_at: 0 };
  return parseJsonOption<AiBatchStatus>(raw, { type, total: 0, done: 0, failed: 0, running: false, started_at: 0 });
}

async function setAiBatchStatus(status: AiBatchStatus) {
  await ephemeral.set(aiBatchStatusKey(status.type), JSON.stringify(status), 24 * 3600);
}

async function aiBatchCandidates(type: AiBatchType) {
  return many<{ id: number; title: string; content: string | null; excerpt: string | null; ai_summary: string | null; ai_questions: string | null }>(
    `select id, title, content, excerpt, ai_summary, ai_questions from ${table('posts')}
     where deleted_at = 0 and type = 'post' and status = 'publish'
       and (
         $1 = 'all' and ((ai_summary is null or ai_summary = '') or (ai_questions is null or ai_questions = ''))
         or $1 = 'summary' and (ai_summary is null or ai_summary = '')
         or $1 = 'questions' and (ai_questions is null or ai_questions = '')
       )
     order by id desc`,
    [type],
  ).catch(() => []);
}

async function runAiBatchTask(type: AiBatchType, userId: number, posts: Awaited<ReturnType<typeof aiBatchCandidates>>, status: AiBatchStatus) {
  for (const post of posts) {
    if (await ephemeral.get(aiBatchCancelKey(type))) break;
    const content = String(post.content || '').slice(0, 12000);
    const excerpt = String(post.excerpt || '');
    const updates: { ai_summary?: string; ai_questions?: string } = {};
    try {
      if ((type === 'summary' || type === 'all') && !String(post.ai_summary || '').trim()) {
        const prompt = renderPrompt(await resolvedPrompt('ai_summary_prompt', 'summary'), {
          title: post.title,
          content,
          excerpt,
          excerpt_section: excerptSection(excerpt),
          min_len: await optionValue('ai_summary_min_len', '80'),
          max_len: await optionValue('ai_summary_max_length', '200'),
        });
        updates.ai_summary = (await callAiText([{ role: 'user', content: prompt }], 'batch-summary', userId)).content;
      }
      if ((type === 'questions' || type === 'all') && !String(post.ai_questions || '').trim()) {
        const prompt = renderPrompt(await resolvedPrompt('ai_questions_prompt', 'questions'), {
          title: post.title,
          content,
          excerpt,
          excerpt_section: excerptSection(excerpt),
        });
        updates.ai_questions = (await callAiText([{ role: 'user', content: prompt }], 'batch-questions', userId)).content;
      }
      if (updates.ai_summary || updates.ai_questions) {
        await exec(
          `update ${table('posts')} set ai_summary = coalesce($1, ai_summary), ai_questions = coalesce($2, ai_questions), updated_at = $3 where id = $4`,
          [updates.ai_summary || null, updates.ai_questions || null, nowUnix(), post.id],
        );
      }
      const completed = (updates.ai_summary ? 1 : 0) + (updates.ai_questions ? 1 : 0);
      status.done += Math.max(1, completed);
    } catch (err) {
      status.failed += 1;
      status.last_error = `post #${post.id}: ${err instanceof Error ? err.message : 'AI returned empty'}`;
    }
    await setAiBatchStatus(status);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  status.running = false;
  status.finished_at = nowUnix();
  await ephemeral.del(aiBatchCancelKey(type));
  await setAiBatchStatus(status);
}

async function startAiBatch(type: AiBatchType, userId: number) {
  const existing = await getAiBatchStatus(type);
  if (existing.running) return existing;
  if (!await activeAiProvider('text', 'content')) throw new Error('尚未配置 AI 服务商，请先在 AI 设置里添加并启用一个文本模型');
  await ephemeral.del(aiBatchCancelKey(type));
  const posts = await aiBatchCandidates(type);
  const total = type === 'all'
    ? posts.reduce((sum, post) => sum + (!String(post.ai_summary || '').trim() ? 1 : 0) + (!String(post.ai_questions || '').trim() ? 1 : 0), 0)
    : posts.length;
  const status: AiBatchStatus = { type, total, done: 0, failed: 0, running: total > 0, started_at: nowUnix() };
  if (total === 0) {
    status.finished_at = nowUnix();
    await setAiBatchStatus(status);
    return status;
  }
  await setAiBatchStatus(status);
  void runAiBatchTask(type, userId, posts, status);
  return status;
}

async function stopAiBatch(type: AiBatchType) {
  const status = await getAiBatchStatus(type);
  if (!status.running) return { stopped: false, note: '无正在运行的任务' };
  await ephemeral.set(aiBatchCancelKey(type), '1', 24 * 3600);
  return { stopped: true, type };
}

async function deleteAiBatchData(fields: unknown) {
  const values = Array.isArray(fields) ? fields.map((field) => String(field).toLowerCase().trim()) : [];
  const wipeSummary = values.length === 0 || values.includes('summary') || values.includes('ai_summary');
  const wipeQuestions = values.length === 0 || values.includes('questions') || values.includes('ai_questions');
  const setParts: string[] = [];
  if (wipeSummary) setParts.push('ai_summary = null');
  if (wipeQuestions) setParts.push('ai_questions = null');
  if (!setParts.length) throw new Error('fields 必须包含 summary 或 questions');
  const updated = await execChanged(
    `update ${table('posts')} set ${setParts.join(', ')}, updated_at = $1 where deleted_at = 0 and type = 'post' and status = 'publish'`,
    [nowUnix()],
  );
  return { updated, wiped_summary: wipeSummary, wiped_questions: wipeQuestions };
}

async function publishAiCommentReply(queueId: number, reply: string, reviewerId: number) {
  const row = await one<{ comment_id: number; post_id: number; ai_reply: string; status: string }>(
    `select comment_id, post_id, ai_reply, status from ${table('ai_comment_queue')} where id = $1`,
    [queueId],
  );
  if (!row) throw new Error('队列条目不存在');
  if (!['pending', 'error'].includes(row.status)) throw new Error('该队列条目已处理');
  const user = await one<{ username: string; nickname: string | null; email: string | null }>(`select username, nickname, email from ${table('users')} where id = $1`, [reviewerId]).catch(() => null);
  const now = nowUnix();
  const badge = (await optionValue('ai_comment_reply_badge_text', '🤖 AI 辅助回复')).trim();
  const finalReply = `${reply || row.ai_reply}${badge ? `\n\n${badge}` : ''}`;
  if (!finalReply.trim()) throw new Error('回复内容不能为空');
  await exec(
    `insert into ${table('comments')} (post_id, author_name, author_email, content, parent_id, user_id, status, source, created_at, updated_at, is_ai_reply)
     values ($1,$2,$3,$4,$5,$6,'approved','local',$7,$7,true)`,
    [row.post_id, user?.nickname || user?.username || '博主', user?.email || '', finalReply, row.comment_id, reviewerId, now],
  );
  await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [row.post_id]).catch(() => {});
  await exec(
    `update ${table('ai_comment_queue')} set status = 'approved', processed_at = $1, reviewer_id = $2 where id = $3`,
    [now, reviewerId, queueId],
  );
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

  app.get('/api/v1/footprints', (c) => listFootprints(c, false));
  app.get('/api/v1/admin/footprints', auth, (c) => listFootprints(c, true));
  app.put('/api/v1/admin/footprints/:id', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    const body = await c.req.json().catch(() => ({}));
    await updatePostFootprint(id, body);
    return ok(c, null);
  });
  app.get('/api/v1/admin/footprints/places', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const search = String(sp.get('search') || '').trim();
    const params: unknown[] = [100];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = `where country_name ilike $2 or country_code ilike $2 or city_name ilike $2`;
    }
    const rows = await many<Record<string, unknown>>(
      `select id, country_name, country_code, city_name, latitude, longitude, coalesce(cover_url,'') as cover_url,
              coalesce(visit_count,0) as visit_count, created_at, updated_at
       from ${table('footprint_places')} ${where}
       order by visit_count desc, updated_at desc, id desc limit $1`,
      params,
    ).catch(() => []);
    return ok(c, rows);
  });
  app.post('/api/v1/admin/footprints/geocode', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    let query = String(body.query || '').trim();
    if (!query) query = `${String(body.country || '').trim()} ${String(body.city || '').trim()}`.trim();
    if (!query) return badRequest(c, '请输入国家或城市');
    try {
      const payload = await fetchJson<any>(`https://v.wpista.com/marker/geocode?address=${encodeURIComponent(query)}`);
      if (payload.status !== 'success' || payload.code !== 200) {
        return c.json({ success: false, error: { code: 'GEOCODE_FAILED', message: '地理编码服务没有返回有效结果' } }, 502);
      }
      const message = payload.message || {};
      let city = String(body.city || '').trim() || pickGeocodeCity(message.results || []);
      if (!city && !message.country_code) city = String(message.province || '');
      return ok(c, {
        query,
        address: message.adresss || message.address || '',
        country_name: message.country || '',
        country_code: String(message.country_code || '').toUpperCase(),
        city_name: city,
        latitude: message.lat,
        longitude: message.lng,
        provider: 'wpista',
      });
    } catch (err) {
      return c.json({ success: false, error: { code: 'GEOCODE_FAILED', message: err instanceof Error ? err.message : '地理编码失败' } }, 502);
    }
  });
  app.get('/api/v1/location/reverse', async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const lat = Number(sp.get('lat'));
    const lng = Number(sp.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return badRequest(c, '无效的坐标');
    }
    for (const fn of [reverseGeocodeMapbox, reverseGeocodeAmap, reverseGeocodeTencent]) {
      try {
        const result = await fn(lat, lng);
        if (String(result.location || '').trim()) return ok(c, result);
      } catch {
        // Try the next configured provider.
      }
    }
    return ok(c, {});
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
  app.get('/api/v1/coding', optionalAuth, async (c) => ok(c, await codingPayload(c)));
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

  app.get('/api/v1/security/overview', auth, async (c) => {
    const now = nowUnix();
    const h24 = now - 86400;
    const [settings, totalBans, activeBans, totalEvents, events24h] = await Promise.all([
      securitySettings(),
      one<{ count: string }>(`select count(*)::text as count from ${table('ip_bans')}`).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('ip_bans')} where expires_at = 0 or expires_at > $1`, [now]).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('security_events')}`).catch(() => null),
      one<{ count: string }>(`select count(*)::text as count from ${table('security_events')} where created_at >= $1`, [h24]).catch(() => null),
    ]);
    return ok(c, {
      total_bans: Number(totalBans?.count || 0),
      active_bans: Number(activeBans?.count || 0),
      total_events: Number(totalEvents?.count || 0),
      events_24h: Number(events24h?.count || 0),
      cc_enabled: settings.cc_enabled,
      geo_enabled: settings.geo_enabled,
    });
  });
  app.get('/api/v1/security/settings', auth, async (c) => ok(c, await securitySettings()));
  app.post('/api/v1/security/settings', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const current = await securitySettings();
    const next = {
      cc_enabled: body.cc_enabled ?? current.cc_enabled,
      cc_limit_5s: Number(body.cc_limit_5s ?? current.cc_limit_5s),
      cc_limit_60s: Number(body.cc_limit_60s ?? current.cc_limit_60s),
      geo_enabled: body.geo_enabled ?? current.geo_enabled,
      geo_mode: String(body.geo_mode ?? current.geo_mode),
      geo_countries: Array.isArray(body.geo_countries) ? body.geo_countries.map(String) : current.geo_countries,
      ip_geo_provider: normalizeGeoProvider(body.ip_geo_provider ?? current.ip_geo_provider),
    };
    await Promise.all([
      saveOption('cc_enabled', String(Boolean(next.cc_enabled))),
      saveOption('cc_limit_5s', String(next.cc_limit_5s || 30)),
      saveOption('cc_limit_60s', String(next.cc_limit_60s || 120)),
      saveOption('geo_enabled', String(Boolean(next.geo_enabled))),
      saveOption('geo_mode', next.geo_mode),
      saveOption('geo_countries', next.geo_countries.join(',')),
      saveOption('ip_geo_provider', next.ip_geo_provider),
    ]);
    return ok(c, { saved: true });
  });
  app.get('/api/v1/security/bans', auth, async (c) => {
    await exec(`delete from ${table('ip_bans')} where expires_at > 0 and expires_at < $1`, [nowUnix()]).catch(() => {});
    const rows = await many<Record<string, unknown>>(`select * from ${table('ip_bans')} order by created_at desc`);
    return ok(c, rows);
  });
  app.post('/api/v1/security/ban', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const ip = String(body.ip || '').trim();
    if (!ip) return badRequest(c, 'IP 不能为空');
    const duration = Number(body.duration || 0);
    const now = nowUnix();
    const expiresAt = duration > 0 ? now + duration * 60 : 0;
    await exec(
      `insert into ${table('ip_bans')} (ip, reason, ban_type, duration, expires_at, created_at)
       values ($1,$2,'manual',$3,$4,$5)
       on conflict (ip) do update set reason = $2, duration = $3, expires_at = $4`,
      [ip, String(body.reason || ''), duration, expiresAt, now],
    );
    await logSecurityEvent(ip, 'manual_ban', String(body.reason || ''));
    return ok(c, { banned: true });
  });
  app.post('/api/v1/security/unban', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const ip = String(body.ip || '').trim();
    if (!ip) return badRequest(c, 'IP 不能为空');
    await exec(`delete from ${table('ip_bans')} where ip = $1`, [ip]);
    await logSecurityEvent(ip, 'manual_unban', '');
    return ok(c, { unbanned: true });
  });
  app.get('/api/v1/security/timeline', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const ip = String(sp.get('ip') || '').trim();
    const wantsPaginated = sp.has('page') || sp.has('ip') || sp.has('per_page') || sp.has('limit');
    if (!wantsPaginated) {
      const rows = await many<Record<string, unknown>>(`select * from ${table('security_events')} order by created_at desc, id desc limit 200`).catch(() => []);
      return ok(c, rows);
    }

    const page = Math.max(1, intParam(sp.get('page') || undefined, 1));
    const perPageRaw = intParam(sp.get('per_page') || sp.get('limit') || undefined, 50);
    const perPage = Math.min(500, Math.max(1, perPageRaw));
    const offset = (page - 1) * perPage;
    const where = ip ? 'where ip = $1' : '';
    const params: unknown[] = ip ? [ip] : [];
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('security_events')} ${where}`, params).catch(() => null);
    const rows = await many<Record<string, unknown>>(
      `select * from ${table('security_events')} ${where} order by created_at desc, id desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, perPage, offset],
    ).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });

  app.get('/api/v1/backup/stats', auth, async (c) => {
    mkdirSync(backupDir, { recursive: true });
    const dbSize = await one<{ size: string }>(`select pg_size_pretty(pg_database_size($1)) as size`, [config.dbName]).catch(() => null);
    const backups = readdirSync(backupDir).filter((name) => name.endsWith('.zip'));
    return ok(c, {
      db_size: dbSize?.size || '',
      uploads_size: formatBytes(dirSize(config.uploadDir)),
      uploads_bytes: dirSize(config.uploadDir),
      content_size: formatBytes(dirSize(config.contentDir)),
      content_bytes: dirSize(config.contentDir),
      backup_count: backups.length,
    });
  });
  app.get('/api/v1/backup/list', auth, (c) => {
    mkdirSync(backupDir, { recursive: true });
    const items = readdirSync(backupDir)
      .filter((name) => name.endsWith('.zip'))
      .map((name) => {
        const path = join(backupDir, name);
        const stat = statSync(path);
        return {
          filename: name,
          size: stat.size,
          created: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
          url: `${config.appUrl.replace(/\/$/, '')}/api/v1/backup/download/${encodeURIComponent(name)}`,
        };
      })
      .sort((a, b) => b.created.localeCompare(a.created));
    return ok(c, items);
  });
  app.post('/api/v1/backup/create', auth, async (c) => {
    try {
      const backup = await createConfiguredBackup();
      const keep = await backupKeepLimit();
      const deleted = cleanupOldBackups(keep);
      await saveOption('backup_last_status', `ok: ${backup.filename}, destination=${backup.destination}, deleted=${deleted}`);
      return ok(c, { ...backup, deleted_old_backups: deleted });
    } catch (err) {
      return c.json({ success: false, error: { code: 'DUMP_ERROR', message: err instanceof Error ? err.message : '数据库导出失败' } }, 500);
    }
  });
  app.post('/api/v1/backup/import', auth, async (c) => {
    mkdirSync(backupDir, { recursive: true });
    const form = await c.req.formData().catch(() => null);
    const uploaded = form?.get('file');
    if (!(uploaded instanceof File)) return badRequest(c, '请上传备份文件');
    const tmpPath = join(backupDir, `import-${Date.now()}-${basename(uploaded.name || 'backup.zip')}`);
    const extractDir = join(backupDir, `import-tmp-${Date.now()}`);
    await mkdir(dirname(tmpPath), { recursive: true });
    const uploadedBytes = Buffer.from(await uploaded.arrayBuffer());
    try {
      validateBackupZipEntries(uploadedBytes);
    } catch (err) {
      return c.json({ success: false, error: { code: 'ZIP_UNSAFE', message: err instanceof Error ? err.message : '备份文件不安全' } }, 400);
    }
    await writeFileSync(tmpPath, uploadedBytes);
    await mkdir(extractDir, { recursive: true });
    const unzip = await runCommand(['unzip', '-q', tmpPath, '-d', extractDir]);
    if (unzip.code !== 0) {
      await rm(tmpPath, { force: true }).catch(() => {});
      await rm(extractDir, { recursive: true, force: true }).catch(() => {});
      return c.json({ success: false, error: { code: 'ZIP_ERROR', message: unzip.stderr || '无效的备份文件' } }, 400);
    }
    const dbPath = join(extractDir, 'database.sql');
    await restoreExtractedFiles(extractDir);
    let dbRestored = false;
    if (existsSync(dbPath)) {
      const restore = await runCommand([
        'psql',
        '-h', config.dbHost,
        '-p', String(config.dbPort),
        '-U', config.dbUser,
        '-d', config.dbName,
        '-f', dbPath,
      ]);
      if (restore.code !== 0) {
        await rm(tmpPath, { force: true }).catch(() => {});
        await rm(extractDir, { recursive: true, force: true }).catch(() => {});
        return c.json({ success: false, error: { code: 'RESTORE_ERROR', message: restore.stderr || '数据库恢复失败' } }, 500);
      }
      dbRestored = true;
    }
    const restoredFiles = fileCount(extractDir);
    await rm(tmpPath, { force: true }).catch(() => {});
    await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    return ok(c, { restored: true, db_restored: dbRestored, files: restoredFiles });
  });
  app.get('/api/v1/backup/download/:filename', auth, (c) => {
    const path = safeBackupPath(c.req.param('filename'));
    if (!path || !existsSync(path)) return notFound(c, '备份文件');
    return new Response(Bun.file(path), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${basename(path)}"`,
      },
    });
  });
  app.delete('/api/v1/backup/:filename', auth, async (c) => {
    const path = safeBackupPath(c.req.param('filename'));
    if (!path) return badRequest(c, '无效的文件名');
    await rm(path, { force: true }).catch(() => {});
    return ok(c, null);
  });

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

  app.get('/api/v1/ai/providers', auth, async (c) => {
    const rows = await many<Record<string, unknown>>(`select * from ${table('ai_providers')} order by sort_order asc, id asc`).catch(() => []);
    return ok(c, {
      providers: rows,
      presets: aiPresets,
      purposes: aiPurposes,
      prompt_defaults: aiPromptDefaults,
    });
  });
  app.post('/api/v1/ai/providers', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const now = nowUnix();
    const id = intParam(String(body.id || ''));
    const name = String(body.name || '').trim();
    const endpoint = String(body.endpoint || '').trim();
    const model = String(body.model || '').trim();
    if (!name || !endpoint || !model) return badRequest(c, '名称、端点和模型为必填项');
    if (id > 0) {
      await exec(
        `update ${table('ai_providers')} set name=$1, slug=$2, type=$3, endpoint=$4, model=$5, api_key=$6,
         temperature=$7, max_tokens=$8, timeout=$9, is_active=$10, is_default=$11, sort_order=$12, extra=$13::jsonb, updated_at=$14
         where id=$15`,
        [
          name,
          body.slug || body.name || '',
          body.type || 'text',
          endpoint,
          model,
          body.api_key || '',
          Number(body.temperature ?? 0.7),
          Number(body.max_tokens ?? 4096),
          Number(body.timeout ?? 30),
          body.is_active ?? true,
          body.is_default ?? false,
          Number(body.sort_order ?? 0),
          JSON.stringify(body.extra || {}),
          now,
          id,
        ],
      );
      return ok(c, { id });
    }
    const rows = await many<{ id: number }>(
      `insert into ${table('ai_providers')}
       (name, slug, type, endpoint, model, api_key, temperature, max_tokens, timeout, is_active, is_default, sort_order, extra, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$14) returning id`,
      [
        name,
        body.slug || body.name || '',
        body.type || 'text',
        endpoint,
        model,
        body.api_key || '',
        Number(body.temperature ?? 0.7),
        Number(body.max_tokens ?? 4096),
        Number(body.timeout ?? 30),
        body.is_active ?? true,
        body.is_default ?? false,
        Number(body.sort_order ?? 0),
        JSON.stringify(body.extra || {}),
        now,
      ],
    );
    return ok(c, { id: rows[0]?.id || 0 });
  });
  app.delete('/api/v1/ai/providers/:id', auth, async (c) => {
    await exec(`delete from ${table('ai_providers')} where id = $1`, [c.req.param('id')]).catch(() => {});
    return ok(c, null);
  });
  app.post('/api/v1/ai/test', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const endpoint = String(body.endpoint || '').trim();
    const model = String(body.model || '').trim();
    const apiKey = String(body.api_key || '').trim();
    const providerType = ['text', 'embedding', 'image'].includes(String(body.type || ''))
      ? String(body.type)
      : 'text';
    if (!endpoint || !model || !apiKey) return badRequest(c, '端点、模型和 API Key 为必填项');
    if (providerType === 'image') {
      await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-image', 'success', 'image provider config checked');
      return ok(c, { ok: true, content: '图片提供商已完成本地配置校验；为避免触发生成计费，测试连接不会请求图片生成端点。', model });
    }
    try {
      const payload = providerType === 'embedding'
        ? {
            model,
            input: 'Utterlog connection test',
          }
        : endpoint.includes('api.anthropic.com')
        ? {
            model,
            system: '',
            messages: [{ role: 'user', content: 'Hi, reply OK' }],
            max_tokens: 10,
            temperature: 0.1,
          }
        : {
            model,
            messages: [{ role: 'user', content: 'Hi, reply OK' }],
            max_tokens: 10,
            temperature: 0.1,
          };
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (endpoint.includes('api.anthropic.com')) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers.authorization = `Bearer ${apiKey}`;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const result: any = await res.json().catch(() => ({}));
      if (!res.ok || result.error) {
        const message = result.error?.message || result.error || `HTTP ${res.status}`;
        await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, `test-${providerType}`, 'error', String(message));
        return c.json({ success: false, error: { code: 'API_ERROR', message: String(message) } }, 400);
      }
      if (providerType === 'embedding') {
        const embedding = result.data?.[0]?.embedding || result.embedding;
        if (!Array.isArray(embedding) || embedding.length === 0) {
          const message = 'embedding provider 返回为空';
          await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-embedding', 'error', message);
          return c.json({ success: false, error: { code: 'API_ERROR', message } }, 400);
        }
        await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-embedding', 'success', `embedding:${embedding.length}`);
        return ok(c, { ok: true, content: `Embedding OK (${embedding.length} dimensions)`, model });
      }
      const content = result.content?.[0]?.text || result.choices?.[0]?.message?.content || result.choices?.[0]?.text || '';
      await logAi(currentUserId(c), { endpoint, model, slug: 'test' }, 'test-text', 'success', String(content || 'OK'));
      return ok(c, { ok: true, content: String(content || 'OK'), model });
    } catch (err) {
      return c.json({ success: false, error: { code: 'CONNECTION_ERROR', message: err instanceof Error ? err.message : 'AI 连接失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/generate-image', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return badRequest(c, 'prompt 不能为空');
    try {
      return ok(c, await callAiImage(prompt, currentUserId(c), String(body.size || '')));
    } catch (err) {
      return c.json({ success: false, error: { code: 'GENERATION_FAILED', message: err instanceof Error ? err.message : '图片生成失败' } }, 500);
    }
  });
  app.post('/api/v1/ai/cover', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title || '').trim();
    if (!title) return badRequest(c, 'title 不能为空');
    const prompt = renderPrompt(await resolvedPrompt('ai_image_prompt', 'cover'), {
      title,
      excerpt: String(body.excerpt || body.content || '').slice(0, 500),
      excerpt_block: excerptBlock(body.excerpt || body.content),
      style: String(await optionValue('ai_image_style', 'editorial')),
      text_policy: String(await optionValue('ai_image_text', 'no_text')),
    });
    try {
      return ok(c, { ...(await callAiImage(prompt, currentUserId(c))), prompt });
    } catch (err) {
      return c.json({ success: false, error: { code: 'GENERATION_FAILED', message: err instanceof Error ? err.message : 'AI 生成封面失败' } }, 500);
    }
  });
  app.post('/api/v1/ai/chat', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const message = String(body.message || body.prompt || '').trim();
    if (!message) return badRequest(c, 'message 不能为空');
    const userId = currentUserId(c);
    const conversationId = intParam(String(body.conversation_id || ''));
    let cid = conversationId;
    if (!cid) {
      const row = await one<{ id: number }>(
        `insert into ${table('ai_conversations')} (user_id, title, created_at, updated_at) values ($1,$2,$3,$3) returning id`,
        [userId, message.slice(0, 80), nowUnix()],
      );
      cid = row?.id || 0;
    }
    const history = cid ? await many<{ role: string; content: string }>(
      `select role, content from ${table('ai_messages')} where conversation_id = $1 order by id asc limit 20`,
      [cid],
    ).catch(() => []) : [];
    if (cid) {
      await exec(
        `insert into ${table('ai_messages')} (conversation_id, role, content, model, created_at) values ($1,'user',$2,'',$3)`,
        [cid, message, nowUnix()],
      ).catch(() => {});
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        send({ type: 'meta', conversation_id: cid });
        try {
          const systemPrompt = await buildAdminSystemPrompt();
          const result = await callAiTextWithTools(
            [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }],
            userId,
            send,
          );
          send({ type: 'chunk', content: result });
          if (cid) {
            await exec(
              `insert into ${table('ai_messages')} (conversation_id, role, content, model, created_at) values ($1,'assistant',$2,$3,$4)`,
              [cid, result, '', nowUnix()],
            ).catch(() => {});
            await exec(`update ${table('ai_conversations')} set message_count = message_count + 2, updated_at = $1 where id = $2`, [nowUnix(), cid]).catch(() => {});
          }
        } catch (err) {
          send({ type: 'chunk', content: `[Error: ${err instanceof Error ? err.message : 'AI 请求失败'}]` });
        } finally {
          send({ type: 'done' });
          controller.close();
        }
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
  app.get('/api/v1/ai/conversations', auth, async (c) => {
    const rows = await many<Record<string, unknown>>(`select * from ${table('ai_conversations')} where user_id = $1 order by updated_at desc, id desc limit 100`, [currentUserId(c)]).catch(() => []);
    return ok(c, rows);
  });
  app.get('/api/v1/ai/conversations/:id', auth, async (c) => {
    const id = c.req.param('id');
    const row = await one<Record<string, unknown>>(`select * from ${table('ai_conversations')} where id = $1 and user_id = $2`, [id, currentUserId(c)]).catch(() => null);
    if (!row) return notFound(c, '对话');
    const messages = await many<Record<string, unknown>>(`select * from ${table('ai_messages')} where conversation_id = $1 order by id asc`, [id]).catch(() => []);
    return ok(c, { ...row, messages });
  });
  app.delete('/api/v1/ai/conversations/:id', auth, async (c) => {
    await exec(`delete from ${table('ai_messages')} where conversation_id = $1`, [c.req.param('id')]).catch(() => {});
    await exec(`delete from ${table('ai_conversations')} where id = $1 and user_id = $2`, [c.req.param('id'), currentUserId(c)]).catch(() => {});
    return ok(c, null);
  });
  app.post('/api/v1/ai/slug', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title || body.text || '').trim();
    if (!title) return badRequest(c, 'title 不能为空');
    const prompt = renderPrompt(await resolvedPrompt('ai_slug_prompt', 'slug'), { title });
    const result = await callAiText([{ role: 'user', content: prompt }], 'slug', currentUserId(c));
    const slug = result.content.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
    return ok(c, { slug });
  });
  app.post('/api/v1/ai/summary', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const content = String(body.content || body.text || '').slice(0, 12000);
    if (!content) return badRequest(c, 'content 不能为空');
    const prompt = renderPrompt(await resolvedPrompt('ai_summary_prompt', 'summary'), {
      title: String(body.title || ''),
      content,
      excerpt: String(body.excerpt || ''),
      excerpt_section: excerptSection(body.excerpt),
      min_len: await optionValue('ai_summary_min_len', '80'),
      max_len: await optionValue('ai_summary_max_length', '200'),
    });
    const result = await callAiText([{ role: 'user', content: prompt }], 'summary', currentUserId(c));
    return ok(c, { summary: result.content });
  });
  app.post('/api/v1/ai/tags', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.content || body.text || '').slice(0, 8000);
    const prompt = renderPrompt(await resolvedPrompt('ai_keywords_prompt', 'keywords'), {
      title: String(body.title || ''),
      content: text,
      tags_count: String(body.tags_count || 5),
    });
    const result = await callAiText([{ role: 'user', content: prompt }], 'tags', currentUserId(c));
    let tags: string[] = [];
    try { tags = JSON.parse(result.content); } catch { tags = result.content.split(/[,，\n]/).map((s: string) => s.trim()).filter(Boolean); }
    return ok(c, { tags: tags.slice(0, 12) });
  });
  app.post('/api/v1/ai/format', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = renderPrompt(await resolvedPrompt('ai_polish_prompt', 'polish'), { content: String(body.content || '') });
    const result = await callAiText([{ role: 'user', content: prompt }], 'format', currentUserId(c));
    return ok(c, { content: result.content });
  });
  app.get('/api/v1/ai/logs', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const { page, perPage, offset } = pageParams(sp);
    const total = await one<{ count: string }>(`select count(*)::text as count from ${table('ai_logs')}`).catch(() => null);
    const rows = await many<Record<string, unknown>>(`select * from ${table('ai_logs')} order by created_at desc, id desc limit $1 offset $2`, [perPage, offset]).catch(() => []);
    return paginate(c, rows, Number(total?.count || 0), page, perPage);
  });
  app.get('/api/v1/ai/stats', auth, async (c) => {
    const userId = currentUserId(c);
    const [totals, byAction, byModel] = await Promise.all([
      one<{ total_calls: number; total_tokens: number }>(
        `select count(*)::int as total_calls, coalesce(sum(total_tokens),0)::int as total_tokens
         from ${table('ai_logs')} where user_id = $1`,
        [userId],
      ).catch(() => null),
      many<Record<string, unknown>>(
        `select coalesce(nullif(action,''),'unknown') as action, count(*)::int as count, coalesce(sum(total_tokens),0)::int as tokens
         from ${table('ai_logs')} where user_id = $1 group by action order by count desc, action asc`,
        [userId],
      ).catch(() => []),
      many<Record<string, unknown>>(
        `select coalesce(nullif(model,''),'unknown') as model, count(*)::int as count, coalesce(sum(total_tokens),0)::int as tokens
         from ${table('ai_logs')} where user_id = $1 group by model order by count desc, model asc limit 20`,
        [userId],
      ).catch(() => []),
    ]);
    return ok(c, {
      totals: totals || { total_calls: 0, total_tokens: 0 },
      by_action: byAction,
      by_model: byModel,
    });
  });
  app.post('/api/v1/ai/query', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const permissions = parseJsonOption<Record<string, boolean>>(await optionValue('ai_data_permissions', '{}'), {});
    if (!permissions.database_query) return forbidden(c, '数据库查询权限未开启');
    const safe = safeReadonlySql(body.query || body.sql || body.prompt, 100);
    if (safe.error) return forbidden(c, safe.error.replace(/^错误：/, ''));
    try {
      const rows = await many<Record<string, unknown>>(safe.limitedSql || '');
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return ok(c, { columns, rows, count: rows.length, sql: safe.sql });
    } catch (err) {
      return c.json({ success: false, error: { code: 'QUERY_ERROR', message: err instanceof Error ? err.message : '查询失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/reader-chat', optionalAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const postId = Number(body.post_id || body.postId || 0);
    const question = String(body.message || body.question || '').trim();
    let post: { id: number; title: string; excerpt: string | null; content: string | null; ai_questions: string | null } | null = null;
    if (postId > 0) {
      post = await one<{ id: number; title: string; excerpt: string | null; content: string | null; ai_questions: string | null }>(
        `select id, title, excerpt, content, ai_questions from ${table('posts')} where id = $1 and status = 'publish' limit 1`,
        [postId],
      ).catch(() => null);
      if (!post) return notFound(c, '文章');
    }

    if (!question) {
      if (!post) return ok(c, { questions: [] });
      const cached = String(post.ai_questions || '').trim();
      if (cached) {
        let questions: string[] = [];
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) questions = parsed.map((item) => String(item).trim()).filter(Boolean);
        } catch {
          questions = cached.split(/\r?\n/).map((line) => line.replace(/^[\s\d.)-]+/, '').trim()).filter(Boolean);
        }
        if (questions.length > 0) return ok(c, { questions: questions.slice(0, 3) });
      }

      const prompt = renderPrompt(await resolvedPrompt('ai_questions_prompt', 'questions'), {
        title: post.title,
        content: String(post.content || '').slice(0, 4000),
        excerpt: String(post.excerpt || ''),
        excerpt_section: excerptSection(post.excerpt),
      });
      try {
        const result = await callAiText([{ role: 'user', content: prompt }], 'reader-chat', currentUserId(c));
        const questions = result.content
          .split(/\r?\n/)
          .map((line: string) => line.replace(/^[\s\d.)-]+/, '').trim())
          .filter(Boolean)
          .slice(0, 3);
        if (questions.length > 0) {
          await exec(`update ${table('posts')} set ai_questions = $1, updated_at = $2 where id = $3`, [JSON.stringify(questions), nowUnix(), post.id]).catch(() => {});
        }
        return ok(c, { questions });
      } catch {
        return ok(c, { questions: [] });
      }
    }

    if ((await optionValue('ai_chat_guest', 'false')).toLowerCase() !== 'true' && currentUserId(c) === 0) {
      return c.json({ success: false, error: { code: 'GUEST_BLOCKED', message: '请先登录后再使用 AI 聊天' } }, 401);
    }

    const sessionId = safeId(body.session_id || body.sessionId) || `r_${postId}_${randomUUID()}`;
    const session = await getReaderSession(sessionId);
    session.lastUsed = Date.now();
    session.messages.push({ role: 'user', content: question });
    session.messages = session.messages.slice(-10);
    await saveReaderSession(sessionId, session);

    const systemParts: string[] = [];
    if (post) {
      const base = await optionValue('ai_system_prompt', '你是一个友好的 AI 阅读助手，专注于帮助读者理解和探讨博客文章。');
      systemParts.push(base);
      const memory = await optionValue('ai_blogger_memory', '');
      if (memory.trim()) systemParts.push(`## 背景记忆\n${memory.trim()}`);
      const articleContent = `${post.title}\n\n${String(post.content || body.context || body.content || '').slice(0, 4000)}`;
      systemParts.push(`你正在陪读的文章：\n\n标题：${post.title}\n\n内容：${articleContent}\n\n请围绕这篇文章回答用户的问题，可以总结、解释、延伸讨论，但不要透露站点内部数据。使用与用户相同的语言回复。回答简洁精炼。使用 Markdown 格式排版。严禁使用任何 emoji 表情符号。`);
    } else {
      const base = await optionValue('ai_system_prompt', '你是这个博客的 AI 助手，代表博主跟访客交流。可以介绍博客主题、推荐文章、回答关于博主的问题，但不要透露站点后台敏感信息。');
      systemParts.push(base);
      const bloggerName = await optionValue('ai_blogger_name', '');
      const bloggerBio = await optionValue('ai_blogger_bio', '');
      const bloggerStyle = await optionValue('ai_blogger_style', '');
      const bloggerMemory = await optionValue('ai_blogger_memory', '');
      if (bloggerName.trim()) systemParts.push(`博主昵称：${bloggerName.trim()}`);
      if (bloggerBio.trim()) systemParts.push(`博客简介：${bloggerBio.trim()}`);
      if (bloggerStyle.trim()) systemParts.push(`博主写作风格：${bloggerStyle.trim()}`);
      if (bloggerMemory.trim()) systemParts.push(`## 背景记忆\n${bloggerMemory.trim()}`);
      systemParts.push('请用与访客相同的语言回复。回答简洁精炼，使用 Markdown 格式排版。严禁使用任何 emoji 表情符号。');
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (payload: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        send({ type: 'meta', session_id: sessionId });
        try {
          const messages = [{ role: 'system', content: systemParts.join('\n\n') }, ...session.messages];
          const result = await callAiText(messages, 'reader-chat', currentUserId(c));
          session.messages.push({ role: 'assistant', content: result.content });
          session.messages = session.messages.slice(-10);
          session.lastUsed = Date.now();
          await saveReaderSession(sessionId, session);
          send({ type: 'chunk', content: result.content, delta: result.content });
          send({ type: 'done' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'AI 暂时无法回复';
          send({ type: 'chunk', content: `[Error: ${message}]`, delta: `[Error: ${message}]` });
        } finally {
          controller.close();
        }
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
  app.post('/api/v1/ai/batch-questions', auth, async (c) => {
    try {
      return ok(c, await startAiBatch('questions', currentUserId(c)));
    } catch (err) {
      return c.json({ success: false, error: { code: 'NO_AI_PROVIDER', message: err instanceof Error ? err.message : '启动失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/batch-summary', auth, async (c) => {
    try {
      return ok(c, await startAiBatch('summary', currentUserId(c)));
    } catch (err) {
      return c.json({ success: false, error: { code: 'NO_AI_PROVIDER', message: err instanceof Error ? err.message : '启动失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/batch-all', auth, async (c) => {
    try {
      return ok(c, await startAiBatch('all', currentUserId(c)));
    } catch (err) {
      return c.json({ success: false, error: { code: 'NO_AI_PROVIDER', message: err instanceof Error ? err.message : '启动失败' } }, 400);
    }
  });
  app.post('/api/v1/ai/batch-delete', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      return ok(c, await deleteAiBatchData(body.fields));
    } catch (err) {
      return badRequest(c, err instanceof Error ? err.message : '清空失败');
    }
  });
  app.post('/api/v1/ai/batch-stop', auth, async (c) => {
    const type = new URL(c.req.url).searchParams.get('type');
    const normalized = type === 'summary' || type === 'all' ? type : 'questions';
    return ok(c, await stopAiBatch(normalized));
  });
  app.get('/api/v1/ai/batch-status', auth, async (c) => {
    const type = new URL(c.req.url).searchParams.get('type');
    const normalized = type === 'summary' || type === 'all' ? type : 'questions';
    return ok(c, await getAiBatchStatus(normalized));
  });
  app.get('/api/v1/admin/ai-comments', auth, async (c) => {
    const sp = new URL(c.req.url).searchParams;
    const status = String(sp.get('status') || '').trim();
    const limit = Math.max(1, Math.min(500, intParam(sp.get('limit') || undefined, 50)));
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `where q.status = $${params.length}`;
    }
    params.push(limit);
    const rows = await many<Record<string, unknown>>(
      `select q.id, q.comment_id, q.post_id, coalesce(p.title,'') as post_title,
              q.comment_text, coalesce(c.author_name,'') as comment_author,
              q.ai_reply, q.status, q.created_at, q.processed_at, q.error_msg,
              q.ai_audit_passed, q.ai_audit_confidence, q.ai_audit_reason
       from ${table('ai_comment_queue')} q
       left join ${table('comments')} c on c.id = q.comment_id
       left join ${table('posts')} p on p.id = q.post_id
       ${where}
       order by q.created_at desc limit $${params.length}`,
      params,
    ).catch(() => []);
    const stats = await one<Record<string, unknown>>(
      `select
        count(*) filter (where status='pending')::int as pending,
        count(*) filter (where status='approved')::int as approved,
        count(*) filter (where status='rejected')::int as rejected,
        count(*) filter (where status='error')::int as error
       from ${table('ai_comment_queue')}`,
    ).catch(() => null);
    return ok(c, { items: rows, stats: stats || { pending: 0, approved: 0, rejected: 0, error: 0 } });
  });
  app.post('/api/v1/admin/ai-comments/:id/approve', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    try {
      await publishAiCommentReply(id, String(body.content || '').trim(), currentUserId(c));
    } catch (err) {
      const message = err instanceof Error ? err.message : '处理失败';
      if (message.includes('不存在')) return notFound(c, message);
      return badRequest(c, message);
    }
    return ok(c, { id });
  });
  app.post('/api/v1/admin/ai-comments/:id/reject', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    await exec(`update ${table('ai_comment_queue')} set status = 'rejected', processed_at = $1, reviewer_id = $2 where id = $3 and status in ('pending','error')`, [nowUnix(), currentUserId(c), id]);
    return ok(c, { id });
  });
  app.post('/api/v1/admin/ai-comments/:id/regenerate', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    const row = await one<{ comment_text: string }>(`select comment_text from ${table('ai_comment_queue')} where id = $1`, [id]);
    if (!row) return notFound(c, '队列条目不存在');
    const result = await callAiText([{ role: 'user', content: `请以站点管理员身份，友好、简洁地回复这条评论：\n${row.comment_text}` }], 'comment-reply', currentUserId(c));
    await exec(`update ${table('ai_comment_queue')} set ai_reply = $1, status = 'pending', error_msg = null where id = $2`, [result.content, id]);
    return ok(c, { id, reply: result.content });
  });
  app.delete('/api/v1/admin/ai-comments/:id', auth, async (c) => {
    const id = intParam(c.req.param('id'));
    if (!id) return badRequest(c, '参数错误');
    await exec(`delete from ${table('ai_comment_queue')} where id = $1`, [id]);
    return ok(c, { id });
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
  app.post('/api/v1/search/rebuild', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      return ok(c, await rebuildEmbeddings(Number(body.limit || 0), currentUserId(c)));
    } catch (err) {
      return c.json({
        success: false,
        error: { code: 'EMBEDDING_REBUILD_FAILED', message: err instanceof Error ? err.message : '重建搜索索引失败' },
      }, 400);
    }
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

  app.post('/api/v1/telegram/webhook', async (c) => {
    const secret = (await optionValue('telegram_webhook_secret', '')).trim();
    if (secret && c.req.header('x-telegram-bot-api-secret-token') !== secret) {
      return forbidden(c, 'Invalid Telegram webhook secret');
    }
    const botToken = (await optionValue('telegram_bot_token', '')).trim();
    const configuredChatID = (await optionValue('telegram_chat_id', '')).trim();
    const update = await c.req.json().catch(() => ({}));
    const chat = update?.message?.chat || update?.callback_query?.message?.chat;
    if (chat?.id) {
      const current = parseJsonOption<Record<string, unknown>[]>(await optionValue('telegram_discovered_chats', '[]'), []);
      const next = [{ id: chat.id, title: chat.title || chat.username || chat.first_name || String(chat.id), type: chat.type || 'private' }, ...current.filter((item) => String(item.id) !== String(chat.id))].slice(0, 20);
      await saveOption('telegram_discovered_chats', JSON.stringify(next));
    }

    const callback = update?.callback_query;
    if (callback) {
      const chatId = String(callback.message?.chat?.id || '');
      if (!botToken || !configuredChatID || chatId !== configuredChatID) return ok(c, null);
      if ((await optionValue('tg_comment_approve', 'true')) === 'false') return ok(c, null);
      const [action, commentIDRaw] = String(callback.data || '').split(':', 2);
      const commentID = intParam(commentIDRaw);
      if (!commentID || !['approve', 'reject'].includes(action)) return ok(c, null);

      const before = await one<{ post_id: number; status: string }>(
        `select post_id, status from ${table('comments')} where id = $1`,
        [commentID],
      ).catch(() => null);
      let result = '';
      if (action === 'approve') {
        await exec(`update ${table('comments')} set status = 'approved', updated_at = $1 where id = $2`, [nowUnix(), commentID]);
        if (before && before.status !== 'approved') {
          await exec(`update ${table('posts')} set comment_count = comment_count + 1 where id = $1`, [before.post_id]).catch(() => {});
        }
        result = '评论已通过审核';
      } else {
        await exec(`update ${table('comments')} set status = 'trash', updated_at = $1 where id = $2`, [nowUnix(), commentID]);
        if (before?.status === 'approved') {
          await exec(`update ${table('posts')} set comment_count = greatest(comment_count - 1, 0) where id = $1`, [before.post_id]).catch(() => {});
        }
        result = '评论已拒绝';
      }
      await telegramApi('answerCallbackQuery', botToken, { callback_query_id: callback.id, text: result }).catch(() => {});
      const oldText = String(callback.message?.text || '');
      await telegramApi('editMessageText', botToken, {
        chat_id: chatId,
        message_id: callback.message?.message_id,
        text: `${oldText}\n\n${result}`,
      }).catch(() => {});
      return ok(c, null);
    }

    const message = update?.message;
    if (!message) return ok(c, null);
    const chatId = String(message.chat?.id || '');
    const text = String(message.text || message.caption || '').trim();
    if (!botToken || !configuredChatID || chatId !== configuredChatID) return ok(c, null);

    const replyCommentId = telegramReplyCommentId(message.reply_to_message);
    if (replyCommentId && text) {
      if ((await optionValue('tg_comment_reply', 'false')) !== 'true') {
        await telegramApi('sendMessage', botToken, { chat_id: chatId, text: '评论回复功能未启用' }).catch(() => {});
        return ok(c, null);
      }
      try {
        const replyId = await publishTelegramCommentReply(replyCommentId, text);
        await telegramApi('sendMessage', botToken, { chat_id: chatId, text: `评论回复已发布${replyId ? ` #${replyId}` : ''}` }).catch(() => {});
      } catch (err) {
        await telegramApi('sendMessage', botToken, {
          chat_id: chatId,
          text: `评论回复失败：${err instanceof Error ? err.message : '未知错误'}`,
        }).catch(() => {});
      }
      return ok(c, null);
    }

    if (text === '/help' || text === '/start') {
      await telegramApi('sendMessage', botToken, {
        chat_id: chatId,
        text: 'Utterlog Bot\n\n/ai <消息> - AI 聊天\n/stats - 数据报告\n/help - 帮助\n\n直接发送文字可发布说说。',
      }).catch(() => {});
      return ok(c, null);
    }
    if (text === '/stats' || text === '/report') {
      const [posts, comments, views] = await Promise.all([
        one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type='post' and deleted_at = 0`).catch(() => null),
        one<{ count: string }>(`select count(*)::text as count from ${table('comments')} where status='approved'`).catch(() => null),
        one<{ count: string }>(`select coalesce(sum(view_count),0)::text as count from ${table('posts')} where deleted_at = 0`).catch(() => null),
      ]);
      await telegramApi('sendMessage', botToken, {
        chat_id: chatId,
        text: `数据报告\n\n文章: ${posts?.count || 0}\n评论: ${comments?.count || 0}\n浏览: ${views?.count || 0}`,
      }).catch(() => {});
      return ok(c, null);
    }
    if (text.startsWith('/ai ')) {
      if ((await optionValue('tg_ai_chat', 'true')) === 'false') return ok(c, null);
      const prompt = text.slice(4).trim();
      if (prompt) {
        const answer = await callAiText([{ role: 'user', content: prompt }], 'chat', 0).then((r) => r.content).catch((err) => `AI 服务暂时不可用：${err instanceof Error ? err.message : '未知错误'}`);
        await telegramApi('sendMessage', botToken, { chat_id: chatId, text: answer.slice(0, 4000) }).catch(() => {});
      }
      return ok(c, null);
    }
    const photos = Array.isArray(message.photo) ? message.photo : [];
    if (photos.length > 0) {
      if ((await optionValue('tg_auto_upload_image', 'true')) === 'false') return ok(c, null);
      const publishMoment = (await optionValue('tg_publish_moment', 'true')) !== 'false';
      try {
        await saveTelegramPhotoMoment(botToken, chatId, photos[photos.length - 1], text, publishMoment);
      } catch (err) {
        await telegramApi('sendMessage', botToken, {
          chat_id: chatId,
          text: `图片处理失败：${err instanceof Error ? err.message : '未知错误'}`,
        }).catch(() => {});
      }
      return ok(c, null);
    }
    if (text && (await optionValue('tg_publish_moment', 'true')) !== 'false') {
      await exec(
        `insert into ${table('moments')} (content, images, source, author_id, visibility, created_at, updated_at)
         values ($1, '{}'::text[], 'telegram', 1, 'public', $2, $2)`,
        [text, nowUnix()],
      ).catch(() => {});
      await telegramApi('sendMessage', botToken, { chat_id: chatId, text: `说说已发布\n\n${text}` }).catch(() => {});
    }
    return ok(c, null);
  });
  app.post('/api/v1/telegram/test', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = String(body.bot_token || await optionValue('telegram_bot_token', '')).trim();
    const chatId = String(body.chat_id || await optionValue('telegram_chat_id', '')).trim();
    if (!token || !chatId) return badRequest(c, 'Telegram Bot Token 和 Chat ID 不能为空');
    await telegramApi('sendMessage', token, { chat_id: chatId, text: 'Utterlog Telegram test message' });
    return ok(c, { sent: true });
  });
  app.post('/api/v1/telegram/get-chat-id', auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = String(body.bot_token || await optionValue('telegram_bot_token', '')).trim();
    if (!token) return badRequest(c, 'Telegram Bot Token 不能为空');
    const discovered = parseJsonOption<Record<string, unknown>[]>(await optionValue('telegram_discovered_chats', '[]'), []);
    const chats = [...discovered];
    const webhookURL = `${config.appUrl.replace(/\/+$/, '')}/api/v1/telegram/webhook`;
    const secret = (await optionValue('telegram_webhook_secret', '')).trim();
    await telegramApi('deleteWebhook', token, { drop_pending_updates: false }).catch(() => {});
    const updates = await telegramApi('getUpdates', token, { limit: 20, timeout: 0 }).catch(() => ({ result: [] }));
    void telegramApi('setWebhook', token, { url: webhookURL, ...(secret ? { secret_token: secret } : {}) }).catch(() => {});
    for (const item of updates.result || []) {
      const chat = item?.message?.chat || item?.callback_query?.message?.chat;
      if (chat?.id && !chats.some((existing) => String(existing.id) === String(chat.id))) {
        chats.push({ id: chat.id, title: chat.title || chat.username || chat.first_name || String(chat.id), type: chat.type || 'private' });
      }
    }
    await saveOption('telegram_discovered_chats', JSON.stringify(chats.slice(0, 20)));
    return ok(c, { chats: chats.slice(0, 20), hint: chats.length ? '' : '请先向 Bot 发送一条消息' });
  });
  app.post('/api/v1/telegram/setup-webhook', auth, async (c) => {
    const token = (await optionValue('telegram_bot_token', '')).trim();
    if (!token) return badRequest(c, '请先保存 Telegram Bot Token');
    const webhookURL = `${config.appUrl.replace(/\/+$/, '')}/api/v1/telegram/webhook`;
    const secret = (await optionValue('telegram_webhook_secret', '')).trim();
    await telegramApi('setWebhook', token, { url: webhookURL, ...(secret ? { secret_token: secret } : {}) });
    return ok(c, { ok: true, message: 'Webhook 设置成功', url: webhookURL });
  });
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

  app.post('/api/v1/themes/upload', auth, (c) => uploadExtension(c, 'theme'));
  app.post('/api/v1/themes/:id/activate', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '主题 ID 无效');
    if (!extensionExists('theme', id)) return notFound(c, '主题');
    if (!SUPPORTED_BLOG_THEMES.has(id)) {
      return badRequest(c, '当前 Bun 运行时已启用 Azure / Nebula 主题，请切换至其中之一');
    }
    await saveOption('active_theme', id);
    return ok(c, { id, active: true });
  });
  app.delete('/api/v1/themes/:id', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '主题 ID 无效');
    if (isBuiltinTheme(id)) return badRequest(c, '内置主题无法删除');
    if ((await optionValue('active_theme', '')) === id) return badRequest(c, '无法删除当前启用的主题，请先切换到其他主题');
    await rm(join(extensionDir('theme'), id), { recursive: true, force: true });
    return ok(c, { id, deleted: true });
  });
  app.post('/api/v1/plugins/upload', auth, (c) => uploadExtension(c, 'plugin'));
  app.post('/api/v1/plugins/:id/activate', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '插件 ID 无效');
    if (!extensionExists('plugin', id)) return notFound(c, '插件');
    return ok(c, { id, active: true, active_plugins: await setPluginActive(id, true) });
  });
  app.post('/api/v1/plugins/:id/deactivate', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '插件 ID 无效');
    return ok(c, { id, active: false, active_plugins: await setPluginActive(id, false) });
  });
  app.delete('/api/v1/plugins/:id', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    if (!id) return badRequest(c, '插件 ID 无效');
    await rm(join(extensionDir('plugin'), id), { recursive: true, force: true });
    await setPluginActive(id, false);
    return ok(c, { id, deleted: true });
  });
}
