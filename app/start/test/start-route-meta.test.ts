import { describe, expect, test } from 'bun:test';
import { publicPageMeta } from '../../start/src/lib/public-meta';

// 页面 loader 现在只回一份最小的 site（title / subtitle）给 head() 用，
// 完整 ThemeContext 由 __root 的 loader 提供 —— 两边都带的话整份 ctx 会被
// 序列化两遍。这里跟着用 site。
const site = { title: '示例站点', subtitle: '' };

describe('TanStack Start route metadata', () => {
  test('uses post SEO fields when available', () => {
    expect(publicPageMeta({
      kind: 'post',
      site,
      post: { title: '原标题', excerpt: '摘要', seo: { title: 'SEO 标题', description: 'SEO 描述' } },
    })).toEqual({ title: 'SEO 标题 - 示例站点', description: 'SEO 描述' });
  });

  test('names collection and dated archive pages', () => {
    expect(publicPageMeta({ kind: 'moments', site, moments: [], tags: [], fetchedAt: 0 }).title).toBe('说说 - 示例站点');
    expect(publicPageMeta({ kind: 'date', site, posts: [], year: 2026, month: 7, timeZone: 'UTC' }).title).toBe('2026/07 归档 - 示例站点');
    expect(publicPageMeta({ kind: 'about', site }).title).toBe('关于 - 示例站点');
  });

  test('falls back when the page loader could not resolve the site', () => {
    // ctx 为 null 时 loader 仍会带一个空的 site 兜底，标题不该变成 "undefined"。
    expect(publicPageMeta({ kind: 'about', site: { title: '', subtitle: '' } }).title).toBe('关于 - Utterlog');
  });
});
