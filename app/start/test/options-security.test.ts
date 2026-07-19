import { describe, expect, test } from 'bun:test';
import { isSensitiveOptionName } from '../src/backend/services/options';

describe('public option filtering', () => {
  test('blocks credentials and provider secrets', () => {
    for (const key of ['jwt_secret', 'smtp_pass', 's3_access_key', 's3_secret_key', 'openai_api_key', 'telegram_token', 'admin_password']) {
      expect(isSensitiveOptionName(key)).toBe(true);
    }
  });

  test('preserves explicitly public map configuration and normal settings', () => {
    for (const key of ['mapbox_access_token', 'footprint_mapbox_token', 'mapbox_api_url', 'site_title', 'active_theme']) {
      expect(isSensitiveOptionName(key)).toBe(false);
    }
  });
});
