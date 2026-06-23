/**
 * 博客前台 API — 服务端调用，无需认证
 * 用于 Server Components 获取数据
 */
import { unstable_cache } from 'next/cache';
import { serverApiBase } from './server-api';

const API_BASE = serverApiBase();

async function fetchAPI<T>(path: string, options?: any): Promise<T> {
  // 默认不缓存（view_count/comment_count 实时变化），静态数据单独指定 next.revalidate
  const hasCache = options?.next || options?.cache;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...(hasCache ? {} : { cache: 'no-store' as const }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json;
}

// 文章列表
// v2.4.2 新增 type / video_type / region / year / genre 给 /films 列表用
export async function getPosts(params?: {
  page?: number;
  per_page?: number;
  category_id?: number;
  tag_id?: number;
  status?: string;
  type?: string;        // 'post'（默认）/ 'video'
  video_type?: string;  // tv / movie / show / anime / doc
  region?: string;
  year?: string;
  genre?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  if (params?.category_id) searchParams.set('category_id', String(params.category_id));
  if (params?.tag_id) searchParams.set('tag_id', String(params.tag_id));
  if (params?.status) searchParams.set('status', params.status);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.video_type) searchParams.set('video_type', params.video_type);
  if (params?.region) searchParams.set('region', params.region);
  if (params?.year) searchParams.set('year', params.year);
  if (params?.genre) searchParams.set('genre', params.genre);

  const query = searchParams.toString();
  return fetchAPI<any>(`/posts${query ? `?${query}` : ''}`);
}

// `track` option = 这次 fetch 是不是 "访客在读这篇文章" 的 SSR 请求,
// 加上 ?track=1 后端会把 view_count 当场 +1 并返回 +1 后的值
// (排除 admin / bot)。文章详情页 SSR 渲染时设 true,其它读取(列表 /
// 后台 / 搜索 / 关联推荐)留 false。这样阅读数完全交给服务端在渲染
// 时同步处理,前端不再走 /track 异步路径,也不再 cosmetic +1。
type FetchPostOptions = { track?: boolean };

function trackQuery(opts?: FetchPostOptions) {
  return opts?.track ? '?track=1' : '';
}

// 按 slug 获取文章 — Chinese slugs must be percent-encoded here, otherwise
// Node's fetch refuses the URL and the caller thinks the post doesn't exist.
export async function getPostBySlug(slug: string, opts?: FetchPostOptions) {
  return fetchAPI<any>(`/posts/slug/${encodeURIComponent(slug)}${trackQuery(opts)}`);
}

// 文章详情
export async function getPost(id: number, opts?: FetchPostOptions) {
  return fetchAPI<any>(`/posts/${id}${trackQuery(opts)}`);
}

// 按 display_id 获取文章 —— 配合 permalink 模板里的 %display_id% token。
// display_id 是「按发布顺序连续递增的序号」，跟 db 主键 id 解耦。
export async function getPostByDisplayID(displayID: number, opts?: FetchPostOptions) {
  return fetchAPI<any>(`/posts/by-display-id/${displayID}${trackQuery(opts)}`);
}

// 文章评论
export async function getPostComments(postId: number) {
  return fetchAPI<any>(`/posts/${postId}/comments`);
}

// 分类列表
export async function getCategories() {
  return fetchAPI<any>('/categories', { next: { revalidate: 300 } });
}

// 分类详情
export async function getCategory(id: number) {
  return fetchAPI<any>(`/categories/${id}`);
}

// 标签列表
export async function getTags() {
  return fetchAPI<any>('/tags', { next: { revalidate: 300 } });
}

// 标签详情
export async function getTag(id: number) {
  return fetchAPI<any>(`/tags/${id}`);
}

// 友链列表
export async function getLinks() {
  return fetchAPI<any>('/links', { next: { revalidate: 300 } });
}

// 站点配置 — tagged so the admin SPA can bust this cache instantly
// via POST /api/revalidate with { tags: ['options'] }. Time-based
// revalidate is a backstop only (10min ceiling for rare browsers that
// bypass the tag flush).
export async function getOptions() {
  return fetchAPI<any>('/options', { next: { tags: ['options'], revalidate: 600 } });
}

export async function getFootprints(params?: { city?: string; country?: string; route?: string; keyword?: string }) {
  const sp = new URLSearchParams();
  if (params?.city) sp.set('city', params.city);
  if (params?.country) sp.set('country', params.country);
  if (params?.route) sp.set('route', params.route);
  if (params?.keyword) sp.set('keyword', params.keyword);
  const q = sp.toString();
  return fetchAPI<any>(`/footprints${q ? `?${q}` : ''}`);
}

const getCodingCached = unstable_cache(
  () => fetchAPI<any>('/coding', { cache: 'force-cache' as const }),
  ['blog-coding'],
  { tags: ['coding'], revalidate: 300 },
);

export async function getCoding() {
  return getCodingCached();
}

// 说说
export async function getMoments(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/moments${q ? `?${q}` : ''}`);
}

// 音乐
export async function getMusicList(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/music${q ? `?${q}` : ''}`);
}

// 电影
export async function getMovies(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/movies${q ? `?${q}` : ''}`);
}

// 图书
export async function getBooks(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/books${q ? `?${q}` : ''}`);
}

// 归档统计
// Fresh every 30s — 2-min stale numbers looked broken ("stats are old")
// next to admin's live counts. 30s keeps ISR benefits but matches human
// expectations after publishing a post.
export async function getArchiveStats() {
  return fetchAPI<any>('/archive/stats', { next: { revalidate: 30 } });
}

// 搜索
export async function searchPosts(q: string, limit = 10) {
  return fetchAPI<any>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

// 当前活跃主题（无设置时返回 Azure 官方默认主题）
export async function getActiveTheme(): Promise<string> {
  try {
    const res = await fetchAPI<any>('/options');
    const data = res.data || res;
    return data.active_theme || 'Azure';
  } catch {
    return 'Azure';
  }
}

// 好物
export async function getGoods(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/goods${q ? `?${q}` : ''}`);
}

// 游戏
export async function getGames(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/games${q ? `?${q}` : ''}`);
}
