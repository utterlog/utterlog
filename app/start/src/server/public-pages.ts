import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import type { ThemeContextData } from '@/lib/theme-context';
import { datePartsInTimeZone, resolveSiteTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';
import { codingPayload } from '@backend/routes/coding';
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
import { loadStartThemeContextDirect } from './theme';

export type PublicPageRequest =
  | { kind: 'home'; page?: number }
  | { kind: 'post' | 'film'; slug: string }
  | { kind: 'archives' | 'categories' | 'tags' | 'about' | 'coding' | 'footprints' | 'moments' | 'links' | 'feeds' | 'albums' | 'music' }
  | { kind: 'category' | 'tag'; slug: string }
  | { kind: 'search'; query?: string }
  | { kind: 'shelf'; shelf: 'movies' | 'books' | 'games' | 'goods' }
  | { kind: 'films'; page?: number; videoType?: string; year?: string; region?: string }
  | { kind: 'date'; year: number; month?: number; day?: number }
  | { kind: 'permalink'; pathname: string };

const staticPageKinds = new Set([
  'archives', 'categories', 'tags', 'about', 'coding', 'footprints',
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

export function validatePublicPageRequest(input: unknown): PublicPageRequest {
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

export type PublicPageData =
  | { kind: 'not-found'; ctx: ThemeContextData | null; pathname: string }
  | { kind: 'home'; ctx: ThemeContextData | null; posts: any[]; page: number; totalPages: number; categories: any[]; archiveStats: Record<string, any>; latestMoment: any | null; latestComments: any[]; perPage: number }
  | { kind: 'post'; ctx: ThemeContextData | null; post: any; options: Record<string, string> }
  | { kind: 'archives'; ctx: ThemeContextData; posts: any[] }
  | { kind: 'categories'; ctx: ThemeContextData }
  | { kind: 'category'; ctx: ThemeContextData; category: any; posts: any[] }
  | { kind: 'tags'; ctx: ThemeContextData }
  | { kind: 'tag'; ctx: ThemeContextData; tag: any; posts: any[] }
  | { kind: 'about'; ctx: ThemeContextData | null }
  | { kind: 'coding'; ctx: ThemeContextData | null; data: any; timeZone: string }
  | { kind: 'footprints'; ctx: ThemeContextData | null; rows: any[]; options: Record<string, string> }
  | { kind: 'moments'; ctx: ThemeContextData | null; moments: any[]; tags: string[]; fetchedAt: number }
  | { kind: 'client'; ctx: ThemeContextData | null; page: 'links' | 'feeds' | 'albums' | 'music'; items?: any[] }
  | { kind: 'shelf'; ctx: ThemeContextData | null; shelf: 'movies' | 'books' | 'games' | 'goods'; items: any[] }
  | { kind: 'search'; ctx: ThemeContextData | null; query: string; results: any[]; mode: string; total: number; timeZone: string }
  | { kind: 'films'; ctx: ThemeContextData | null; items: any[]; total: number; page: number; perPage: number; totalPages: number; filters: Record<string, string> }
  | { kind: 'date'; ctx: ThemeContextData | null; posts: any[]; year: number; month?: number; day?: number; timeZone: string };

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

async function postBySlug(slug: string) {
  return safe(getPostBySlug(slug, false), null);
}

async function homeRoute(ctx: ThemeContextData | null, page: number): Promise<PublicPageData> {
  const ip = requestIp(new Request('https://utterlog.local', {
    headers: {
      'eo-client-ip': getRequestHeader('eo-client-ip') || '',
      'true-client-ip': getRequestHeader('true-client-ip') || '',
      'x-forwarded-for': getRequestHeader('x-forwarded-for') || '',
      'x-real-ip': getRequestHeader('x-real-ip') || '',
      'cf-connecting-ip': getRequestHeader('cf-connecting-ip') || '',
    },
  }));
  const [home, visitorWeather] = await Promise.all([
    safe(loadHomePageDataDirect(page), null),
    safe(getVisitorWeather(ip), null, 1200),
  ]);
  if (ctx) ctx.visitorWeather = visitorWeather;
  return {
    kind: 'home',
    ctx,
    posts: home?.posts || [],
    page: home?.page || page,
    totalPages: home?.totalPages || 1,
    categories: home?.categories || ctx?.categories || [],
    archiveStats: home?.archiveStats || ctx?.archiveStats || {},
    latestMoment: home?.latestMoment || null,
    latestComments: home?.latestComments || [],
    perPage: home?.perPage || 10,
  };
}

async function dateRoute(ctx: ThemeContextData | null, year: number, month?: number, day?: number): Promise<PublicPageData> {
  const options = ctx?.options || await optionsFallback();
  const timeZone = ctx?.timeZone || resolveSiteTimeZone(options);
  const res = await safe(listPosts({ perPage: 500, status: 'publish' }), emptyPostList(1, 500));
  const posts = dataOf<any[]>(res, []).filter((post) => {
    const parts = datePartsInTimeZone(postDateInput(post), timeZone);
    return parts.year === year && (month == null || parts.month === month) && (day == null || parts.day === day);
  });
  return { kind: 'date', ctx, posts, year, month, day, timeZone };
}

export const loadStartPublicPage = createServerFn({ method: 'GET' })
  .validator(validatePublicPageRequest)
  .handler(async ({ data }): Promise<PublicPageData> => {
    const ctx = await themeCtx();

    if (data.kind === 'home') {
      return homeRoute(ctx, Math.max(1, Number(data.page) || 1));
    }

    if (data.kind === 'post' || data.kind === 'film') {
      const post = await postBySlug(data.slug);
      if (!post) return { kind: 'not-found', ctx, pathname: data.kind === 'film' ? `/films/${data.slug}` : `/posts/${data.slug}` };
      return { kind: 'post', ctx, post, options: ctx?.options || await optionsFallback() };
    }

    if (data.kind === 'archives') {
      if (!ctx) return { kind: 'not-found', ctx, pathname: '/archives' };
      const res = await safe(listPosts({ perPage: 500, status: 'publish' }), emptyPostList(1, 500));
      return { kind: 'archives', ctx, posts: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'categories') {
      if (!ctx) return { kind: 'not-found', ctx, pathname: '/categories' };
      return { kind: 'categories', ctx };
    }
    if (data.kind === 'category') {
      if (!ctx) return { kind: 'not-found', ctx, pathname: `/categories/${data.slug}` };
      const category = matchBySlugOrName(ctx.categories, data.slug);
      if (!category) return { kind: 'not-found', ctx, pathname: `/categories/${data.slug}` };
      const res = await safe(listPosts({ perPage: 500, categoryId: category.id, status: 'publish' }), emptyPostList(1, 500));
      return { kind: 'category', ctx, category, posts: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'tags') {
      if (!ctx) return { kind: 'not-found', ctx, pathname: '/tags' };
      return { kind: 'tags', ctx };
    }
    if (data.kind === 'tag') {
      if (!ctx) return { kind: 'not-found', ctx, pathname: `/tags/${data.slug}` };
      const tag = matchBySlugOrName(ctx.tags, data.slug, true);
      if (!tag) return { kind: 'not-found', ctx, pathname: `/tags/${data.slug}` };
      const res = await safe(listPosts({ perPage: 500, tagId: tag.id, status: 'publish' }), emptyPostList(1, 500));
      return { kind: 'tag', ctx, tag, posts: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'search') {
      const query = String(data.query || '').trim();
      const options = ctx?.options || await optionsFallback();
      const timeZone = ctx?.timeZone || resolveSiteTimeZone(options);
      if (!query) return { kind: 'search', ctx, query, results: [], mode: '', total: 0, timeZone };
      const body = await safe(searchPublicPosts(query, 20), { results: [] as any[], total: 0, mode: 'keyword' });
      const results = body.results || [];
      return { kind: 'search', ctx, query, results, mode: body.mode || '', total: body.total || results.length, timeZone };
    }

    if (data.kind === 'about') return { kind: 'about', ctx };

    if (data.kind === 'coding') {
      const coding = await safe(codingPayload(false), {}, 10_000);
      return { kind: 'coding', ctx, data: coding, timeZone: ctx?.timeZone || 'UTC' };
    }

    if (data.kind === 'footprints') {
      const [options, footprints] = await Promise.all([
        optionsFallback(),
        safe(listPublicFootprints(), []),
      ]);
      return { kind: 'footprints', ctx, rows: footprints, options };
    }

    if (data.kind === 'moments') {
      const res = await safe(listMoments({ perPage: 50 }), emptyMomentList(1, 50));
      const body = dataOf<any>(res, []);
      const moments = Array.isArray(body) ? body : body.moments || [];
      return { kind: 'moments', ctx, moments, tags: momentTags(moments), fetchedAt: Date.now() };
    }

    if (data.kind === 'links') {
      const res = await safe(listPublicContent('links', { perPage: 500 }), emptyContentList(1, 500));
      return { kind: 'client', ctx, page: 'links', items: dataOf<any[]>(res, []) };
    }
    if (data.kind === 'feeds') return { kind: 'client', ctx, page: 'feeds' };
    if (data.kind === 'albums') {
      const res = await safe(listPublicContent('albums', { perPage: 500 }), emptyContentList(1, 500));
      return { kind: 'client', ctx, page: 'albums', items: dataOf<any[]>(res, []) };
    }
    if (data.kind === 'music') {
      const res = await safe(listPublicContent('music', { perPage: 100 }), emptyContentList(1, 100));
      return { kind: 'client', ctx, page: 'music', items: dataOf<any[]>(res, []) };
    }

    if (data.kind === 'shelf') {
      const res = await safe(listPublicContent(data.shelf, { perPage: 60 }), emptyContentList(1, 60));
      return { kind: 'shelf', ctx, shelf: data.shelf, items: dataOf<any[]>(res, []) };
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
      return { kind: 'films', ctx, items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)), filters };
    }

    if (data.kind === 'date') {
      return dateRoute(ctx, data.year, data.month, data.day);
    }

    if (data.kind === 'permalink') {
      const pathname = normalizePath(data.pathname);
      const segments = pathname.split('/').filter(Boolean).map(decodePathSegment);
      if (segments.length > 0) {
        const encodedPath = `/${segments.map((item) => encodeURIComponent(item)).join('/')}`;
        const post = await safe(resolvePublicPostPath(encodedPath, false), null);
        if (post) return { kind: 'post', ctx, post, options: ctx?.options || await optionsFallback() };
      }
      return { kind: 'not-found', ctx, pathname };
    }

    return { kind: 'not-found', ctx, pathname: '/' };
  });
