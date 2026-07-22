import { expect, test } from 'bun:test';
import { publicIpForGeo } from '../src/backend/geoip';

test('publicIpForGeo strips database inet masks', () => {
  expect(publicIpForGeo('198.51.100.20/32')).toBe('198.51.100.20');
});

test('publicIpForGeo ignores private addresses', () => {
  expect(publicIpForGeo('127.0.0.1/32')).toBe('');
  expect(publicIpForGeo('192.168.1.10')).toBe('');
});
