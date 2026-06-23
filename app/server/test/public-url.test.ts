import { expect, test } from 'bun:test';
import { normalizePublicHttpUrl } from '../src/http/public-url';

test('public URL normalization accepts normal http and https origins', () => {
  expect(normalizePublicHttpUrl('example.com/')).toBe('https://example.com');
  expect(normalizePublicHttpUrl('https://example.com/blog?x=1#hash')).toBe('https://example.com/blog');
});

test('public URL normalization rejects local and private targets', () => {
  for (const value of [
    'http://localhost:8080',
    'http://127.0.0.1',
    'http://10.0.0.2',
    'http://172.16.0.1',
    'http://192.168.1.1',
    'http://[::1]',
    'file:///etc/passwd',
    'https://user:pass@example.com',
  ]) {
    expect(() => normalizePublicHttpUrl(value)).toThrow();
  }
});
