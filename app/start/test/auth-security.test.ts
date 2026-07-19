import { describe, expect, test } from 'bun:test';
import { generateTotpCode, verifyTotpCode } from '../src/backend/services/auth-security';

describe('TOTP verification', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const step = 123456;

  test('accepts the current and adjacent time windows', () => {
    expect(verifyTotpCode(secret, generateTotpCode(secret, step), step)).toBe(true);
    expect(verifyTotpCode(secret, generateTotpCode(secret, step - 1), step)).toBe(true);
    expect(verifyTotpCode(secret, generateTotpCode(secret, step + 1), step)).toBe(true);
  });

  test('rejects codes outside the allowed window', () => {
    expect(verifyTotpCode(secret, generateTotpCode(secret, step + 2), step)).toBe(false);
  });
});
