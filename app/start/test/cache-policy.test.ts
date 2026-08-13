import { expect, test } from 'bun:test';
import { isPostDetailPath, isPublicCacheablePage, isVisitorPersonalizedPage } from '../src/server/cache-policy';

test('home and paginated home are visitor-personalized (never CDN-cached)', () => {
  for (const path of ['/', '/page/1', '/page/12', '/page/12/']) {
    expect(isVisitorPersonalizedPage(path)).toBe(true);
    expect(isPublicCacheablePage(path)).toBe(false);
  }
});

test('public content pages are cacheable', () => {
  for (const path of [
    '/archives',
    '/categories',
    '/categories/code',
    '/tags/PHP',
    '/date/2026/04',
    '/about',
    '/moments',
    '/footprints',
    '/albums',
    '/music',
    '/movies',
    '/films',
    '/films/8',
    '/books',
    '/goods',
    '/games',
    '/links',
    '/feeds',
  ]) {
    expect(isPublicCacheablePage(path, '/archives/%display_id%')).toBe(true);
  }
});

test('private / dynamic paths are not cacheable', () => {
  for (const path of [
    '/',
    '/page/2',
    '/admin',
    '/admin/posts',
    '/login',
    '/install',
    '/search',
    '/api/v1/posts',
    '/aboutus', // must not match `/about` via loose prefix
    '/categorieslist', // must not match `/categories`
  ]) {
    expect(isPublicCacheablePage(path)).toBe(false);
  }
});

// 文章详情页的阅读量在 SSR 同一请求里 +1，进了共享缓存就不再计数、数字冻结。
test('post detail pages are never cacheable, whichever permalink structure is set', () => {
  const cases: [string, string][] = [
    ['/archives/%display_id%', '/archives/33'],
    ['/archives/%post_id%', '/archives/33'],
    ['/posts/%postname%', '/posts/hello-world'],
    ['/%postname%', '/hello-world'],
    ['/%year%/%month%/%postname%', '/2026/07/hello-world'],
    ['/%year%/%month%/%day%/%postname%', '/2026/07/24/hello-world'],
    ['/%category%/%postname%', '/code/hello-world'],
  ];
  for (const [structure, path] of cases) {
    expect(isPostDetailPath(path, structure)).toBe(true);
    expect(isPublicCacheablePage(path, structure)).toBe(false);
    expect(isPublicCacheablePage(`${path}/`, structure)).toBe(false);
  }
});

test('listing pages keep caching even when the permalink structure could shadow them', () => {
  // `/archives` 归档列表页跟 `/archives/29` 文章详情页共用前缀，别一起打死。
  expect(isPostDetailPath('/archives', '/archives/%display_id%')).toBe(false);
  expect(isPublicCacheablePage('/archives', '/archives/%display_id%')).toBe(true);
  expect(isPostDetailPath('/about', '/%postname%')).toBe(false);
  expect(isPublicCacheablePage('/about', '/%postname%')).toBe(true);
});
