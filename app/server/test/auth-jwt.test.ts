import { expect, test } from 'bun:test';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/auth/jwt';

test('access and refresh tokens are not interchangeable', async () => {
  const access = await signAccessToken(42, { role: 'admin', email: 'admin@example.test' });
  const refresh = await signRefreshToken(42);

  await expect(verifyAccessToken(access.token)).resolves.toMatchObject({ userId: 42 });
  await expect(verifyRefreshToken(refresh)).resolves.toMatchObject({ userId: 42 });
  await expect(verifyAccessToken(refresh)).rejects.toThrow();
  await expect(verifyRefreshToken(access.token)).rejects.toThrow();
});
