import { createHash, randomBytes } from 'node:crypto';

export function createPasswordResetToken() {
  return randomBytes(32).toString('hex');
}

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
