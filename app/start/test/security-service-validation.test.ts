import { describe, expect, test } from 'bun:test';
import { banIp, SecurityServiceError, unbanIp } from '../src/backend/services/security';

describe('security service validation', () => {
  test('rejects missing IP values before database access', async () => {
    await expect(banIp({})).rejects.toBeInstanceOf(SecurityServiceError);
    await expect(unbanIp({ ip: ' ' })).rejects.toBeInstanceOf(SecurityServiceError);
  });
});
