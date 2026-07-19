import { expect, test } from 'bun:test';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/backend/auth/jwt';
import { AuthRequestError, authenticateRequest } from '../src/backend/auth/session';

test('access and refresh tokens are not interchangeable', async () => {
  const access = await signAccessToken(42, { role: 'admin', email: 'admin@example.test' });
  const refresh = await signRefreshToken(42);

  await expect(verifyAccessToken(access.token)).resolves.toMatchObject({ userId: 42 });
  await expect(verifyRefreshToken(refresh)).resolves.toMatchObject({ userId: 42 });
  await expect(verifyAccessToken(refresh)).rejects.toThrow();
  await expect(verifyRefreshToken(access.token)).rejects.toThrow();
});

test('invalid bearer credentials are reported as unauthorized', async () => {
  const request = new Request('https://example.test/api/v1/admin/bootstrap', {
    headers: { authorization: 'Bearer expired-or-invalid-token' },
  });

  await expect(authenticateRequest(request)).rejects.toMatchObject({
    status: 401,
    message: 'Token 无效或已过期',
  } satisfies Partial<AuthRequestError>);
});
