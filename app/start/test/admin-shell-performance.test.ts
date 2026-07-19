import { describe, expect, test } from 'bun:test';
import { isAdminAssetPath } from '../../start/src/routes/admin/$';

describe('admin shell performance safeguards', () => {
  test('recognizes file requests so missing chunks cannot fall back to HTML', () => {
    expect(isAdminAssetPath('assets/index-abc123.js')).toBe(true);
    expect(isAdminAssetPath('assets/index-abc123.css')).toBe(true);
    expect(isAdminAssetPath('posts')).toBe(false);
    expect(isAdminAssetPath('posts/edit/42')).toBe(false);
  });

  test('admin is a file-based TanStack Start app so every route code-splits', async () => {
    // The old single App.tsx imperative router is gone; Start's file-based
    // routing gives every route its own chunk automatically.
    expect(await Bun.file('app/admin/src/App.tsx').exists()).toBe(false);
    expect(await Bun.file('app/admin/src/routes/__root.tsx').exists()).toBe(true);
    const routes = new Bun.Glob('app/admin/src/routes/**/*.tsx');
    const routeFiles = await Array.fromAsync(routes.scan());
    // 45+ page routes + shell/layout — proves per-route splitting, not one bundle.
    expect(routeFiles.length).toBeGreaterThan(30);
  });

  test('does not put remote font stylesheets on the admin render path', async () => {
    const css = await Bun.file('app/admin/src/styles/globals.css').text();
    const root = await Bun.file('app/admin/src/routes/__root.tsx').text();
    expect(css).not.toContain('static.bluecdn.com/fonts');
    // FontAwesome must be injected client-side, never emitted as a render-blocking
    // <link rel="stylesheet"> in the shell head.
    expect(root).not.toMatch(/rel:\s*'stylesheet'/);
    expect(root).toContain("document.createElement('link')");
  });

  test('caches remote release metadata and keeps explicit refresh support', async () => {
    const service = await Bun.file('app/start/src/backend/routes/compat.ts').text();
    const route = await Bun.file('app/start/src/routes/api/v1/admin/system/$action.ts').text();
    expect(service).toContain('releaseListCacheTtlMs = 10 * 60 * 1000');
    expect(service).toContain('releaseListRequest');
    expect(route).toContain("searchParams.get('refresh') === '1'");
  });
});
