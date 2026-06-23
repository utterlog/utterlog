import { expect, test } from 'bun:test';
import { createPasswordResetToken, hashPasswordResetToken } from '../src/auth/password-reset';

test('password reset tokens are stored as irreversible hashes', () => {
  const token = createPasswordResetToken();
  const hash = hashPasswordResetToken(token);

  expect(token).toHaveLength(64);
  expect(hash).toHaveLength(64);
  expect(hash).not.toBe(token);
  expect(hashPasswordResetToken(token)).toBe(hash);
  expect(hashPasswordResetToken(`${token}x`)).not.toBe(hash);
});
