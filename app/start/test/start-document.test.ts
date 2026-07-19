import { describe, expect, test } from 'bun:test';
import type { ThemeContextData } from '../src/web/lib/theme-context';
import { getAvailableThemes, getThemeManifest } from '../src/web/lib/theme';
import { startDocumentLinks } from '../../start/src/lib/document';

function context(themeName = 'Azure'): ThemeContextData {
  const manifest = getThemeManifest(themeName);
  return {
    site: { title: 'Site', subtitle: '', description: '', url: '', logo: '', darkLogo: '', favicon: '/site.ico' },
    owner: { nickname: '', bio: '', avatar: '', url: '', socials: {} },
    menus: {}, categories: [], tags: [],
    archiveStats: { post_count: 0, comment_count: 0, word_count: 0, days: 0, total_views: 0, heatmap: [] },
    locale: 'zh-CN', timeZone: 'Asia/Tashkent',
    theme: { name: themeName, accent: 'blue', manifest },
    options: {},
  };
}

describe('TanStack Start document assets', () => {
  test('loads shared fonts before the active theme stylesheet', () => {
    expect(startDocumentLinks(context()).map((link) => link.href)).toEqual([
      '/site.ico',
      'https://static.bluecdn.com',
      'https://static.bluecdn.com/libs/fontawesome/7.3.0/css/all.min.css',
      'https://static.bluecdn.com/fonts/noto-sans-sc.css',
      'https://static.bluecdn.com/fonts/alimama-fangyuanti.css',
      'https://static.bluecdn.com/fonts/luo.css',
      '/themes/Azure/styles.css?v=2.0.6',
    ]);
  });

  test('does not inject theme-specific CSS without server context', () => {
    const links = startDocumentLinks(null).map((link) => link.href);
    expect(links).toContain('https://static.bluecdn.com/fonts/noto-sans-sc.css');
    expect(links.some((href) => href.startsWith('/themes/'))).toBe(false);
  });

  test('injects the selected stylesheet for every built-in theme', () => {
    for (const themeName of getAvailableThemes()) {
      const manifest = getThemeManifest(themeName);
      const links = startDocumentLinks(context(themeName)).map((link) => link.href);
      expect(links).toContain(`/themes/${themeName}/styles.css?v=${manifest.version}`);
    }
  });
});
