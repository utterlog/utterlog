import { ephemeral } from '../store/ephemeral';
import { revalidateTags as clearTaggedByTags } from './tagged';

const TAG_EPHEMERAL_PREFIXES: Record<string, string[]> = {
  coding: ['coding:'],
  weather: ['weather:'],
  captcha: ['captcha:'],
  online: ['online:'],
};

const CODING_PATHS = new Set(['/coding']);

export type RevalidateInput = {
  paths?: string[];
  tags?: string[];
};

export async function handleRevalidate(input: RevalidateInput = {}) {
  const paths = Array.isArray(input.paths) ? input.paths.map((p) => String(p || '').trim()).filter(Boolean) : [];
  const tags = Array.isArray(input.tags) ? input.tags.map((t) => String(t || '').trim()).filter(Boolean) : [];

  if (paths.some((path) => CODING_PATHS.has(path) || path.startsWith('/coding/'))) {
    if (!tags.includes('coding')) tags.push('coding');
  }

  const prefixes = new Set<string>();
  for (const tag of tags) {
    for (const prefix of TAG_EPHEMERAL_PREFIXES[tag] || []) prefixes.add(prefix);
  }

  let clearedEphemeral = 0;
  for (const prefix of prefixes) {
    for (const key of await ephemeral.scan(prefix)) {
      await ephemeral.del(key);
      clearedEphemeral++;
    }
  }

  const clearedTagged = clearTaggedByTags(tags);

  return {
    paths,
    tags,
    cleared_tagged: clearedTagged,
    cleared_ephemeral: clearedEphemeral,
    revalidated: true,
  };
}
