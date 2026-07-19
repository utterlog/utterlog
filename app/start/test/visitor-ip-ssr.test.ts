import { describe, expect, test } from 'bun:test';
import { isVisitorPersonalizedPage } from '../../start/src/server/cache-policy';

describe('visitor IP SSR handling', () => {
  test('forwards the EdgeOne client IP header into homepage weather lookup', async () => {
    const source = await Bun.file('app/start/src/server/public-pages.ts').text();
    expect(source).toContain("'eo-client-ip': getRequestHeader('eo-client-ip')");
  });

  test('marks visitor-personalized home pages as private', () => {
    expect(isVisitorPersonalizedPage('/')).toBe(true);
    expect(isVisitorPersonalizedPage('/page/2')).toBe(true);
    expect(isVisitorPersonalizedPage('/posts/example')).toBe(false);
    expect(isVisitorPersonalizedPage('/api/v1/visitor/geo')).toBe(false);
  });
});
