export interface PostDateLike {
  published_at?: string | number | Date | null;
  created_at?: string | number | Date | null;
}

export function postDateInput(post: PostDateLike): string | number {
  const value = post.published_at || post.created_at || 0;
  return value instanceof Date ? value.toISOString() : value;
}
