import { describe, expect, test } from 'bun:test';
import {
  BLOG_THEME_NAMES,
  normalizeThemeName,
  resolveBlogTheme,
} from '../../shared/blog-theme';

describe('built-in blog themes', () => {
  test('keeps every shipped theme selectable', () => {
    expect(BLOG_THEME_NAMES).toEqual(['Azure', 'Flux', 'Nebula', 'Renascent', 'Utterlog']);
    for (const theme of BLOG_THEME_NAMES) expect(normalizeThemeName(theme)).toBe(theme);
  });

  test('retains the Chred compatibility mapping and safe fallback', () => {
    expect(resolveBlogTheme('Chred')).toMatchObject({ theme: 'Azure', accent: 'red' });
    expect(normalizeThemeName('unknown-theme')).toBe('Azure');
  });
});
