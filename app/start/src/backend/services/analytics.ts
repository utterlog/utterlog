import { createHash } from 'node:crypto';
import { table } from '../config';
import { many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { lookupGeoIp, normalizeGeoProvider } from '../geoip';
import { requestIp } from '../request-ip';
import { ephemeral } from '../store/ephemeral';

export const analyticsPeriods = ['24h', '7d', '30d', 'year', '365d', 'all'] as const;
export type AnalyticsPeriod = typeof analyticsPeriods[number];

export class AnalyticsServiceError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function analyticsPeriod(value: string | null): AnalyticsPeriod {
  return analyticsPeriods.includes(value as AnalyticsPeriod) ? value as AnalyticsPeriod : '24h';
}

async function siteTimeZone() {
  return (await optionValue('site_timezone', 'UTC')).trim() || 'UTC';
}

async function siteDate(value = new Date()) {
  const timeZone = await siteTimeZone();
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

async function periodStart(period: AnalyticsPeriod) {
  const now = nowUnix();
  if (period === 'all') return 0;
  if (period === 'year') {
    const timeZone = await siteTimeZone();
    const date = await siteDate(new Date(now * 1000));
    const year = Number(date.slice(0, 4)) || new Date().getUTCFullYear();
    const row = await one<{ ts: string }>(
      `select extract(epoch from ($1::date::timestamp at time zone $2))::bigint::text as ts`, [`${year}-01-01`, timeZone],
    ).catch(() => null);
    return Number(row?.ts || 0) || Math.floor(Date.UTC(year, 0, 1) / 1000);
  }
  if (period === '365d') return now - 365 * 86400;
  if (period === '30d') return now - 30 * 86400;
  if (period === '7d') return now - 7 * 86400;
  return now - 86400;
}

async function analyticsWhere(period: AnalyticsPeriod) {
  const start = await periodStart(period);
  return { sql: start > 0 ? 'where created_at >= $1' : '', params: start > 0 ? [start] : [] as unknown[] };
}

async function rollupWindow(period: AnalyticsPeriod) {
  const startUnix = await periodStart(period);
  const cutoffUnix = nowUnix() - 90 * 86400;
  return { startUnix, rawStart: startUnix > 0 ? Math.max(startUnix, cutoffUnix) : cutoffUnix,
    startDate: startUnix > 0 ? await siteDate(new Date(startUnix * 1000)) : '',
    cutoffDate: await siteDate(new Date(cutoffUnix * 1000)) };
}

async function visitsForPeriod(period: AnalyticsPeriod, global: { views: string; uniques: string } | null) {
  if (period === 'all' && global) return Number(global.views || 0);
  if (!['year', '365d'].includes(period)) {
    const where = await analyticsWhere(period);
    const row = await one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')} ${where.sql}`, where.params);
    return Number(row?.count || 0);
  }
  const window = await rollupWindow(period);
  const [aggregated, raw] = await Promise.all([
    one<{ count: string }>(
      `select coalesce(sum(visits),0)::text as count from ${table('stats_daily')}
       where dimension = '_total' and date >= $1::date and date < $2::date`, [window.startDate, window.cutoffDate],
    ).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')} where created_at >= $1`, [window.rawStart]).catch(() => null),
  ]);
  return Number(aggregated?.count || 0) + Number(raw?.count || 0);
}

async function longDimensionRows(dimension: string, rawColumn: string, period: AnalyticsPeriod, limit = 20) {
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
     from ${table('stats_daily')} where ${dailyWhere} group by name`, dailyParams,
  ).catch(() => []);
  const rawRows = await many<{ name: string; count: string }>(
    `select coalesce(nullif(${rawColumn},''), 'Unknown') as name, count(*)::text as count
     from ${table('access_logs')} where created_at >= $1 group by name`, [window.rawStart],
  ).catch(() => []);
  for (const row of [...dailyRows, ...rawRows]) merged.set(row.name, (merged.get(row.name) || 0) + Number(row.count || 0));
  const total = [...merged.values()].reduce((sum, count) => sum + count, 0) || 1;
  return [...merged.entries()].map(([name, count]) => ({ name, count, ratio: Number((count / total).toFixed(4)) }))
    .sort((a, b) => b.count - a.count).slice(0, limit);
}

async function dimensionRows(column: string, period: AnalyticsPeriod, limit = 20) {
  const allowed = new Set(['browser', 'os', 'device_type', 'country_name', 'country', 'referer_host', 'path']);
  if (!allowed.has(column)) return [];
  if (['year', '365d', 'all'].includes(period) && ['browser', 'os', 'device_type'].includes(column)) {
    return longDimensionRows(column === 'device_type' ? 'device' : column, column, period, limit);
  }
  const where = await analyticsWhere(period);
  const rows = await many<{ name: string; count: string }>(
    `select coalesce(nullif(${column},''), 'Unknown') as name, count(*)::text as count
     from ${table('access_logs')} ${where.sql} group by name order by count(*) desc limit ${limit}`, where.params,
  ).catch(() => []);
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  return rows.map((row) => ({ name: row.name, count: Number(row.count || 0), ratio: Number((Number(row.count || 0) / total).toFixed(4)) }));
}

async function countryRows(period: AnalyticsPeriod, limit = 20) {
  if (['year', '365d', 'all'].includes(period)) {
    const window = await rollupWindow(period);
    const merged = new Map<string, { name: string; code: string; count: number }>();
    const dailyParams: unknown[] = ['country', window.cutoffDate];
    let dailyWhere = `dimension = $1 and date < $2::date`;
    if (window.startDate) { dailyParams.push(window.startDate); dailyWhere += ` and date >= $${dailyParams.length}::date`; }
    const dailyRows = await many<{ name: string; code: string; count: string }>(
      `select coalesce(nullif(dim_value,''), 'Unknown') as name, coalesce(nullif(dim_extra,''), '') as code,
       coalesce(sum(visits),0)::text as count from ${table('stats_daily')} where ${dailyWhere} group by name, code`, dailyParams,
    ).catch(() => []);
    const rawRows = await many<{ name: string; code: string; count: string }>(
      `select coalesce(nullif(country_name,''), nullif(country,''), 'Unknown') as name, coalesce(nullif(country,''), '') as code,
       count(*)::text as count from ${table('access_logs')} where created_at >= $1 group by name, code`, [window.rawStart],
    ).catch(() => []);
    for (const row of [...dailyRows, ...rawRows]) {
      const key = `${row.name}\0${row.code}`;
      const current = merged.get(key) || { name: row.name, code: row.code, count: 0 };
      current.count += Number(row.count || 0);
      merged.set(key, current);
    }
    const total = [...merged.values()].reduce((sum, row) => sum + row.count, 0) || 1;
    return [...merged.values()].map((row) => ({ ...row, ratio: Number((row.count / total).toFixed(4)) }))
      .sort((a, b) => b.count - a.count).slice(0, limit);
  }
  const where = await analyticsWhere(period);
  const rows = await many<{ name: string; code: string; count: string }>(
    `select coalesce(nullif(country_name,''), nullif(country,''), 'Unknown') as name,
     coalesce(nullif(country,''), '') as code, count(*)::text as count from ${table('access_logs')} ${where.sql}
     group by name, code order by count(*) desc limit ${limit}`, where.params,
  ).catch(() => []);
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  return rows.map((row) => ({ name: row.name, code: row.code, count: Number(row.count || 0), ratio: Number((Number(row.count || 0) / total).toFixed(4)) }));
}

function gravatar(email: string, size = 64) {
  const normalized = email.trim().toLowerCase();
  return normalized ? `https://gravatar.bluecdn.com/avatar/${createHash('md5').update(normalized).digest('hex')}?s=${size}&d=mp` : '';
}

export async function analyticsOverview(period: AnalyticsPeriod) {
  const where = await analyticsWhere(period);
  const timeZone = await siteTimeZone();
  const global = period === 'all' ? await one<{ views: string; uniques: string }>(
    `select coalesce(total_views,0)::text as views, coalesce(total_uniques,0)::text as uniques from ${table('stats_global')} where id = 1`,
  ).catch(() => null) : null;
  const longVisitors = ['year', '365d'].includes(period) ? await one<{ count: string }>(
    `select count(distinct visitor_id)::text as count from ${table('stats_visitor_dates')} where date >= to_timestamp($1)::date`,
    [await periodStart(period)],
  ).catch(() => null) : null;
  const [visits, visitors, pages, topPages, topReferers, hourly, daily, recent] = await Promise.all([
    visitsForPeriod(period, global),
    one<{ count: string }>(`select count(distinct coalesce(nullif(visitor_id,''), ip))::text as count from ${table('access_logs')} ${where.sql}`, where.params),
    one<{ count: string }>(`select count(distinct path)::text as count from ${table('access_logs')} ${where.sql}`, where.params),
    many<Record<string, unknown>>(`select path, count(*)::int as count from ${table('access_logs')} ${where.sql} group by path order by count(*) desc limit 10`, where.params),
    many<Record<string, unknown>>(`select referer_host as host, count(*)::int as count from ${table('access_logs')} ${where.sql ? `${where.sql} and referer_host != ''` : `where referer_host != ''`} group by referer_host order by count(*) desc limit 10`, where.params),
    many<Record<string, unknown>>(`select to_char(to_timestamp(created_at) at time zone $1, 'HH24') as hour, count(*)::int as count from ${table('access_logs')} where created_at >= $2 group by hour order by hour`, [timeZone, nowUnix() - 86400]),
    many<Record<string, unknown>>(`select to_char(to_timestamp(created_at) at time zone $1, 'MM-DD') as date, count(*)::int as count from ${table('access_logs')} where created_at >= $2 group by date order by date`, [timeZone, nowUnix() - 30 * 86400]),
    many<Record<string, unknown>>(`select ip_masked as ip, path, browser, os, device_type as device, country_name as country, created_at from ${table('access_logs')} order by created_at desc, id desc limit 20`),
  ]);
  return { summary: { total_visits: visits, unique_ips: Number((period === 'all' && global ? global.uniques : longVisitors?.count) || visitors?.count || 0),
    unique_pages: Number(pages?.count || 0) }, top_pages: topPages, top_referers: topReferers,
    browsers: await dimensionRows('browser', period, 10), os: await dimensionRows('os', period, 10),
    devices: await dimensionRows('device_type', period, 10), countries: await countryRows(period), hourly, daily, recent };
}

export async function onlineVisitors() {
  const keys = await ephemeral.scan('online:');
  const raw = (await Promise.all(keys.map(async (key) => {
    try { return JSON.parse(await ephemeral.get(key) || '{}') as Record<string, unknown>; } catch { return null; }
  }))).filter(Boolean) as Record<string, unknown>[];
  const result: Record<string, unknown>[] = [];
  for (const item of raw) {
    const visitorId = String(item.visitor_id || '');
    const ip = String(item.ip || '');
    const user: Record<string, unknown> = { visitor_id: visitorId, path: String(item.path || ''), ts: item.ts || 0, ip };
    let comment = visitorId ? await one<{ author_name: string; author_email: string }>(
      `select author_name, coalesce(author_email,'') as author_email from ${table('comments')}
       where visitor_id = $1 and visitor_id != '' order by created_at desc, id desc limit 1`, [visitorId],
    ).catch(() => null) : null;
    if (!comment && ip) comment = await one<{ author_name: string; author_email: string }>(
      `select author_name, coalesce(author_email,'') as author_email from ${table('comments')} where author_ip = $1 order by created_at desc, id desc limit 1`, [ip],
    ).catch(() => null);
    if (comment?.author_name) { user.name = comment.author_name; if (comment.author_email) user.avatar = gravatar(comment.author_email); }
    const geo = ip ? await one<{ country: string; country_code: string; city: string }>(
      `select coalesce(country_name,'') as country, coalesce(country,'') as country_code, coalesce(city,'') as city
       from ${table('access_logs')} where ip = $1 and country != '' order by created_at desc, id desc limit 1`, [ip],
    ).catch(() => null) : null;
    user.country = geo?.country || item.country || '';
    user.country_code = geo?.country_code || item.country_code || '';
    user.city = geo?.city || item.city || '';
    result.push(user);
  }
  return result;
}

export async function analyticsVisitors(options: { page?: number; perPage?: number } = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(options.perPage || 20)));
  const offset = (page - 1) * perPage;
  const cutoff = nowUnix() - 7 * 86400;
  const pageFilter = `path <> '' and path like '/%' and path not like '/api/%' and path not like '/admin%'
    and path not like '/uploads/%' and path not like '/assets/%' and path not like '/themes/%' and path not like '/static/%'
    and path not like '/.well-known/%' and path not like '/wp-%'
    and path not in ('/feed','/feed/','/rss','/rss/','/rss.xml','/atom.xml','/xmlrpc.php','/favicon.ico','/robots.txt','/sitemap.xml','/manifest.json','/ads.txt')
    and path !~ '\\.[A-Za-z0-9]{1,8}$' and created_at >= $1`;
  const cte = `with page_logs as (
      select id, ip, ip_masked, path, referer_host, browser, browser_version, os, os_version, device_type,
       country_name, country, region, city, duration, visitor_id, fingerprint, created_at,
       coalesce(nullif(fingerprint,''), nullif(visitor_id,''), nullif(ip,''), id::text) as visitor_key
      from ${table('access_logs')} where ${pageFilter}),
    ordered as (select *, lag(created_at) over (partition by visitor_key order by created_at,id) as prev_created_at from page_logs),
    marked as (select *, case when prev_created_at is null or created_at-prev_created_at>1800 then 1 else 0 end as new_session from ordered),
    sessions as (select *, sum(new_session) over (partition by visitor_key order by created_at,id) as session_no from marked),
    latest_session as (select *, max(session_no) over (partition by visitor_key) as latest_session_no,
      max(created_at) over (partition by visitor_key,session_no) as session_last_at from sessions),
    session_rows as (select *, min(created_at) over (partition by visitor_key,session_no) as session_start_at,
      max(created_at) over (partition by visitor_key,session_no) as session_end_at,
      greatest(coalesce(sum(case when coalesce(duration,0)>0 then duration else 0 end) over (partition by visitor_key,session_no),0),
       max(created_at) over (partition by visitor_key,session_no)-min(created_at) over (partition by visitor_key,session_no))::int as session_duration,
      row_number() over (partition by visitor_key,session_no order by created_at,id) as entry_rank from latest_session),
    entry_logs as (select id,ip,ip_masked,path,referer_host,browser,browser_version,os,os_version,device_type,country_name,country,
      region,city,session_duration as duration,visitor_id,fingerprint,session_start_at as created_at,session_end_at as session_last_at,
      visitor_key,session_no,entry_rank from session_rows where session_no=latest_session_no and entry_rank=1)`;
  const totalRow = await one<{ count: string }>(`${cte} select count(*)::text as count from entry_logs where entry_rank=1`, [cutoff]);
  const total = Math.min(Number(totalRow?.count || 0), 1000);
  if (offset >= total) return { rows: [], meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
  const rows = await many<Record<string, unknown>>(
    `${cte} select e.id,e.ip,e.ip_masked,e.path,e.referer_host as referer,e.browser,e.browser_version,e.os,e.os_version,
     e.device_type as device,e.country_name as country,e.country as country_code,e.region,e.city,coalesce(e.duration,0) as duration,
     e.visitor_id,e.fingerprint,e.created_at,cm.author_name,cm.author_email from entry_logs e
     left join lateral (select author_name,author_email from ${table('comments')} c
       where (e.visitor_id!='' and c.visitor_id=e.visitor_id) or (e.ip!='' and host(c.author_ip)=e.ip)
       order by case when e.visitor_id!='' and c.visitor_id=e.visitor_id then 0 else 1 end,c.created_at desc,c.id desc limit 1) cm on true
     where e.entry_rank=1 order by e.session_last_at desc,e.id desc limit $2 offset $3`,
    [cutoff, Math.min(perPage, 1000 - offset), offset],
  ).catch(() => []);
  return { rows: rows.map((row) => ({ ...row, author_avatar: gravatar(String(row.author_email || '')) })),
    meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function analyticsLogs(options: { page?: number; perPage?: number } = {}) {
  const page = Math.max(1, Math.floor(options.page || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(options.perPage || 20)));
  const totalRow = await one<{ count: string }>(`select count(*)::text as count from ${table('access_logs')}`);
  const rows = await many<Record<string, unknown>>(
    `select * from ${table('access_logs')} order by created_at desc,id desc limit $1 offset $2`, [perPage, (page - 1) * perPage],
  );
  const total = Number(totalRow?.count || 0);
  return { rows, meta: { total, page, per_page: perPage, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function analyticsGeoIp(ip: string, providerValue = '') {
  const provider = normalizeGeoProvider(providerValue || await optionValue('ip_geo_provider', 'ipx'));
  const geo = await lookupGeoIp(ip, provider, 5000);
  return geo || { provider, ip, country_code: '', country: '', province: '', city: '', latitude: 0, longitude: 0, unavailable: true };
}

export async function visitorGeo(ip: string) {
  const provider = await optionValue('ip_geo_provider', 'ipx');
  const geo = await lookupGeoIp(ip, provider, 3000);
  return {
    country_code: geo?.country_code || '',
    country: geo?.country || '',
    province: geo?.province || '',
    city: geo?.city || '',
    provider: geo?.provider || '',
  };
}

export async function analyticsMap(period: AnalyticsPeriod) {
  const where = await analyticsWhere(period);
  const whereSql = where.sql
    ? `${where.sql} and (coalesce(country,'')!='' or coalesce(city,'')!='' or coalesce(latitude,0)!=0 or coalesce(longitude,0)!=0)`
    : `where coalesce(country,'')!='' or coalesce(city,'')!='' or coalesce(latitude,0)!=0 or coalesce(longitude,0)!=0`;
  const rows = await many<Record<string, unknown>>(
    `select country,country_name,region,city,latitude,longitude,count(*)::int as count from ${table('access_logs')} ${whereSql}
     group by country,country_name,region,city,latitude,longitude order by count(*) desc limit 500`, where.params,
  ).catch(() => []);
  const points = rows.map((row) => ({ lat: Number(row.latitude || 0), lon: Number(row.longitude || 0),
    country: String(row.country_name || ''), city: String(row.city || ''), region: String(row.region || ''),
    code: String(row.country || ''), count: Number(row.count || 0) }));
  return { points, rows };
}

export async function analyticsBreakdown(period: AnalyticsPeriod, dimension: string) {
  if (!['browser', 'os', 'device', 'country', 'all'].includes(dimension)) {
    throw new AnalyticsServiceError(400, 'VALIDATION_ERROR', 'dimension 必须是 browser / os / device / country / all 之一');
  }
  const where = await analyticsWhere(period);
  const global = period === 'all' ? await one<{ views: string; uniques: string }>(
    `select coalesce(total_views,0)::text as views,coalesce(total_uniques,0)::text as uniques from ${table('stats_global')} where id=1`,
  ).catch(() => null) : null;
  const visits = await visitsForPeriod(period, global);
  const uniqueVisitors = ['year', '365d'].includes(period) ? await one<{ count: string }>(
    `select count(distinct visitor_id)::text as count from ${table('stats_visitor_dates')} where date>=to_timestamp($1)::date`, [await periodStart(period)],
  ) : await one<{ count: string }>(
    `select count(distinct coalesce(nullif(visitor_id,''),ip))::text as count from ${table('access_logs')} ${where.sql}`, where.params,
  );
  const result: Record<string, unknown> = { period, visits, unique_visitors: Number(global?.uniques || uniqueVisitors?.count || 0) };
  if (dimension === 'browser' || dimension === 'all') result.browsers = await dimensionRows('browser', period);
  if (dimension === 'os' || dimension === 'all') result.os = await dimensionRows('os', period);
  if (dimension === 'device' || dimension === 'all') result.devices = await dimensionRows('device_type', period);
  if (dimension === 'country' || dimension === 'all') result.countries = await countryRows(period);
  return result;
}

export { requestIp };
