import { ephemeral } from '../store/ephemeral';

const TAG_EPHEMERAL_PREFIXES: Record<string, string[]> = {
  weather: ['weather:'],
  captcha: ['captcha:'],
  online: ['online:'],
};

export type RevalidateInput = {
  paths?: string[];
  tags?: string[];
};

export async function handleRevalidate(input: RevalidateInput = {}) {
  const paths = Array.isArray(input.paths) ? input.paths.map((p) => String(p || '').trim()).filter(Boolean) : [];
  const tags = Array.isArray(input.tags) ? input.tags.map((t) => String(t || '').trim()).filter(Boolean) : [];

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

  return {
    paths,
    tags,
    cleared_ephemeral: clearedEphemeral,
    revalidated: true,
  };
}
