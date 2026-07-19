import { expect, test } from 'bun:test';
import { requestIp } from '../src/backend/request-ip';

test('request IP prefers the first Tencent CDN X-Forwarded-For address', () => {
  const request = new Request('https://utterlog.test', {
    headers: {
      'x-forwarded-for': '203.0.113.42, 49.232.12.8',
      'x-real-ip': '49.232.12.8',
      'cf-connecting-ip': '49.232.12.8',
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
