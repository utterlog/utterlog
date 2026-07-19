import { expect, test } from 'bun:test';
import { publicIpForGeo } from '../src/backend/geoip';

test('publicIpForGeo strips database inet masks', () => {
  expect(publicIpForGeo('39.146.9.97/32')).toBe('39.146.9.97');
});

test('publicIpForGeo ignores private addresses', () => {
  expect(publicIpForGeo('127.0.0.1/32')).toBe('');
  expect(publicIpForGeo('192.168.1.10')).toBe('');
});
