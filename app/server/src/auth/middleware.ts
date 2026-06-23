import type { Context, Next } from 'hono';
import { verifyAccessToken } from './jwt';
import { forbidden, unauthorized } from '../http/response';
import { one } from '../db/helpers';
import { table } from '../config';

export type AuthVariables = {
  userId?: number;
  userRole?: string;
};

async function authenticateAccess(c: Context) {
  const header = c.req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { userId } = await verifyAccessToken(token);
  const user = await one<{ role: string; status: string }>(
    `select role, status from ${table('users')} where id = $1`,
    [userId],
  );
  if (!user || user.status !== 'active') throw new Error('inactive user');
  c.set('userId', userId);
  c.set('userRole', user.role);
  return { userId, role: user.role };
}

export async function auth(c: Context, next: Next) {
  try {
    const session = await authenticateAccess(c);
    if (!session) return unauthorized(c);
    await next();
  } catch {
    return unauthorized(c, 'Token 无效或已过期');
  }
}

export async function adminAuth(c: Context, next: Next) {
  try {
    const session = await authenticateAccess(c);
    if (!session) return unauthorized(c);
    if (session.role !== 'admin') return forbidden(c, '需要管理员权限');
    await next();
  } catch {
    return unauthorized(c, 'Token 无效或已过期');
  }
}

export async function optionalAuth(c: Context, next: Next) {
  try {
    await authenticateAccess(c);
  } catch {
    // Optional auth keeps public reads available when a visitor token is stale.
  }
  await next();
}

export function currentUserId(c: Context) {
  const userId = c.get('userId');
  return typeof userId === 'number' ? userId : 0;
}

export function currentUserRole(c: Context) {
  const role = c.get('userRole');
  return typeof role === 'string' ? role : '';
}
