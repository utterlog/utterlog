import { createHash } from 'node:crypto';
import { buildSiteIndex, matchSiteIndex, normalizeSiteHost } from '@shared/link-match';
import { table } from '../config';
import { exec, many, nowUnix } from '../db/helpers';

/**
 * 友链识别。评论者填的网址命中友链库，评论上就带一枚「友链好友」标记。
 *
 * 匹配走进程内缓存而不是 SQL join：友链只有几十条，一次全量读进 Map，
 * 评论列表映射时按域名查表，成本接近零，也不用给每个取评论的地方改 SQL。
 */

export type FriendLink = {
  id: number;
  name: string;
  url: string;
  email: string;
  logo: string;
  /** 抓回来存在本地的站点图标路径，如 /uploads/link-icons/example.com.webp */
  iconUrl: string;
};

/** 给前台的友链标记。**只有名字和站点地址** —— 邮箱不出这个边界。 */
export type FriendBadge = {
  name: string;
  url: string;
};

type IndexSnapshot = {
  index: Map<string, FriendLink>;
  loadedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let snapshot: IndexSnapshot | null = null;
let loading: Promise<IndexSnapshot> | null = null;

async function loadIndex(): Promise<IndexSnapshot> {
  const rows = await many<{ id: number; name: string; url: string; email: string; logo: string; icon_url: string }>(
    `select id, name, coalesce(url,'') as url, coalesce(email,'') as email, coalesce(logo,'') as logo,
            coalesce(icon_url,'') as icon_url
     from ${table('links')} where status = 1 and coalesce(url,'') <> ''`,
  ).catch(() => []);
  const links: FriendLink[] = rows.map((row) => ({
    id: Number(row.id) || 0,
    name: String(row.name || ''),
    url: String(row.url || ''),
    email: String(row.email || ''),
    logo: String(row.logo || ''),
    iconUrl: String(row.icon_url || ''),
  }));
  return { index: buildSiteIndex(links, (link) => link.url), loadedAt: Date.now() };
}

/** 友链索引，5 分钟内复用。并发调用合并成一次查询。 */
export async function friendLinkIndex(): Promise<Map<string, FriendLink>> {
  if (snapshot && Date.now() - snapshot.loadedAt < CACHE_TTL_MS) return snapshot.index;
  if (!loading) {
    loading = loadIndex()
      .then((next) => {
        snapshot = next;
        return next;
      })
      .finally(() => {
        loading = null;
      });
  }
  // 加载失败时宁可用过期快照，也别让评论列表整个塌掉
  return loading.then((next) => next.index).catch(() => snapshot?.index ?? new Map());
}

/** 后台增删改友链后调用，下一次读取重新加载。 */
export function invalidateFriendLinks() {
  snapshot = null;
}

/** 网址命中友链就返回徽章数据，否则 null。 */
export function matchFriendBadge(url: string, index: Map<string, FriendLink>): FriendBadge | null {
  if (!url) return null;
  const hit = matchSiteIndex(url, index);
  return hit ? { name: hit.name, url: hit.url } : null;
}

/**
 * 友链头像，四级降级：
 *
 *   1. logo        —— 手填的，人工设置永远最优先
 *   2. Gravatar    —— 站长本人的头像，比站点图标更像「一个人」
 *   3. icon_url    —— 抓回来存在本地的站点 favicon，给没留邮箱的友链兜底
 *   4. 空          —— 交给前台回落到 favicon 服务（实时，不占本地存储）
 */
export function friendLinkAvatar(link: Partial<Pick<FriendLink, 'email' | 'logo' | 'iconUrl'>>, size = 256): string {
  if (link.logo) return link.logo;
  const email = String(link.email || '').trim().toLowerCase();
  if (email) {
    const hash = createHash('md5').update(email).digest('hex');
    return `https://gravatar.bluecdn.com/avatar/${hash}?s=${size}&d=mp`;
  }
  return String(link.iconUrl || '');
}

export type LinkEmailSuggestion = {
  linkId: number;
  linkName: string;
  linkUrl: string;
  currentEmail: string;
  /** 建议值：出现次数最多的那个邮箱，并列时取评论时间最新的。 */
  suggestedEmail: string;
  /** 该邮箱在这条友链名下出现过几次评论。 */
  commentCount: number;
  /** 最近一次用这个邮箱评论时留的昵称，用来让人一眼认出是谁。 */
  authorName: string;
  /** 同域名下还出现过别的邮箱 —— 需要人工看一眼再存。 */
  conflicting: string[];
};

/**
 * 从历史评论里给友链找邮箱。
 *
 * 只做建议，**不写库** —— 域名匹配再准，把陌生人的邮箱写进友链表也是错的，
 * 得由人确认。域名归一化复用前台那套，保证后台看到的匹配和前台标记一致。
 */
export async function suggestLinkEmails(): Promise<LinkEmailSuggestion[]> {
  const [links, comments] = await Promise.all([
    many<{ id: number; name: string; url: string; email: string }>(
      `select id, name, coalesce(url,'') as url, coalesce(email,'') as email
       from ${table('links')} where status = 1 and coalesce(url,'') <> '' order by order_num asc, id asc`,
    ).catch(() => []),
    many<{ author_url: string; author_email: string; author_name: string; created_at: number }>(
      `select coalesce(author_url,'') as author_url, coalesce(author_email,'') as author_email,
              coalesce(author_name,'') as author_name, coalesce(created_at,0) as created_at
       from ${table('comments')}
       where status = 'approved' and coalesce(author_url,'') <> '' and coalesce(author_email,'') <> ''`,
    ).catch(() => []),
  ]);

  const rows: FriendLink[] = links.map((row) => ({
    id: Number(row.id) || 0,
    name: String(row.name || ''),
    url: String(row.url || ''),
    email: String(row.email || ''),
    logo: '',
    iconUrl: '',
  }));
  const index = buildSiteIndex(rows, (link) => link.url);

  type Tally = { count: number; latestAt: number; authorName: string };
  const perLink = new Map<number, Map<string, Tally>>();
  for (const comment of comments) {
    const hit = matchSiteIndex(String(comment.author_url || ''), index);
    if (!hit) continue;
    const email = String(comment.author_email || '').trim().toLowerCase();
    if (!email) continue;
    let tallies = perLink.get(hit.id);
    if (!tallies) perLink.set(hit.id, (tallies = new Map()));
    const at = Number(comment.created_at) || 0;
    const prev = tallies.get(email);
    if (!prev) tallies.set(email, { count: 1, latestAt: at, authorName: String(comment.author_name || '') });
    else {
      prev.count += 1;
      if (at >= prev.latestAt) {
        prev.latestAt = at;
        prev.authorName = String(comment.author_name || '') || prev.authorName;
      }
    }
  }

  const suggestions: LinkEmailSuggestion[] = [];
  for (const link of rows) {
    const tallies = perLink.get(link.id);
    if (!tallies || tallies.size === 0) continue;
    const ranked = [...tallies.entries()].sort(
      (a, b) => b[1].count - a[1].count || b[1].latestAt - a[1].latestAt,
    );
    const [email, tally] = ranked[0];
    suggestions.push({
      linkId: link.id,
      linkName: link.name,
      linkUrl: link.url,
      currentEmail: link.email,
      suggestedEmail: email,
      commentCount: tally.count,
      authorName: tally.authorName,
      conflicting: ranked.slice(1).map(([other]) => other),
    });
  }
  return suggestions;
}

/** 保存人工确认过的邮箱。空字符串表示清空该条。 */
export async function saveLinkEmails(updates: { linkId: number; email: string }[]): Promise<number> {
  let saved = 0;
  const now = nowUnix();
  for (const update of updates) {
    const id = Number(update.linkId) || 0;
    if (!(id > 0)) continue;
    const email = String(update.email || '').trim().toLowerCase();
    // 存进去的东西会被拿去算 gravatar 并发给前台，格式必须先卡住
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const result = await exec(
      `update ${table('links')} set email = $1, updated_at = $2 where id = $3`,
      [email, now, id],
    ).catch(() => null);
    if (result) saved += 1;
  }
  if (saved > 0) invalidateFriendLinks();
  return saved;
}

export { normalizeSiteHost };

/**
 * 友链各站「最后更新时间」，key 是 rss_url，value 是 unix 秒。
 *
 * 数据是现成的，这里不发任何外部请求：links.rss_url 由 mirrorLinkSubscriptions()
 * 同步成 rss_subscriptions，feed-cron 每 6 小时抓一次写进 feed_items，
 * 这里只是把已抓到的条目按订阅聚合出最大发布时间。
 *
 * 一条 group by 查完，不能每行查一次 —— 几十条友链就是几十个来回。
 * 抽在这里是因为 SSR（public-read）和 REST（content-records）两条路径都要用，
 * 各写一份迟早漂移。
 */
export async function lastPostAtByFeed(feedUrls: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const feeds = Array.from(new Set(feedUrls.map((url) => String(url || '').trim()).filter(Boolean)));
  if (!feeds.length) return result;
  const rows = await many<{ feed_url: string; last_post_at: string }>(
    `select rs.feed_url, max(fi.pub_date)::text as last_post_at
       from ${table('rss_subscriptions')} rs
       join ${table('feed_items')} fi on fi.subscription_id = rs.id
      where rs.feed_url = any($1::text[])
      group by rs.feed_url`,
    [feeds],
  ).catch(() => []);
  for (const row of rows) {
    const at = Number(row.last_post_at || 0);
    if (at > 0) result.set(String(row.feed_url), at);
  }
  return result;
}
