import { describe, expect, test } from 'bun:test';
import {
  PAGE_VIEW_IP_RATE_LIMIT,
  PAGE_VIEW_RATE_LIMIT,
  pageViewGateReason,
} from '../src/backend/services/tracking';

describe('page view behavior gate', () => {
  test('keeps ordinary navigation', () => {
    expect(pageViewGateReason({ duplicate: 0, recent: PAGE_VIEW_RATE_LIMIT - 1, recentIp: 10 })).toBe('');
  });

  test('drops duplicate effects and refresh jitter', () => {
    expect(pageViewGateReason({ duplicate: 1, recent: 1, recentIp: 1 })).toBe('duplicate');
  });

  test('blocks a browser identity at the configured threshold', () => {
    expect(pageViewGateReason({ duplicate: 0, recent: PAGE_VIEW_RATE_LIMIT, recentIp: 10 })).toBe('behavior_rate');
  });

  test('blocks rotating identities sharing an abusive IP', () => {
    expect(pageViewGateReason({ duplicate: 0, recent: 1, recentIp: PAGE_VIEW_IP_RATE_LIMIT })).toBe('ip_rate');
  });
});
