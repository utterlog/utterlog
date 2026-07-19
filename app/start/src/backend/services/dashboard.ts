import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { statfsSync } from 'node:fs';
import { table } from '../config';
import { many, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { archiveStatsPayload, listComments, listPosts } from '../public-read';
import { getHostOsInfo, parsePostgresVersion, resolveHostPublicIp } from '../system/host';
import { appVersion, getCpuPercent, getHostUptimeLabel, getHostUptimeSeconds } from '../system/metrics';

function diskStats(path = '/') {
  try {
    const stat = statfsSync(path);
    const total = Number(stat.blocks) * Number(stat.bsize);
    const free = Number(stat.bavail) * Number(stat.bsize);
    const used = Math.max(0, total - free);
    return { total, free, used, percent: total > 0 ? Math.round((used / total) * 100) : 0, path };
  } catch {
    return { total: 0, free: 0, used: 0, percent: 0, path };
  }
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

export async function systemStatusPayload() {
  const geoProvider = await optionValue('ip_geo_provider', 'ipx');
  const [postCount, commentCount, linkCount, dbVersion, hostIp] = await Promise.all([
    one<{ count: string }>(`select count(*)::text as count from ${table('posts')} where type = 'post'`).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('comments')}`).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('links')}`).catch(() => null),
    one<{ server_version: string }>('show server_version').catch(() => null),
    resolveHostPublicIp(geoProvider),
  ]);
  const osInfo = getHostOsInfo();
  const totalMemory = totalmem();
  const freeMemory = freemem();
  const usedMemory = totalMemory - freeMemory;
  const version = appVersion();
  return {
    status: 'ok',
    time: new Date().toISOString(),
    bun: true,
    version,
    versions: { app: version, bun: Bun.version },
    server: { runtime: `Bun ${Bun.version}`, app: 'utterlog-bun', os: osInfo.label, os_id: osInfo.id,
      os_name: osInfo.name, os_version: osInfo.version, os_icon: osInfo.icon, uptime: getHostUptimeLabel(),
      uptime_seconds: getHostUptimeSeconds(), ip: hostIp.ip, country_code: hostIp.country_code, ip_source: hostIp.source },
    cpu: { cores: cpus().length || 1, percent: getCpuPercent() },
    memory: { total: totalMemory, used: usedMemory, total_gb: Number((totalMemory / 1024 ** 3).toFixed(2)),
      used_gb: Number((usedMemory / 1024 ** 3).toFixed(2)), percent: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0 },
    disk: diskStats('/'),
    load: { avg: loadavg() },
    database: { connected: true, driver: 'postgresql', version: parsePostgresVersion(dbVersion?.server_version || '') },
    cache: { mode: 'memory' },
    counts: { posts: Number(postCount?.count || 0), comments: Number(commentCount?.count || 0), links: Number(linkCount?.count || 0) },
    posts: Number(postCount?.count || 0),
  };
}

export async function adminStatsPayload() {
  const timeZone = await siteTimeZone();
  const today = await siteDate();
  const [archive, links, media, categories, tags, todayVisits, trend] = await Promise.all([
    archiveStatsPayload(),
    one<{ count: string }>(`select count(*)::text as count from ${table('links')}`).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('media')}`).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('metas')} where type = 'category'`).catch(() => null),
    one<{ count: string }>(`select count(*)::text as count from ${table('metas')} where type = 'tag'`).catch(() => null),
    one<{ count: string }>(
      `select count(*)::text as count from ${table('access_logs')}
       where created_at >= extract(epoch from (($2::date)::timestamp at time zone $1))::bigint
         and created_at < extract(epoch from ((($2::date + 1))::timestamp at time zone $1))::bigint`,
      [timeZone, today],
    ).catch(() => null),
    many<Record<string, unknown>>(
      `select to_char(to_timestamp(created_at) at time zone $1, 'MM-DD') as date, count(*)::int as visits,
              count(distinct coalesce(nullif(visitor_id,''), ip))::int as visitors
       from ${table('access_logs')}
       where created_at >= extract(epoch from ((($2::date - 29))::timestamp at time zone $1))::bigint
       group by date order by date asc`, [timeZone, today],
    ).catch(() => []),
  ]);
  return { posts: archive.post_count, comments: archive.comment_count, links: Number(links?.count || 0),
    media: Number(media?.count || 0), categories: Number(categories?.count || 0), tags: Number(tags?.count || 0),
    total_views: archive.total_views, today_visits: Number(todayVisits?.count || 0), total_words: archive.word_count,
    days: archive.days, trend };
}

/**
 * Initial dashboard data in one authenticated request. The admin is commonly
 * reached through a CDN, so collapsing these small reads avoids three extra
 * edge-to-origin round trips without changing any page-level APIs.
 */
export async function adminDashboardPayload() {
  const [stats, posts, comments] = await Promise.all([
    adminStatsPayload(),
    listPosts({ page: 1, perPage: 5, status: 'publish' }),
    listComments({ page: 1, perPage: 15, status: 'approved' }),
  ]);
  return {
    stats,
    recent_posts: posts.data,
    recent_comments: comments.data,
  };
}
