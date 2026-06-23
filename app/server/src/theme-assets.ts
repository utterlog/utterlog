import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';
import { runtimePaths } from './paths';

function screenshotCandidates(file: string): string[] {
  const names = new Set<string>();
  if (file) names.add(file);
  if (/\.png$/i.test(file)) names.add(file.replace(/\.png$/i, '.svg'));
  names.add('screenshot.svg');
  names.add('screenshot.png');
  return [...names];
}

export function themeAssetRoots(themeId: string): string[] {
  return [
    join(config.contentDir, 'themes', themeId),
    join(runtimePaths.builtinPublicThemesDir, themeId),
    join(runtimePaths.builtinThemesDir, themeId),
  ];
}

export function resolveThemeAssetPath(themeId: string, file: string): string | null {
  for (const base of themeAssetRoots(themeId)) {
    for (const name of screenshotCandidates(file)) {
      const path = join(base, name);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

export function resolveThemePreviewUrl(themeId: string, screenshot = ''): string {
  const path = resolveThemeAssetPath(themeId, screenshot || 'screenshot.png');
  if (!path) return '';
  const filename = path.split('/').pop() || '';
  return `/themes/${themeId}/${filename}`;
}
