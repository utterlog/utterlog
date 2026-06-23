export function unstable_cache<T>(fn: () => Promise<T>): () => Promise<T> {
  return fn;
}

export function revalidatePath(_path: string) {}

export function revalidateTag(_tag: string) {}
