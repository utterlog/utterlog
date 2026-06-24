type TaggedEntry = {
  value: string;
  expiresAt: number;
  tags: string[];
};

const entries = new Map<string, TaggedEntry>();

export function getTaggedEntry<T>(key: string): T | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
    entries.delete(key);
    return undefined;
  }
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    entries.delete(key);
    return undefined;
  }
}

export function setTaggedEntry(key: string, value: unknown, tags: string[], ttlSeconds: number) {
  entries.set(key, {
    value: JSON.stringify(value),
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
    tags: [...tags],
  });
}

export function revalidateTags(tags: string[]): number {
  const wanted = new Set(tags.map((tag) => String(tag || '').trim()).filter(Boolean));
  if (!wanted.size) return 0;
  let cleared = 0;
  for (const [key, entry] of entries) {
    if (entry.tags.some((tag) => wanted.has(tag))) {
      entries.delete(key);
      cleared++;
    }
  }
  return cleared;
}

export function clearTaggedCache() {
  const count = entries.size;
  entries.clear();
  return count;
}
