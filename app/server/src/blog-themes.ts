export const SUPPORTED_BLOG_THEMES = new Set(['Azure', 'Nebula']);

export const DEFAULT_BLOG_THEME = 'Azure';

export function normalizeBlogTheme(name: string): 'Azure' | 'Nebula' {
  const trimmed = String(name || '').trim();
  return SUPPORTED_BLOG_THEMES.has(trimmed) ? (trimmed as 'Azure' | 'Nebula') : DEFAULT_BLOG_THEME;
}
