import { table } from '../config';
import { one } from '../db/helpers';
import { verifyAccessToken } from './jwt';

export type AuthSession = {
  userId: number;
  role: string;
};

export class AuthRequestError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
  }
}

export async function authenticateRequest(request: Request): Promise<AuthSession | null> {
  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  let userId: number;
  try {
    ({ userId } = await verifyAccessToken(token));
  } catch {
    throw new AuthRequestError(401, 'Token 无效或已过期');
  }

  const user = await one<{ role: string; status: string }>(
    `select role, status from ${table('users')} where id = $1`,
    [userId],
  );
  if (!user || user.status !== 'active') {
    throw new AuthRequestError(401, 'Token 无效或已过期');
  }
  return { userId, role: user.role };
}

export async function requireAdminRequest(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) throw new AuthRequestError(401, 'Token 无效或已过期');
  if (session.role !== 'admin') throw new AuthRequestError(403, '需要管理员权限');
  return session;
}
