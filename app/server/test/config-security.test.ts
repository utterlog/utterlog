import { expect, test } from 'bun:test';

test('production config rejects default localhost APP_URL', async () => {
  const original = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.REQUIRE_PUBLIC_APP_URL = 'true';
  process.env.APP_URL = 'http://localhost:8080';
  process.env.JWT_SECRET = 'test-secret';
  process.env.DB_USER = 'utterlog';

  const mod = await import(`../src/config.ts?case=localhost-${Date.now()}`);
  expect(() => mod.assertSecureConfig(true)).toThrow(/APP_URL must not use localhost/);
  process.env = original;
});

test('production config rejects wildcard CORS', async () => {
  const original = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.REQUIRE_PUBLIC_APP_URL = 'false';
  process.env.APP_URL = 'https://example.com';
  process.env.CORS_ORIGIN = '*';
  process.env.JWT_SECRET = 'test-secret';
  process.env.DB_USER = 'utterlog';

  const mod = await import(`../src/config.ts?case=cors-${Date.now()}`);
  expect(() => mod.assertSecureConfig(true)).toThrow(/CORS_ORIGIN=\*/);
  process.env = original;
});
