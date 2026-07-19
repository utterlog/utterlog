import { publicApiBase } from './runtime-config';

export type PublicPostQuery = {
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
};

export async function getPosts(params: PublicPostQuery = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  const response = await fetch(`${publicApiBase()}/posts${query ? `?${query}` : ''}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Unable to load posts (${response.status})`);
  return response.json();
}
