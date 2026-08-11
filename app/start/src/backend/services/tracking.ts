import { createHash } from 'node:crypto';
import { isBotUa } from '../bot-detect';
import { table } from '../config';
import { sql } from '../db/client';
import { exec, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { lookupGeoIp } from '../geoip';
import { requestIp } from '../request-ip';
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

export type ReadVisitor = { ip: string; ua: string };

export function readVisitorFromRequest(request: Request): ReadVisitor {
  return { ip: requestIp(request), ua: request.headers.get('user-agent') || '' };
}

/**
 * 文章阅读量的唯一写入口：文章详情页 SSR 读取时同步 +1，渲染出来的数字
 * 就是这次访问之后的值。放在服务端而不是浏览器 /track 里，是因为 /track
 * 要等页面渲染完才发出，当前这一屏永远看不到自己这次访问。
 *
 * 口径是「页面加载量」，跟 PV 一样：点进来算一次，刷新一次算一次，同一个
 * 人反复看也一次次累加，不做时间窗口去重 —— 站长要的就是这篇文章被打开
 * 过多少次。唯一挡掉的是爬虫 UA。想看「多少人看过」用 unique_visitors，
 * 那一列仍然按 (读者, 文章, 天) 去重。
 *
 * 之所以敢不去重：站内指向文章的链接一律走 PostLink（prefetch 默认关），
 * 鼠标划过不会触发 loader；公开页也没挂 CDN 缓存。所以一次 +1 就对应一次
 * 真实的页面加载。往后要给文章链接开预取的话，这里得跟着重新考虑。
 *
 * 累计数（posts.view_count）和按天明细（stats_post_daily）都只从这里写，
 * 同一次判定写两处，所以两个数字必然对得上：按天明细求和等于本站自己数
 * 出来的阅读量，view_count 在此之上还含 WordPress 等外站导入时带进来的
 * 历史基线。/track 不再碰任何文章维度的统计，只负责访客明细和全站 PV。
 */
export async function bumpPostViewOnRead(postId: number, visitor: ReadVisitor) {
  if (!(postId > 0) || isBotUa(visitor.ua)) return false;
  const updated = await exec(
    `update ${table('posts')} set view_count=coalesce(view_count,0)+1 where id=$1 and type='post' and status='publish'`,
    [postId],
  ).catch((error) => {
    console.error('[analytics] post view bump failed', error);
    return null;
  });
  if (!(Number((updated as { count?: number } | null)?.count || 0) > 0)) return false;
  await recordPostReadDaily(postId, `${visitor.ip}\0${visitor.ua}`);
  return true;
}

/**
 * 按天明细跟着累计数一起落库。views 和累计数同步 +1（每次加载都算），
 * unique_visitors 则按 (读者, 文章, 天) 去重，所以同一个人今天刷十次是
 * views +10、unique_visitors +1。
 *
 * SSR 阶段拿不到浏览器 localStorage 里的 visitor_id（那是 /track 才有的
 * 东西），所以读者身份按 ip+ua 的哈希算 —— 换来的是不依赖 JS，装了拦截
 * 插件的访问也照样算进来。
 *
 * 明细写失败不回滚累计数：卡片上的数字比一张统计表更要紧，老库缺表
 * 或缺唯一索引时不该把阅读量一起拖掉。
 */
async function recordPostReadDaily(postId: number, readerKey: string) {
  const date = await siteDate();
  const visitorKey = createHash('sha256').update(readerKey).digest('hex').slice(0, 40);
  const firstToday = await one<{ inserted: boolean }>(
    `insert into ${table('stats_visitor_post_dates')} (visitor_id, post_id, date) values ($1,$2,$3::date)
     on conflict (visitor_id, post_id, date) do update set visitor_id=excluded.visitor_id returning (xmax=0) as inserted`,
    [visitorKey, postId, date],
  ).catch(() => null);
  await exec(
    `insert into ${table('stats_post_daily')} (post_id, date, views, unique_visitors) values ($1,$2::date,1,$3)
     on conflict (post_id, date) do update set views=${table('stats_post_daily')}.views+1,
       unique_visitors=${table('stats_post_daily')}.unique_visitors+excluded.unique_visitors`,
    [postId, date, firstToday?.inserted ? 1 : 0],
  ).catch((error) => {
    console.error('[analytics] post daily stats write failed', error);
  });
}

/**
 * 全站浏览量：公开页每渲染一次 +1，口径跟文章阅读量完全一致 —— 打开算一次、
 * 刷新算一次，不去重也不限流，只挡爬虫 UA。
 *
 * 从 /track 挪到 SSR 这一侧的原因有两个：一是浏览器上报要等 JS 跑起来，关了
 * JS 或被拦截插件挡掉的访问统统漏计；二是 /track 那条链路带 30 秒去重和频率
 * 封禁，同一个人连刷十次只算一次，跟「刷新就 +1」的口径对不上。
 *
 * 不 await：页脚那个数字是前端单独请求 /archive/stats 拿的，不参与本次 SSR
 * 渲染，没必要让一次计数写入拖慢首屏。写失败只打日志。
 *
 * 唯一访客数（total_uniques）仍由 /track 负责 —— 那个要靠浏览器 localStorage
 * 里的 visitor_id 才能去重，服务端拿不到。
 */
export function bumpSiteViewOnRender(ua: string) {
  if (isBotUa(ua)) return;
  void exec(
    `update ${table('stats_global')} set total_views = total_views + 1, updated_at = $1 where id = 1`,
    [nowUnix()],
  ).catch((error) => {
    console.error('[analytics] site view bump failed', error);
  });
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
      // total_views 已改由 SSR 渲染时累加（见 bumpSiteViewOnRender），这里只
      // 记唯一访客 —— 那个要靠浏览器的 visitor_id 去重，服务端拿不到。两边
      // 各写各的字段，不会双计。
      await tx.unsafe(
        `update ${table('stats_global')} set total_uniques=total_uniques+$2,
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

/**
 * 页脚的「N 人在线」。
 *
 * 只回人数。原来还逐个反查访客身份（按 visitor_id / IP 去 comments 表找昵称和
 * 邮箱）再查一次 access_logs 拿归属地，拼成明细列表给前台弹层展示 —— 那等于
 * 把每个在线访客的昵称、脱敏 IP、所在城市、**当前正在看哪一页**都公开给所有人。
 * 前台已经不展示明细，这些查询（每位访客 2-3 条 SQL）也一并省掉。
 *
 * online 字段保留成空数组，是为了老前端拿到 d.online 时不会炸。
 */
export async function publicOnlineVisitors() {
  const enabled = !['0', 'false'].includes((await optionValue('show_online_visitors', '1')).toLowerCase());
  if (!enabled) return { count: 0, online: [], enabled: false };
  const keys = await ephemeral.scan('online:');
  return { count: keys.length, online: [], enabled: true };
}
