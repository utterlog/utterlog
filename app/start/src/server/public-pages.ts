import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import type { ThemeContextData } from '@/lib/theme-context';
import { datePartsInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import {
  getPostBySlug,
  getOptionsMap,
  getVisitorWeather,
  listMoments,
  listPosts,
  listPublicContent,
  listPublicFootprints,
  loadHomePageDataDirect,
  resolvePublicPostPath,
  searchPublicPosts,
} from '@backend/public-read';
import { requestIp } from '@backend/request-ip';
import { bumpSiteViewOnRender, type ReadVisitor } from '@backend/services/tracking';
import { loadStartThemeContextDirect } from './theme';

export type PublicPageRequest =
  | { kind: 'home'; page?: number }
  | { kind: 'post' | 'film'; slug: string }
  | { kind: 'archives' | 'categories' | 'tags' | 'about' | 'footprints' | 'moments' | 'links' | 'feeds' | 'albums' | 'music' }
  | { kind: 'category' | 'tag'; slug: string }
  | { kind: 'search'; query?: string }
  | { kind: 'shelf'; shelf: 'movies' | 'books' | 'games' | 'goods' }
  | { kind: 'films'; page?: number; videoType?: string; year?: string; region?: string }
  | { kind: 'date'; year: number; month?: number; day?: number }
  | { kind: 'permalink'; pathname: string };

const staticPageKinds = new Set([
  'archives', 'categories', 'tags', 'about', 'footprints',
  'moments', 'links', 'feeds', 'albums', 'music',
]);
const shelfKinds = new Set(['movies', 'books', 'games', 'goods']);

function requestText(value: unknown, maxLength: number, required = false) {
  if (typeof value !== 'string') {
    if (!required && value == null) return '';
    throw new TypeError('Invalid public page request');
  }
  const text = value.slice(0, maxLength);
  if (required && !text.trim()) throw new TypeError('Invalid public page request');
  return text;
}

function requestInteger(value: unknown, minimum: number, maximum: number, fallback?: number) {
  if (value == null && fallback !== undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new TypeError('Invalid public page request');
  }
  return number;
}

/**
 * 校验后的请求，额外带一个 preload 标记。
 *
 * 这个标记只用来决定「算不算一次浏览」，不参与任何取数逻辑，所以客户端能
 * 伪造也无所谓 —— 想刷浏览量直接 curl 更省事。
 */
export type ValidatedPublicPageRequest = PublicPageRequest & { preload?: boolean };

export function validatePublicPageRequest(input: unknown): ValidatedPublicPageRequest {
  const preload = Boolean((input as Record<string, unknown> | null)?.preload);
  return { ...validatePublicPageKind(input), preload };
}

function validatePublicPageKind(input: unknown): PublicPageRequest {
  if (!input || typeof input !== 'object') throw new TypeError('Invalid public page request');
  const value = input as Record<string, unknown>;
  const kind = requestText(value.kind, 32, true);

  if (staticPageKinds.has(kind)) return { kind } as PublicPageRequest;
  if (kind === 'home') return { kind, page: requestInteger(value.page, 1, 100_000, 1) };
  if (kind === 'post' || kind === 'film') return { kind, slug: requestText(value.slug, 500, true) };
  if (kind === 'category' || kind === 'tag') return { kind, slug: requestText(value.slug, 500, true) };
  if (kind === 'search') return { kind, query: requestText(value.query, 200) };
  if (kind === 'shelf') {
    const shelf = requestText(value.shelf, 16, true);
    if (!shelfKinds.has(shelf)) throw new TypeError('Invalid public page request');
    return { kind, shelf: shelf as Extract<PublicPageRequest, { kind: 'shelf' }>['shelf'] };
  }
  if (kind === 'films') {
    return {
      kind,
      page: requestInteger(value.page, 1, 100_000, 1),
      videoType: requestText(value.videoType, 32),
      year: requestText(value.year, 16),
      region: requestText(value.region, 80),
    };
  }
  if (kind === 'date') {
    return {
      kind,
      year: requestInteger(value.year, 1970, 9999),
      month: value.month == null ? undefined : requestInteger(value.month, 1, 12),
      day: value.day == null ? undefined : requestInteger(value.day, 1, 31),
    };
  }
  if (kind === 'permalink') {
    const pathname = requestText(value.pathname, 2048, true);
    if (!pathname.startsWith('/')) throw new TypeError('Invalid public page request');
    return { kind, pathname };
  }
  throw new TypeError('Invalid public page request');
}

const API_WAIT_MS = 1500;

function dataOf<T>(response: unknown, fallback: T): T {
  if (!response || typeof response !== 'object') return fallback;
  const value = (response as { data?: unknown }).data;
  return value === undefined ? response as T : value as T;
}

/**
 * head() 生成 <title> 需要的最小站点信息。
 *
 * 这里只带 title / subtitle，是因为完整的 ThemeContext 已经由 __root 的
 * loader 提供了。两个 loader 各返回一份 ctx 的话，SSR 会把 menus、
 * categories、tags、archiveStats（含整年 heatmap）、options 整份序列化
 * 两遍 —— 实测文章页 101.6 KB 的 HTML 里有 79.3 KB 是注水脚本，而真实
 * DOM 只有 259 个元素。gzip 能把重复内容压得很小，但浏览器解析这 79 KB
 * 并构建两份对象的开销压不掉，那正是 hydration 卡顿的来源。
 *
 * 客户端组件要用完整 ctx 的，从 __root 的 loaderData 读（见 PublicPage）。
 * head() 拿不到别的路由的 loaderData，所以才在这里留一份最小副本。
 */
export type PublicPageSite = { title: string; subtitle: string };

export type PublicPageBody =
  | { kind: 'not-found'; pathname: string }
  | { kind: 'home'; posts: any[]; page: number; totalPages: number; latestMoment: any | null; latestComments: any[]; perPage: number }
  | { kind: 'post'; post: any }
  | { kind: 'archives'; posts: any[] }
  | { kind: 'categories' }
  | { kind: 'category'; category: any; posts: any[] }
  | { kind: 'tags' }
  | { kind: 'tag'; tag: any; posts: any[] }
  | { kind: 'about' }
  | { kind: 'footprints'; rows: any[] }
  | { kind: 'moments'; moments: any[]; tags: string[]; fetchedAt: number }
  | { kind: 'client'; page: 'links' | 'feeds' | 'albums' | 'music'; items?: any[] }
  | { kind: 'shelf'; shelf: 'movies' | 'books' | 'games' | 'goods'; items: any[] }
  | { kind: 'search'; query: string; results: any[]; mode: string; total: number; timeZone: string }
  | { kind: 'films'; items: any[]; total: number; page: number; perPage: number; totalPages: number; filters: Record<string, string> }
  | { kind: 'date'; posts: any[]; year: number; month?: number; day?: number; timeZone: string };

export type PublicPageData = PublicPageBody & { site: PublicPageSite };

function normalizePath(pathname: string) {
  const raw = pathname || '/';
  const pathOnly = raw.split('?')[0] || '/';
  return pathOnly.replace(/\/+$/, '') || '/';
}

function decodePathSegment(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function normalizeText(input: string, lower = false) {
  let value = input;
  try { value = decodeURIComponent(value); } catch {}
  value = value.normalize('NFC').trim();
  return lower ? value.toLowerCase() : value;
}

function matchBySlugOrName(items: any[], slug: string, lower = false) {
  const needle = normalizeText(slug, lower);
  return items.find((item: any) => (
    normalizeText(String(item?.slug || ''), lower) === needle ||
    normalizeText(String(item?.name || ''), lower) === needle
  ));
}

async function safe<T>(promise: Promise<T>, fallback: T, ms = API_WAIT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function momentTags(moments: any[]) {
  const seen = new Set<string>();
  for (const item of moments) {
    const mood = String(item?.mood || '').trim();
    if (mood) seen.add(mood);
    if (seen.size >= 8) break;
  }
  return Array.from(seen);
}

function emptyPostList(page = 1, perPage = 20) {
  return {
    data: [] as any[],
    meta: { total: 0, page, per_page: perPage, total_pages: 1 },
    pagination: { total: 0, page, per_page: perPage, total_pages: 1 },
  };
}

function emptyMomentList(page = 1, perPage = 20) {
  return {
    data: { moments: [] as any[], total: 0 },
    meta: { total: 0, page, per_page: perPage, total_pages: 1 },
    pagination: { total: 0, page, per_page: perPage, total_pages: 1 },
  };
}

function emptyContentList(page = 1, perPage = 20) {
  return {
    data: [] as Record<string, unknown>[],
    meta: { total: 0, page, per_page: perPage, total_pages: 1 },
    pagination: { total: 0, page, per_page: perPage, total_pages: 1 },
  };
}

async function themeCtx() {
  return safe(loadStartThemeContextDirect(), null);
}

async function optionsFallback() {
  return safe(getOptionsMap(), {});
}

function visitorIp() {
  return requestIp(new Request('https://utterlog.local', {
    headers: {
      'eo-client-ip': getRequestHeader('eo-client-ip') || '',
      'true-client-ip': getRequestHeader('true-client-ip') || '',
      'x-forwarded-for': getRequestHeader('x-forwarded-for') || '',
      'x-real-ip': getRequestHeader('x-real-ip') || '',
      'cf-connecting-ip': getRequestHeader('cf-connecting-ip') || '',
    },
  }));
}

// 文章详情页的读取者身份：SSR 拿不到浏览器 localStorage 里的 visitor_id，
// 用 IP + UA 代替。阅读量本身每次加载都 +1，这个身份只用来算独立访客。
// 影视条目不计阅读量，reader 传 null。
function postReader(): ReadVisitor {
  return { ip: visitorIp(), ua: getRequestHeader('user-agent') || '' };
}

async function postBySlug(slug: string, reader: ReadVisitor | null = null) {
  return safe(getPostBySlug(slug, reader), null);
}

async function homeRoute(ctx: ThemeContextData | null, page: number): Promise<PublicPageBody> {
  const ip = visitorIp();
  const [home, visitorWeather] = await Promise.all([
    safe(loadHomePageDataDirect(page), null),
    safe(getVisitorWeather(ip), null, 1200),
  ]);
  if (ctx) ctx.visitorWeather = visitorWeather;
  return {
    kind: 'home', posts: home?.posts || [],
    page: home?.page || page,
    totalPages: home?.totalPages || 1,
    latestMoment: home?.latestMoment || null,
    latestComments: home?.latestComments || [],
    perPage: home?.perPage || 10,
  };
}

async function dateRoute(ctx: ThemeContextData | null, year: number, month?: number, day?: number): Promise<PublicPageBody> {
  const options = ctx?.options || await optionsFallback();
  const timeZone = ctx?.timeZone || resolveSiteTimeZone(options);
  const res = await safe(listPosts({ perPage: 500, status: 'publish' }), emptyPostList(1, 500));
  const posts = dataOf<any[]>(res, []).filter((post) => {
    const parts = datePartsInTimeZone(postDateInput(post), timeZone);
    return parts.year === year && (month == null || parts.month === month) && (day == null || parts.day === day);
  });
  return { kind: 'date', posts, year, month, day, timeZone };
}

export const loadStartPublicPage = createServerFn({ method: 'GET' })
  .validator(validatePublicPageRequest)
  .handler(async ({ data }): Promise<PublicPageData> => {
    const ctx = await themeCtx();
    // 全站浏览量：真实打开一次公开页 +1，跟文章阅读量同一个口径（刷新也算）。
    // 放在这里而不是中间件，是因为这个 server fn 就是所有公开页的唯一入口，
    // API 请求和静态资源根本走不到，不用再费劲排除。
    //
    // 预取要排除掉：前台开着 defaultPreload='intent'，鼠标划过站内链接就会
    // 跑一遍 loader，也就是跑到这里。不排除的话，用户在首页扫一眼文章列表，
    // 一篇没点也能刷出十几次浏览量 —— 这正是数字虚高的来源。
    if (!data.preload) bumpSiteViewOnRender(getRequestHeader('user-agent') || '');
    const body = await resolvePublicPage(ctx, data);
    // 只带回 head() 需要的两个字段。完整 ctx 由 __root 的 loader 负责，
    // 这里再返一份的话整个 ThemeContext 会被序列化两遍（详见 PublicPageSite）。
    return { ...body, site: { title: ctx?.site.title || 'Utterlog', subtitle: ctx?.site.subtitle || '' } };
  });

async function resolvePublicPage(ctx: ThemeContextData | null, data: PublicPageRequest): Promise<PublicPageBody> {

    if (data.kind === 'home') {
      return homeRoute(ctx, Math.max(1, Number(data.page) || 1));
    }

    if (data.kind === 'post' || data.kind === 'film') {
      const post = await postBySlug(data.slug, data.kind === 'post' ? postReader() : null);
      if (!post) return { kind: 'not-found', pathname: data.kind === 'film' ? `/films/${data.slug}` : `/posts/${data.slug}` };
      return { kind: 'post', post };
    }

    if (data.kind === 'archives') {
      if (!ctx) return { kind: 'not-found', pathname: '/archives' };
      const res = await safe(listPosts({ perPage: 500, status: 'publish' }), emptyPostList(1, 500));
      return { kind: 'archives', posts: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'categories') {
      if (!ctx) return { kind: 'not-found', pathname: '/categories' };
      return { kind: 'categories' };
    }
    if (data.kind === 'category') {
      if (!ctx) return { kind: 'not-found', pathname: `/categories/${data.slug}` };
      const category = matchBySlugOrName(ctx.categories, data.slug);
      if (!category) return { kind: 'not-found', pathname: `/categories/${data.slug}` };
      const res = await safe(listPosts({ perPage: 500, categoryId: category.id, status: 'publish' }), emptyPostList(1, 500));
      return { kind: 'category', category, posts: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'tags') {
      if (!ctx) return { kind: 'not-found', pathname: '/tags' };
      return { kind: 'tags' };
    }
    if (data.kind === 'tag') {
      if (!ctx) return { kind: 'not-found', pathname: `/tags/${data.slug}` };
      const tag = matchBySlugOrName(ctx.tags, data.slug, true);
      if (!tag) return { kind: 'not-found', pathname: `/tags/${data.slug}` };
      const res = await safe(listPosts({ perPage: 500, tagId: tag.id, status: 'publish' }), emptyPostList(1, 500));
      return { kind: 'tag', tag, posts: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'search') {
      const query = String(data.query || '').trim();
      const options = ctx?.options || await optionsFallback();
      const timeZone = ctx?.timeZone || resolveSiteTimeZone(options);
      if (!query) return { kind: 'search', query, results: [], mode: '', total: 0, timeZone };
      const body = await safe(searchPublicPosts(query, 20), { results: [] as any[], total: 0, mode: 'keyword' });
      const results = body.results || [];
      return { kind: 'search', query, results, mode: body.mode || '', total: body.total || results.length, timeZone };
    }

    if (data.kind === 'about') return { kind: 'about' };

    if (data.kind === 'footprints') {
      const footprints = await safe(listPublicFootprints(), []);
      return { kind: 'footprints', rows: footprints };
    }

    if (data.kind === 'moments') {
      const res = await safe(listMoments({ perPage: 50 }), emptyMomentList(1, 50));
      const body = dataOf<any>(res, []);
      const moments = Array.isArray(body) ? body : body.moments || [];
      return { kind: 'moments', moments, tags: momentTags(moments), fetchedAt: Date.now() };
    }

    if (data.kind === 'links') {
      const res = await safe(listPublicContent('links', { perPage: 500 }), emptyContentList(1, 500));
      return { kind: 'client', page: 'links', items: dataOf<any[]>(res, []) };
    }
    if (data.kind === 'feeds') return { kind: 'client', page: 'feeds' };
    if (data.kind === 'albums') {
      const res = await safe(listPublicContent('albums', { perPage: 500 }), emptyContentList(1, 500));
      return { kind: 'client', page: 'albums', items: dataOf<any[]>(res, []) };
    }
    if (data.kind === 'music') {
      const res = await safe(listPublicContent('music', { perPage: 100 }), emptyContentList(1, 100));
      return { kind: 'client', page: 'music', items: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'shelf') {
      const res = await safe(listPublicContent(data.shelf, { perPage: 60 }), emptyContentList(1, 60));
      return { kind: 'shelf', shelf: data.shelf, items: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'films') {
      const page = Math.max(1, Number(data.page) || 1);
      const perPage = 24;
      const filters = {
        video_type: String(data.videoType || ''),
        year: String(data.year || ''),
        region: String(data.region || ''),
      };
      const res = await safe(listPosts({
        type: 'video',
        page,
        perPage,
        videoType: filters.video_type || undefined,
        year: filters.year || undefined,
        region: filters.region || undefined,
      }), emptyPostList(page, perPage));
      const items = dataOf<any[]>(res, []);
      const total = (res as any)?.pagination?.total ?? (res as any)?.total ?? items.length;
      return { kind: 'films', items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)), filters };
    }

    if (data.kind === 'date') {
      return dateRoute(ctx, data.year, data.month, data.day);
    }

    if (data.kind === 'permalink') {
      const pathname = normalizePath(data.pathname);
      const segments = pathname.split('/').filter(Boolean).map(decodePathSegment);
      if (segments.length > 0) {
        const encodedPath = `/${segments.map((item) => encodeURIComponent(item)).join('/')}`;
        const post = await safe(resolvePublicPostPath(encodedPath, postReader()), null);
        if (post) return { kind: 'post', post };
      }
      return { kind: 'not-found', pathname };
    }

  return { kind: 'not-found', pathname: '/' };
}
