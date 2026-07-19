import { describe, expect, test } from 'bun:test';
import { validatePublicPageRequest } from '../../start/src/server/public-pages';

const publicRoutes = [
  '/',
  '/about',
  '/albums',
  '/archives',
  '/books',
  '/categories',
  '/categories/$slug',
  '/coding',
  '/date/$year',
  '/date/$year/$month',
  '/date/$year/$month/$day',
  '/feeds',
  '/films',
  '/films/$slug',
  '/footprints',
  '/games',
  '/goods',
  '/links',
  '/moments',
  '/movies',
  '/music',
  '/page/$num',
  '/posts/$slug',
  '/search',
  '/tags',
  '/tags/$slug',
];

describe('TanStack Start public route topology', () => {
  test('keeps every public page in the generated file-route tree', async () => {
    const source = await Bun.file('app/start/src/routeTree.gen.ts').text();
    for (const path of publicRoutes) {
      expect(source).toContain(`'${path}'`);
    }
  });

  test('reserves the splat route for configured permalinks', async () => {
    const source = await Bun.file('app/start/src/routes/$.tsx').text();
    expect(source).toContain("kind: 'permalink'");
    expect(source).not.toContain('loadStartLegacyRoute');
  });

  test('rejects forged page requests before they reach database helpers', () => {
    expect(() => validatePublicPageRequest({ kind: 'shelf', shelf: 'users' })).toThrow();
    expect(() => validatePublicPageRequest({ kind: 'permalink', pathname: 'missing-slash' })).toThrow();
    expect(validatePublicPageRequest({ kind: 'films', page: 2, videoType: 'movie' })).toEqual({
      kind: 'films',
      page: 2,
      videoType: 'movie',
      year: '',
      region: '',
    });
  });
});
