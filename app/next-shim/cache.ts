import {
  getTaggedEntry,
  setTaggedEntry,
  revalidateTags as clearTaggedByTags,
} from './tagged-cache';

type CacheOptions = {
  tags?: string[];
  revalidate?: number;
};

export function unstable_cache<T>(
  fn: () => Promise<T>,
  keyParts?: string[],
  options?: CacheOptions,
): () => Promise<T> {
  const key = (keyParts && keyParts.length > 0) ? keyParts.join(':') : `fn:${fn.toString().slice(0, 80)}`;
  const tags = options?.tags || [];
  const ttlSeconds = Number(options?.revalidate ?? 300);
  return async () => {
    const cached = getTaggedEntry<T>(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    setTaggedEntry(key, value, tags, ttlSeconds);
    return value;
  };
}

export function revalidatePath(_path: string) {}

export function revalidateTag(tag: string) {
  clearTaggedByTags([tag]);
}
