import { expect, test } from 'bun:test';
import { requestIp } from '../src/backend/request-ip';

test('request IP prefers X-Real-IP over X-Forwarded-For behind a rewriting proxy', () => {
  // FrankenPHP/Caddy overwrites X-Forwarded-For with its own peer (the CDN
  // edge node) unless trusted_proxies is configured, so XFF cannot be trusted
  // for the real visitor. The CDN injects the real client into a dedicated
  // single-value header (here X-Real-IP), which passes through untouched.
  const request = new Request('https://utterlog.test', {
    headers: {
      'x-forwarded-for': '118.31.144.46', // Caddy peer = CDN edge, not the visitor
      'x-real-ip': '203.0.113.42', // CDN-injected real client
    },
  });
  expect(requestIp(request)).toBe('203.0.113.42');
});

test('request IP prefers the EdgeOne client IP header over proxy addresses', () => {
  const request = new Request('https://utterlog.test', {
    headers: {
      'eo-client-ip': '203.0.113.42',
      'x-forwarded-for': '49.232.12.8',
      'x-real-ip': '49.232.12.8',
    },
  });
  expect(requestIp(request)).toBe('203.0.113.42');
});

test('request IP falls back when forwarded headers are absent', () => {
  expect(requestIp(new Request('https://utterlog.test', { headers: { 'x-real-ip': '203.0.113.7' } }))).toBe('203.0.113.7');
  expect(requestIp(new Request('https://utterlog.test'))).toBe('127.0.0.1');
});

test('request IP ignores invalid preferred headers and accepts IPv6', () => {
  const fallback = new Request('https://utterlog.test', { headers: {
    'eo-client-ip': 'unknown',
    'x-forwarded-for': 'not-an-ip, 203.0.113.8',
  } });
  expect(requestIp(fallback)).toBe('203.0.113.8');
  expect(requestIp(new Request('https://utterlog.test', {
    headers: { 'eo-client-ip': '[2001:db8::42]:443' },
  }))).toBe('2001:db8::42');
});
