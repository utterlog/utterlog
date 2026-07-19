import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runtimePaths } from '../paths';

const customLocaleDir = 'locales';

export function localeFiles() {
  const files = new Set<string>();
  for (const dir of [runtimePaths.builtinLocaleDir, customLocaleDir]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json')) files.add(file.replace(/\.json$/, ''));
    }
  }
  return [...files].sort();
}

export function readLocale(locale: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(locale)) return null;
  const builtinPath = join(runtimePaths.builtinLocaleDir, `${locale}.json`);
  const customPath = join(customLocaleDir, `${locale}.json`);
  let data: Record<string, unknown> | null = null;
  if (existsSync(builtinPath)) data = JSON.parse(readFileSync(builtinPath, 'utf8'));
  if (existsSync(customPath)) {
    const custom = JSON.parse(readFileSync(customPath, 'utf8')) as Record<string, any>;
    data = data ? {
      ...data,
      ...custom,
      messages: {
        ...((data.messages as Record<string, unknown> | undefined) || {}),
        ...(custom.messages || {}),
      },
    } : custom;
  }
  return data;
}
