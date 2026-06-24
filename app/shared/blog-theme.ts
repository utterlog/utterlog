export const SUPPORTED_BLOG_THEMES = new Set(['Azure', 'Nebula']);

export const DEFAULT_BLOG_THEME = 'Azure';

export type BlogThemeName = 'Azure' | 'Nebula';
export type BlogThemeAccent = 'blue' | 'red';

export function normalizeBlogTheme(name: string): BlogThemeName {
  const trimmed = String(name || '').trim();
  return SUPPORTED_BLOG_THEMES.has(trimmed) ? (trimmed as BlogThemeName) : DEFAULT_BLOG_THEME;
}

/** Legacy alias used by web/blog theme loaders. */
export function normalizeThemeName(name: string): BlogThemeName {
  if (/^chred$/i.test(String(name || '').trim())) return 'Azure';
  return normalizeBlogTheme(name);
}

/** Map legacy Chred installs to Azure + red accent. */
export function resolveBlogTheme(rawTheme: string, rawAccent = '') {
  const themeRaw = String(rawTheme || '').trim();
  if (/^chred$/i.test(themeRaw)) {
    return { theme: 'Azure' as const, accent: 'red' as const, migratedFrom: 'Chred' as const };
  }
  const theme = normalizeBlogTheme(themeRaw);
  const accent: BlogThemeAccent = theme === 'Azure' && String(rawAccent || '').toLowerCase() === 'red' ? 'red' : 'blue';
  return { theme, accent, migratedFrom: '' as const };
}

export function blogThemeAccentAttr(accent: BlogThemeAccent) {
  return accent === 'red' ? 'red' : '';
}
