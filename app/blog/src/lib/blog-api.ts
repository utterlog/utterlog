/**
 * Bun SSR blog API — server-side fetch, no Next.js cache integration.
 */
import { serverApiBase } from '@/lib/server-api';

const API_BASE = serverApiBase();

async function fetchAPI<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

type FetchPostOptions = { track?: boolean };

function shouldSkipTrack(opts?: FetchPostOptions) {
  return Boolean(opts?.track && typeof window !== 'undefined' && window.__UTTERLOG_HYDRATING__);
}

function trackQuery(opts?: FetchPostOptions) {
  if (shouldSkipTrack(opts)) return '';
  return opts?.track ? '?track=1' : '';
}

export async function getPosts(params?: {
  page?: number;
  per_page?: number;
  category_id?: number;
  tag_id?: number;
  status?: string;
  type?: string;
  video_type?: string;
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

export async function getPostBySlug(slug: string, opts?: FetchPostOptions) {
  return fetchAPI<any>(`/posts/slug/${encodeURIComponent(slug)}${trackQuery(opts)}`);
}

export async function getPost(id: number, opts?: FetchPostOptions) {
  return fetchAPI<any>(`/posts/${id}${trackQuery(opts)}`);
}

export async function getPostByDisplayID(displayID: number, opts?: FetchPostOptions) {
  return fetchAPI<any>(`/posts/by-display-id/${displayID}${trackQuery(opts)}`);
}

export async function getPostComments(postId: number) {
  return fetchAPI<any>(`/posts/${postId}/comments`);
}

export async function getCategories() {
  return fetchAPI<any>('/categories');
}

export async function getCategory(id: number) {
  return fetchAPI<any>(`/categories/${id}`);
}

export async function getTags() {
  return fetchAPI<any>('/tags');
}

export async function getTag(id: number) {
  return fetchAPI<any>(`/tags/${id}`);
}

export async function getLinks() {
  return fetchAPI<any>('/links');
}

export async function getOptions() {
  return fetchAPI<any>('/options');
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

export async function getCoding() {
  return fetchAPI<any>('/coding');
}

export async function getMoments(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/moments${q ? `?${q}` : ''}`);
}

export async function getMusicList(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/music${q ? `?${q}` : ''}`);
}

export async function getMovies(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/movies${q ? `?${q}` : ''}`);
}

export async function getBooks(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/books${q ? `?${q}` : ''}`);
}

export async function getArchiveStats() {
  return fetchAPI<any>('/archive/stats');
}

export async function searchPosts(q: string, limit = 10) {
  return fetchAPI<any>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export async function getActiveTheme(): Promise<string> {
  try {
    const res = await fetchAPI<any>('/options');
    const data = res.data || res;
    return normalizeThemeName(data.active_theme || 'Azure');
  } catch {
    return 'Azure';
  }
}

export async function getGoods(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/goods${q ? `?${q}` : ''}`);
}

export async function getGames(params?: { page?: number; per_page?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.per_page) sp.set('per_page', String(params.per_page));
  const q = sp.toString();
  return fetchAPI<any>(`/games${q ? `?${q}` : ''}`);
}

export const SUPPORTED_THEMES = new Set(['Azure', 'Nebula']);

export function normalizeThemeName(name: string) {
  const trimmed = String(name || '').trim();
  return SUPPORTED_THEMES.has(trimmed) ? trimmed : 'Azure';
}
