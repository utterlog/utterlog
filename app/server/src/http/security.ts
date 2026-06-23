import type { Context, Next } from 'hono';
import { config, table } from '../config';
import { verifyAccessToken } from '../auth/jwt';
import { exec, nowUnix, one } from '../db/helpers';
import { lookupGeoIp, normalizeGeoProvider } from '../geoip';
import { fail } from './response';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const ccBuckets5s = new Map<string, Bucket>();
const ccBuckets60s = new Map<string, Bucket>();
const geoCache = new Map<string, { country: string; expiresAt: number }>();

type SecuritySettings = {
  cc_enabled: boolean;
  cc_limit_5s: number;
  cc_limit_60s: number;
  geo_enabled: boolean;
  geo_mode: 'whitelist' | 'blacklist';
  geo_countries: string[];
  ip_geo_provider: string;
  api_rate_limit: number;
  require_login: boolean;
};

let settingsCache: { value: SecuritySettings; expiresAt: number } | null = null;

function clientIp(c: Context) {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
}

function adminSurface(path: string) {
  return path.startsWith('/admin') ||
    path.startsWith('/api/v1/admin/') ||
    path.startsWith('/api/v1/security') ||
    path.startsWith('/api/revalidate') ||
    path.startsWith('/api/v1/sync/');
}

function authCookie(c: Context) {
  const raw = c.req.header('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === 'utterlog_access_token') return decodeURIComponent(rest.join('=') || '');
  }
  return '';
}

function frontPageRequest(c: Context) {
  const path = c.req.path;
  if (!['GET', 'HEAD'].includes(c.req.method.toUpperCase())) return false;
  if (
    path.startsWith('/api/') ||
    path.startsWith('/admin') ||
    path.startsWith('/install') ||
    path.startsWith('/login') ||
    path.startsWith('/uploads/') ||
    path.startsWith('/_next') ||
    path === '/feed' ||
    /\.(?:ico|png|jpg|jpeg|svg|webp|avif|gif|css|js|woff2?|ttf|map|xml)$/i.test(path)
  ) {
    return false;
  }
  return true;
}

async function hasFrontAccess(c: Context) {
  const token = authCookie(c);
  if (!token) return false;
  try {
    await verifyAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

async function hasAuthenticatedAccess(c: Context) {
  const header = c.req.header('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const token = bearer || authCookie(c);
  if (!token) return false;
  try {
    await verifyAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

function bumpBucket(map: Map<string, Bucket>, key: string, windowMs: number) {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    map.set(key, next);
    return next;
  }
  bucket.count += 1;
  return bucket;
}

async function optionValue(name: string, fallback = '') {
  const row = await one<{ value: string }>(`select value from ${table('options')} where name = $1`, [name]).catch(() => null);
  return row?.value ?? fallback;
}

async function securitySettings() {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) return settingsCache.value;
  const countries = await optionValue('geo_countries', 'CN,HK,TW,MO');
  const rawMode = String(await optionValue('geo_mode', 'whitelist')).toLowerCase();
  const value: SecuritySettings = {
    cc_enabled: boolValue(await optionValue('cc_enabled', 'false')),
    cc_limit_5s: Math.max(1, Number(await optionValue('cc_limit_5s', '30')) || 30),
    cc_limit_60s: Math.max(1, Number(await optionValue('cc_limit_60s', '120')) || 120),
    geo_enabled: boolValue(await optionValue('geo_enabled', 'false')),
    geo_mode: rawMode === 'blacklist' ? 'blacklist' : 'whitelist',
    geo_countries: countries.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean),
    ip_geo_provider: normalizeGeoProvider(await optionValue('ip_geo_provider', 'ipx')),
    api_rate_limit: Math.max(1, Number(await optionValue('rate_limit', '300')) || 300),
    require_login: boolValue(await optionValue('require_login', 'false')),
  };
  settingsCache = { value, expiresAt: now + 5000 };
  return value;
}

async function logSecurityEvent(ip: string, eventType: string, detail = '') {
  await exec(
    `insert into ${table('security_events')} (ip, event_type, detail, score_delta, created_at)
     values ($1, $2, $3, 0, $4)`,
    [ip || '', eventType, detail || '', nowUnix()],
  ).catch(() => {});
}

async function isIpBanned(ip: string) {
  if (!ip || ip === 'unknown') return false;
  const row = await one<{ count: string }>(
    `select count(*)::text as count from ${table('ip_bans')} where ip = $1 and (expires_at = 0 or expires_at > $2)`,
    [ip, nowUnix()],
  ).catch(() => null);
  return Number(row?.count || 0) > 0;
}

async function lookupCountryFromProvider(ip: string, provider: string) {
  const now = Date.now();
  const cached = geoCache.get(ip);
  if (cached && cached.expiresAt > now) return cached.country;
  const geo = await lookupGeoIp(ip, provider, 1500);
  const country = geo?.country_code || '';
  if (country) geoCache.set(ip, { country, expiresAt: now + 60 * 60 * 1000 });
  return country;
}

async function requestCountry(c: Context, ip: string, provider: string) {
  const headerCountry = (
    c.req.header('cf-ipcountry') ||
    c.req.header('x-vercel-ip-country') ||
    c.req.header('x-country-code') ||
    ''
  ).trim().toUpperCase();
  if (headerCountry && headerCountry !== 'XX') return headerCountry;
  return lookupCountryFromProvider(ip, provider);
}

function adminApiPath(path: string) {
  return path.startsWith('/api/v1/admin/')
    || path.startsWith('/api/v1/auth/me')
    || path.startsWith('/api/v1/system/')
    || path.startsWith('/api/v1/notifications')
    || path.startsWith('/api/v1/themes')
    || path.startsWith('/api/v1/plugins')
    || path.startsWith('/api/v1/i18n/')
    || path.startsWith('/api/v1/analytics')
    || path.startsWith('/api/v1/security')
    || path.startsWith('/api/revalidate');
}

function routeClass(path: string) {
  if (path.includes('/auth/login')) return 'auth-login';
  if (path.includes('/auth/forgot-password') || path.includes('/auth/reset-password')) return 'auth-reset';
  if (path.includes('/location/reverse')) return 'location-reverse';
  if (path.includes('/captcha')) return 'captcha';
  if (path.includes('/comments')) return 'comments';
  if (path.includes('/ai/reader-chat')) return 'ai-reader';
  if (path.includes('/sync/')) return 'sync';
  if (adminApiPath(path)) return 'admin';
  return 'api';
}

function publicBlogRead(path: string, method: string) {
  if (method.toUpperCase() !== 'GET') return false;
  return /^\/api\/v1\/(options|posts|categories|tags|archive\/stats|owner|online|menus)(\/|$)/.test(path)
    || /^\/api\/v1\/posts\/(slug\/[^/]+|\d+|by-display-id\/\d+)$/.test(path);
}

function limitFor(kind: string) {
  switch (kind) {
    case 'auth-login':
      return { max: 10, windowMs: 60_000 };
    case 'auth-reset':
      return { max: 5, windowMs: 60_000 };
    case 'location-reverse':
      return { max: 30, windowMs: 60_000 };
    case 'comments':
      return { max: 30, windowMs: 60_000 };
    case 'ai-reader':
      return { max: 20, windowMs: 60_000 };
    case 'sync':
      return { max: 240, windowMs: 60_000 };
    case 'admin':
      return { max: 600, windowMs: 60_000 };
    default:
      return { max: 300, windowMs: 60_000 };
  }
}

export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export async function bodySizeLimit(c: Context, next: Next) {
  const method = c.req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return next();
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('multipart/form-data')) return next();
  const rawLength = c.req.header('content-length');
  const length = rawLength ? Number.parseInt(rawLength, 10) : 0;
  if (Number.isFinite(length) && length > 2 * 1024 * 1024) {
    return fail(c, 413, 'PAYLOAD_TOO_LARGE', '请求体过大');
  }
  return next();
}

export async function securityDefense(c: Context, next: Next) {
  const path = c.req.path;
  if (path.startsWith('/api/v1/install') || path.startsWith('/api/v1/setup')) return next();

  const ip = clientIp(c);
  const admin = adminSurface(path);
  if (!admin && await isIpBanned(ip)) {
    await logSecurityEvent(ip, 'ip_banned', path);
    return fail(c, 403, 'IP_BANNED', '当前 IP 已被封禁');
  }

  const settings = await securitySettings().catch(() => null);
  if (!settings) return next();

  if (!admin && settings.require_login && frontPageRequest(c) && !await hasFrontAccess(c)) {
    const current = new URL(c.req.url);
    const login = new URL('/login', current.origin);
    login.searchParams.set('next', `${current.pathname}${current.search}`);
    const response = c.redirect(login.toString(), 302);
    response.headers.append('Set-Cookie', 'utterlog_access_token=; Path=/; Max-Age=0; SameSite=Lax');
    return response;
  }

  if (!admin && settings.geo_enabled) {
    const country = await requestCountry(c, ip, settings.ip_geo_provider);
    if (country) {
      const matched = settings.geo_countries.includes(country);
      const blocked = settings.geo_mode === 'whitelist' ? !matched : matched;
      if (blocked) {
        await logSecurityEvent(ip, 'geoip_block', `country:${country}`);
        return fail(c, 403, 'GEO_BLOCKED', '当前地区暂不可访问');
      }
    }
  }

  if (!admin && settings.cc_enabled && !await hasAuthenticatedAccess(c)) {
    const b5 = bumpBucket(ccBuckets5s, ip, 5000);
    const b60 = bumpBucket(ccBuckets60s, ip, 60_000);
    if (b5.count > settings.cc_limit_5s || b60.count > settings.cc_limit_60s) {
      await logSecurityEvent(ip, 'cc_block', `5s:${b5.count}/60s:${b60.count}`);
      c.header('Retry-After', '5');
      return fail(c, 429, 'CC_BLOCKED', '请求过于频繁，请稍后再试');
    }
  }

  return next();
}

export async function rateLimit(c: Context, next: Next) {
  const path = c.req.path;
  if (!path.startsWith('/api/')) return next();
  if (publicBlogRead(path, c.req.method)) return next();
  if (await hasAuthenticatedAccess(c)) return next();
  const kind = routeClass(path);
  const configured = await securitySettings().catch(() => null);
  const base = limitFor(kind);
  const { max, windowMs } = kind === 'api' && configured ? { max: configured.api_rate_limit, windowMs: 60_000 } : base;
  const key = `${kind}:${clientIp(c)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > max) {
    c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return fail(c, 429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
  }
  return next();
}
