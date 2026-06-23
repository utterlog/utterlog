import { getPost, getPostBySlug, getPostByDisplayID, getOptions } from './blog-api';
import { parsePermalink, DEFAULT_PERMALINK } from './permalink';

export async function resolvePostFromPermalink(segments: string[], track: boolean): Promise<any | null> {
  let structure = DEFAULT_PERMALINK;
  try {
    const optsRes: any = await getOptions();
    const s = (optsRes?.data?.permalink_structure || '').trim();
    if (s) structure = s;
  } catch { /* keep default */ }

  if (structure === DEFAULT_PERMALINK) return null;

  const pathname = '/' + segments.map((s) => encodeURIComponent(s)).join('/');
  const hit = parsePermalink(pathname, structure);
  if (!hit) return null;

  const opts = track ? { track: true as const } : undefined;
  try {
    if (hit.display_id != null) {
      const r: any = await getPostByDisplayID(hit.display_id, opts);
      return r?.data ?? null;
    }
    if (hit.id != null) {
      const r: any = await getPost(hit.id, opts);
      return r?.data ?? null;
    }
    if (hit.slug) {
      const r: any = await getPostBySlug(hit.slug, opts);
      return r?.data ?? null;
    }
  } catch { return null; }
  return null;
}
