import { describe, expect, test } from 'bun:test';
import { analyticsBreakdown, AnalyticsServiceError, analyticsPeriod } from '../src/backend/services/analytics';

describe('analytics service validation', () => {
  test('normalizes periods and rejects invalid dimensions before database access', async () => {
    expect(analyticsPeriod('invalid')).toBe('24h');
    await expect(analyticsBreakdown('24h', 'invalid')).rejects.toBeInstanceOf(AnalyticsServiceError);
  });
});
