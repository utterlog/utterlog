import { createHash } from 'node:crypto';
import { isBotUa } from '../bot-detect';
import { table } from '../config';
import { sql } from '../db/client';
import { exec, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { lookupGeoIp } from '../geoip';
import { requestIp } from '../request-ip';
import { parsePermalinkPath } from './permalink';
import { ephemeral } from '../store/ephemeral';

export { requestIp };

export const PAGE_VIEW_DEDUP_SECONDS = 30;
export const PAGE_VIEW_RATE_WINDOW_SECONDS = 60;
export const PAGE_VIEW_RATE_LIMIT = 8;
export const PAGE_VIEW_IP_RATE_LIMIT = 30;
export const PAGE_VIEW_BLOCK_SECONDS = 3600;

export type PageViewGateCounts = {
  duplicate: number;
  recent: number;
  recentIp: number;
};

export function pageViewGateReason(counts: PageViewGateCounts) {
  if (counts.duplicate > 0) return 'duplicate';
  if (counts.recent >= PAGE_VIEW_RATE_LIMIT) return 'behavior_rate';
  if (counts.recentIp >= PAGE_VIEW_IP_RATE_LIMIT) return 'ip_rate';
  return '';
}

function analyticsKey(kind: string, value: string) {
  return `analytics:${kind}:${createHash('sha256').update(value).digest('hex')}`;
}

async function pageViewGate(identity: string, ip: string, path: string, now: number) {
  const identityBlockKey = analyticsKey('block:identity', identity);
  const ipBlockKey = analyticsKey('block:ip', ip);
  if (await ephemeral.get(identityBlockKey) || await ephemeral.get(ipBlockKey)) return 'behavior_blocked';

  const duplicateKey = analyticsKey('dedup', `${identity}\0${path}`);
  if (await ephemeral.get(duplicateKey)) return 'duplicate';

  const identitySql = `coalesce(nullif(visitor_id,''),nullif(fingerprint,''),ip)`;
  const counts = await one<{ duplicate: string; recent: string; recent_ip: string }>(
    `select
       count(*) filter (where path=$2 and ${identitySql}=$1 and created_at >= $3)::text as duplicate,
       count(*) filter (where ${identitySql}=$1)::text as recent,
       count(*) filter (where ip=$5)::text as recent_ip
     from ${table('access_logs')}
     where created_at >= $4 and (${identitySql}=$1 or ip=$5)`,
    [identity, path, now - PAGE_VIEW_DEDUP_SECONDS, now - PAGE_VIEW_RATE_WINDOW_SECONDS, ip],
  ).catch(() => null);
  const reason = pageViewGateReason({
    duplicate: Number(counts?.duplicate || 0),
    recent: Number(counts?.recent || 0),
    recentIp: Number(counts?.recent_ip || 0),
  });
  if (reason === 'behavior_rate') {
    await ephemeral.set(identityBlockKey, '1', PAGE_VIEW_BLOCK_SECONDS);
    return reason;
  }
  if (reason === 'ip_rate') {
    await ephemeral.set(ipBlockKey, '1', PAGE_VIEW_BLOCK_SECONDS);
    return reason;
  }
  if (reason) return reason;

  await ephemeral.set(duplicateKey, '1', PAGE_VIEW_DEDUP_SECONDS);
  return '';
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
          : lower.includes('curl') ? 'curl' : '';
  const os = lower.includes('iphone') || lower.includes('ipad') ? 'iOS'
    : lower.includes('windows') ? 'Windows'
      : lower.includes('mac os') || lower.includes('macintosh') ? 'macOS'
        : lower.includes('android') ? 'Android'
          : lower.includes('linux') ? 'Linux' : 'Other';
  return { device, browser, os };
}

function decodedHeader(request: Request, name: string) {
  const value = String(request.headers.get(name) || '').trim();
  try { return decodeURIComponent(value); } catch { return value; }
}

function geoHeaders(request: Request) {
  const country = String(request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country') || '').trim().toUpperCase().slice(0, 10);
  const region = String(request.headers.get('x-vercel-ip-country-region') || request.headers.get('cf-region') || '').trim().slice(0, 100);
  const city = (decodedHeader(request, 'x-vercel-ip-city') || decodedHeader(request, 'cf-ipcity')).slice(0, 100);
  const latitude = Number(request.headers.get('x-vercel-ip-latitude') || request.headers.get('cf-iplatitude') || 0);
  const longitude = Number(request.headers.get('x-vercel-ip-longitude') || request.headers.get('cf-iplongitude') || 0);
  return { country, countryName: country, region, city, latitude: Number.isFinite(latitude) ? latitude : 0,
    longitude: Number.isFinite(longitude) ? longitude : 0 };
}

async function siteDate(value = new Date()) {
  const timeZone = (await optionValue('site_timezone', 'UTC')).trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

async function postIdFromTrackedPath(path: string) {
  const template = await optionValue('permalink_structure', '/posts/%postname%');
  const parsed = parsePermalinkPath(path, template);
  if (parsed?.id) return parsed.id;
  if (parsed?.displayId) {
    const row = await one<{ id: number }>(
      `select id from ${table('posts')} where display_id = $1 and type = 'post' and status = 'publish' limit 1`, [parsed.displayId],
    ).catch(() => null);
    if (row?.id) return row.id;
  }
  if (parsed?.slug) {
    const row = await one<{ id: number }>(
      `select id from ${table('posts')} where slug = $1 and type = 'post' and status = 'publish' limit 1`, [parsed.slug],
    ).catch(() => null);
    if (row?.id) return row.id;
  }
  const slugMatch = path.match(/^\/posts\/([^/?#]+)/);
  if (slugMatch) {
    const slug = decodeURIComponent(slugMatch[1]);
    const row = await one<{ id: number }>(`select id from ${table('posts')} where slug = $1 and type = 'post' limit 1`, [slug]).catch(() => null);
    if (row?.id) return row.id;
  }
  return Number(path.match(/^\/(?:p|post)\/(\d+)(?:[/?#]|$)/)?.[1] || 0);
}

async function enrichAccessGeo(logId: number, ip: string) {
  if (!logId) return;
  try {
    const provider = await optionValue('ip_geo_provider', 'ipx');
    const payload = await lookupGeoIp(ip, provider, 5000);
    const country = String(payload?.country_code || payload?.country || '').toUpperCase().slice(0, 10);
    if (!country) return;
    const created = await one<{ created_at: number; country: string }>(
      `select created_at, coalesce(country,'') as country from ${table('access_logs')} where id = $1`, [logId],
    ).catch(() => null);
    await exec(
      `update ${table('access_logs')}
       set country=case when coalesce(country,'')='' then $1 else country end,
           country_name=case when coalesce(country_name,'')='' then $2 else country_name end,
           region=case when coalesce(region,'')='' then $3 else region end,
           city=case when coalesce(city,'')='' then $4 else city end,
           latitude=case when coalesce(latitude,0)=0 then $5 else latitude end,
           longitude=case when coalesce(longitude,0)=0 then $6 else longitude end where id=$7`,
      [country, String(payload?.country || country).slice(0, 100), String(payload?.province || '').slice(0, 100),
        String(payload?.city || '').slice(0, 100), Number(payload?.latitude || 0) || 0, Number(payload?.longitude || 0) || 0, logId],
    ).catch(() => {});
    if (created?.created_at && !created.country) {
      await exec(
        `insert into ${table('stats_daily')} (date, dimension, dim_value, dim_extra, visits, unique_visitors)
         values ($1::date, 'country', $2, $3, 1, 0)
         on conflict (date, dimension, dim_value, dim_extra) do update set visits=${table('stats_daily')}.visits+1`,
        [await siteDate(new Date(Number(created.created_at) * 1000)), String(payload?.country || country).slice(0, 100), country],
      ).catch(() => {});
    }
  } catch {
    // GeoIP enrichment is best-effort.
  }
}

export async function trackPageView(request: Request, input: Record<string, unknown>) {
  const path = String(input.path || '/').slice(0, 500);
  const ip = requestIp(request);
  const visitorId = String(input.visitor_id || '').slice(0, 64);
  const fingerprint = String(input.fingerprint || '').slice(0, 64);
  const visitor = visitorId || fingerprint || ip;
  const ua = request.headers.get('user-agent') || '';
  if (isBotUa(ua)) return { tracked: false, reason: 'bot' };
  const parsed = parseUa(ua);
  const referer = String(input.referer || request.headers.get('referer') || '').slice(0, 500);
  let refererHost = '';
  try { refererHost = referer ? new URL(referer).host : ''; } catch { refererHost = ''; }
  const geo = geoHeaders(request);
  const now = nowUnix();
  const gateReason = await pageViewGate(visitor, ip, path, now);
  if (gateReason) return { tracked: false, reason: gateReason };
  const today = await siteDate(new Date(now * 1000));
  const dimensions: Array<[string, string, string]> = [
    ['browser', parsed.browser || 'Unknown', ''], ['os', parsed.os || 'Unknown', ''], ['device', parsed.device || 'Unknown', ''],
  ];
  if (geo.countryName || geo.country) dimensions.push(['country', geo.countryName || geo.country, geo.country || '']);
  const trackedPostId = Number(input.post_id || await postIdFromTrackedPath(path) || 0);
  let accessLogId = 0;
  try {
    await sql.begin(async (tx) => {
      const siteVisitorRows = await tx.unsafe<{ inserted: boolean }[]>(
        `insert into ${table('stats_visitor_dates')} (visitor_id, date) values ($1, $2::date)
         on conflict (visitor_id, date) do update set visitor_id=excluded.visitor_id returning (xmax=0) as inserted`, [visitor, today],
      );
      const uniqueInc = siteVisitorRows[0]?.inserted ? 1 : 0;
      const accessRows = await tx.unsafe<{ id: number }[]>(
        `insert into ${table('access_logs')}
         (ip, ip_masked, path, method, referer, referer_host, user_agent, device_type, browser, os,
          country, country_name, region, city, latitude, longitude, created_at, visitor_id, fingerprint)
         values ($1,$2,$3,'GET',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
        [ip, maskIp(ip), path, referer, refererHost, ua, parsed.device, parsed.browser, parsed.os, geo.country, geo.countryName,
          geo.region, geo.city, geo.latitude, geo.longitude, now, visitorId, fingerprint],
      );
      accessLogId = Number(accessRows[0]?.id || 0);
      await tx.unsafe(
        `update ${table('stats_global')} set total_views=total_views+1, total_uniques=total_uniques+$2,
         first_event_at=case when first_event_at=0 then $1 else first_event_at end, updated_at=$1 where id=1`, [now, uniqueInc],
      );
      await tx.unsafe(
        `insert into ${table('stats_daily')} (date, dimension, dim_value, visits, unique_visitors)
         values ($1::date, '_total', '', 1, $2)
         on conflict (date, dimension, dim_value, dim_extra) do update set
           visits=${table('stats_daily')}.visits+1, unique_visitors=${table('stats_daily')}.unique_visitors+excluded.unique_visitors`,
        [today, uniqueInc],
      );
      for (const [dimension, value, extra] of dimensions) {
        await tx.unsafe(
          `insert into ${table('stats_daily')} (date, dimension, dim_value, dim_extra, visits, unique_visitors)
           values ($1::date,$2,$3,$4,1,$5)
           on conflict (date, dimension, dim_value, dim_extra) do update set
             visits=${table('stats_daily')}.visits+1, unique_visitors=${table('stats_daily')}.unique_visitors+excluded.unique_visitors`,
          [today, dimension, value, extra, uniqueInc],
        );
      }
      if (trackedPostId > 0) {
        await tx.unsafe(
          `update ${table('posts')} set view_count=coalesce(view_count,0)+1 where id=$1 and type='post' and status='publish'`,
          [trackedPostId],
        );
        const postVisitorRows = await tx.unsafe<{ inserted: boolean }[]>(
          `insert into ${table('stats_visitor_post_dates')} (visitor_id, post_id, date) values ($1,$2,$3::date)
           on conflict (visitor_id, post_id, date) do update set visitor_id=excluded.visitor_id returning (xmax=0) as inserted`,
          [visitor, trackedPostId, today],
        );
        await tx.unsafe(
          `insert into ${table('stats_post_daily')} (post_id, date, views, unique_visitors) values ($1,$2::date,1,$3)
           on conflict (post_id, date) do update set views=${table('stats_post_daily')}.views+1,
             unique_visitors=${table('stats_post_daily')}.unique_visitors+excluded.unique_visitors`,
          [trackedPostId, today, postVisitorRows[0]?.inserted ? 1 : 0],
        );
      }
    });
  } catch (error) {
    console.error('[analytics] track write failed', error);
    return { tracked: false, reason: 'write_failed' };
  }
  if (accessLogId && (!geo.country || !geo.latitude || !geo.longitude)) void enrichAccessGeo(accessLogId, ip);
  if (visitor) await ephemeral.set(`online:${visitor}`, JSON.stringify({ visitor_id: visitor, ip, path, ts: now,
    country_code: geo.country, city: geo.city }), 300);
  return { tracked: true };
}

export async function trackDuration(request: Request, input: Record<string, unknown>) {
  const duration = Math.max(0, Math.min(86400, Number(input.duration || 0)));
  const path = String(input.path || '').slice(0, 500);
  if (duration > 0 && path) {
    await exec(
      `update ${table('access_logs')} set duration=greatest(coalesce(duration,0),$1)
       where id=(select id from ${table('access_logs')} where ip=$2 and path=$3 order by created_at desc,id desc limit 1)`,
      [duration, requestIp(request), path],
    ).catch(() => {});
  }
  return null;
}

function gravatar(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized ? `https://gravatar.bluecdn.com/avatar/${createHash('md5').update(normalized).digest('hex')}?s=64&d=mp` : '';
}

export async function publicOnlineVisitors() {
  const enabled = !['0', 'false'].includes((await optionValue('show_online_visitors', '1')).toLowerCase());
  if (!enabled) return { count: 0, online: [], enabled: false };
  const keys = await ephemeral.scan('online:');
  const raw = (await Promise.all(keys.map(async (key) => {
    try { return JSON.parse(await ephemeral.get(key) || '{}') as Record<string, unknown>; } catch { return null; }
  }))).filter(Boolean) as Record<string, unknown>[];
  const online: Record<string, unknown>[] = [];
  for (const item of raw) {
    const visitorId = String(item.visitor_id || '');
    const ip = String(item.ip || '');
    const user: Record<string, unknown> = { visitor_id: visitorId, path: String(item.path || ''), ts: item.ts || 0, ip_masked: maskIp(ip) };
    let comment = visitorId ? await one<{ author_name: string; author_email: string }>(
      `select author_name,coalesce(author_email,'') as author_email from ${table('comments')}
       where visitor_id=$1 and visitor_id!='' order by created_at desc,id desc limit 1`, [visitorId],
    ).catch(() => null) : null;
    if (!comment && ip) comment = await one<{ author_name: string; author_email: string }>(
      `select author_name,coalesce(author_email,'') as author_email from ${table('comments')}
       where author_ip=$1 order by created_at desc,id desc limit 1`, [ip],
    ).catch(() => null);
    if (comment?.author_name) { user.name = comment.author_name; if (comment.author_email) user.avatar = gravatar(comment.author_email); }
    const geo = ip ? await one<{ country: string; country_code: string; city: string }>(
      `select coalesce(country_name,'') as country,coalesce(country,'') as country_code,coalesce(city,'') as city
       from ${table('access_logs')} where ip=$1 and country!='' order by created_at desc,id desc limit 1`, [ip],
    ).catch(() => null) : null;
    user.country = geo?.country || item.country || '';
    user.country_code = geo?.country_code || item.country_code || '';
    user.city = geo?.city || item.city || '';
    online.push(user);
  }
  return { count: online.length, online, enabled: true };
}
