import { describe, expect, test } from 'bun:test';
import { appVersion, getHostUptimeSeconds } from '../src/system/metrics';

describe('system metrics', () => {
  test('appVersion reads package version', () => {
    const version = appVersion();
    expect(version.length).toBeGreaterThan(0);
    expect(version).not.toBe('bun-migration');
  });

  test('host uptime seconds is non-negative', () => {
    expect(getHostUptimeSeconds()).toBeGreaterThanOrEqual(0);
  });
});
