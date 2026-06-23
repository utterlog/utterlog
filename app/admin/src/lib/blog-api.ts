/**
 * 博客前台 API — 服务端调用，无需认证
 * 用于 Server Components 获取数据
 */

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || '/api/v1';

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
export async function getPosts(params?: {
  page?: number;
  per_page?: number;
  category_id?: number;
  tag_id?: number;
  status?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  if (params?.category_id) searchParams.set('category_id', String(params.category_id));
  if (params?.tag_id) searchParams.set('tag_id', String(params.tag_id));
  if (params?.status) searchParams.set('status', params.status);

  const query = searchParams.toString();
  return fetchAPI<any>(`/posts${query ? `?${query}` : ''}`);
}

// 按 slug 获取文章
export async function getPostBySlug(slug: string) {
  return fetchAPI<any>(`/posts/slug/${slug}`);
}

// 文章详情
export async function getPost(id: number) {
  return fetchAPI<any>(`/posts/${id}`);
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

// 站点配置
export async function getOptions() {
  return fetchAPI<any>('/options', { next: { revalidate: 10 } });
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
export async function getArchiveStats() {
  return fetchAPI<any>('/archive/stats', { next: { revalidate: 120 } });
}

// 搜索
export async function searchPosts(q: string, limit = 10) {
  return fetchAPI<any>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

// 当前活跃主题（无设置时返回 Azure 官方默认主题；'2026' 主题已废弃删除）
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
