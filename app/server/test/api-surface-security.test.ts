import { expect, test } from 'bun:test';

test('cors origin only allows configured origins or APP_URL origin', async () => {
  const mod = await import('../src/routes/index.ts');
  expect(mod.matchCorsOrigin('https://blog.example.com', '', 'https://blog.example.com')).toBe('https://blog.example.com');
  expect(mod.matchCorsOrigin('https://evil.example.com', '', 'https://blog.example.com')).toBeUndefined();
  expect(mod.matchCorsOrigin(undefined, '', 'https://blog.example.com')).toBeUndefined();
});

test('cors origin honors explicit allow list without granting other domains', async () => {
  const mod = await import('../src/routes/index.ts');
  const allowList = 'https://admin.example.com, https://preview.example.com';
  expect(mod.matchCorsOrigin('https://admin.example.com', allowList, 'https://blog.example.com')).toBe('https://admin.example.com');
  expect(mod.matchCorsOrigin('https://preview.example.com', allowList, 'https://blog.example.com')).toBe('https://preview.example.com');
  expect(mod.matchCorsOrigin('https://blog.example.com', allowList, 'https://blog.example.com')).toBeUndefined();
  expect(mod.matchCorsOrigin('https://evil.example.com', allowList, 'https://blog.example.com')).toBeUndefined();
});

test('admin mutation classifier protects write-heavy API surfaces', async () => {
  const mod = await import(`../src/routes/index.ts?case=admin-surface-${Date.now()}`);
  expect(mod.adminMutation('/api/v1/posts')).toBe(true);
  expect(mod.adminMutation('/api/v1/options')).toBe(true);
  expect(mod.adminMutation('/api/v1/backup/run')).toBe(true);
  expect(mod.adminMutation('/api/v1/comments/123/reply')).toBe(true);
  expect(mod.adminMutation('/api/v1/comments')).toBe(false);
  expect(mod.adminMutation('/api/v1/links/apply')).toBe(false);
  expect(mod.adminMutation('/api/v1/telegram/webhook')).toBe(false);
});
