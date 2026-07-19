import { expect, test } from 'bun:test';
import { skipsInstallRedirect } from '../src/backend/http/install-redirect';

test('install redirect only bypasses exact system path prefixes', () => {
  expect(skipsInstallRedirect('/api')).toBe(true);
  expect(skipsInstallRedirect('/api/v1/health')).toBe(true);
  expect(skipsInstallRedirect('/admin/assets/app.js')).toBe(true);
  expect(skipsInstallRedirect('/apix')).toBe(false);
  expect(skipsInstallRedirect('/administrator')).toBe(false);
});
