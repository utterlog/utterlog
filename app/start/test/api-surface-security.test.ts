import { expect, test } from 'bun:test';

test('cors origin only allows configured origins or APP_URL origin', async () => {
  const mod = await import('../src/backend/routes/index.ts');
  expect(mod.matchCorsOrigin('https://blog.example.com', '', 'https://blog.example.com')).toBe('https://blog.example.com');
  expect(mod.matchCorsOrigin('https://evil.example.com', '', 'https://blog.example.com')).toBeUndefined();
  expect(mod.matchCorsOrigin(undefined, '', 'https://blog.example.com')).toBeUndefined();
});

test('cors origin honors explicit allow list without granting other domains', async () => {
  const mod = await import('../src/backend/routes/index.ts');
  const allowList = 'https://admin.example.com, https://preview.example.com';
  expect(mod.matchCorsOrigin('https://admin.example.com', allowList, 'https://blog.example.com')).toBe('https://admin.example.com');
  expect(mod.matchCorsOrigin('https://preview.example.com', allowList, 'https://blog.example.com')).toBe('https://preview.example.com');
  expect(mod.matchCorsOrigin('https://blog.example.com', allowList, 'https://blog.example.com')).toBeUndefined();
  expect(mod.matchCorsOrigin('https://evil.example.com', allowList, 'https://blog.example.com')).toBeUndefined();
});
