import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { config, table } from '../config';
import { many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { authenticateRequest } from '../auth/session';
import { createPasswordResetToken, hashPasswordResetToken } from '../auth/password-reset';
import { sendConfiguredEmail } from '../email';
import { ephemeral } from '../store/ephemeral';

export class AuthServiceError extends Error {
  constructor(public readonly status: 400 | 401, public readonly code: string, message: string) {
    super(message);
  }
}

export type AuthUserRow = {
  id: number;
  username: string;
  email: string;
  password: string;
  nickname: string | null;
  avatar: string | null;
  bio?: string | null;
  url?: string | null;
  role: string;
  status: string;
  totp_enabled?: boolean;
  utterlog_id?: string | null;
  utterlog_avatar?: string | null;
};

export const authUserColumns = `id, username, email, password, nickname, avatar, bio, url, role, status,
  coalesce(totp_enabled, false) as totp_enabled, coalesce(utterlog_id, '') as utterlog_id,
  coalesce(utterlog_avatar, '') as utterlog_avatar`;

const loginSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
});

const refreshSchema = z.object({ refresh_token: z.string().trim().min(1).max(4096) });

const profileSchema = z.object({
  username: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(320).optional(),
  nickname: z.string().trim().max(120).optional(),
  avatar: z.string().trim().max(1000).optional(),
  bio: z.string().trim().max(2000).optional(),
  url: z.string().trim().max(1000).optional(),
  password: z.string().max(1024).optional(),
  verify_code: z.string().trim().max(20).optional(),
});

const passwordChangeSchema = z.object({
  old_password: z.string().min(1).max(1024).optional(),
  oldPassword: z.string().min(1).max(1024).optional(),
  current_password: z.string().min(1).max(1024).optional(),
  currentPassword: z.string().min(1).max(1024).optional(),
  new_password: z.string().min(8).max(1024).optional(),
  newPassword: z.string().min(8).max(1024).optional(),
  verify_code: z.string().trim().min(1).max(20).optional(),
  verifyCode: z.string().trim().min(1).max(20).optional(),
}).refine((body) => body.old_password || body.oldPassword || body.current_password || body.currentPassword, '当前密码不能为空')
  .refine((body) => body.new_password || body.newPassword, '新密码至少需要 8 个字符')
  .refine((body) => body.verify_code || body.verifyCode, '验证码不能为空');

const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) });

const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(128).optional(),
  reset_token: z.string().trim().min(32).max(128).optional(),
  password: z.string().min(8).max(1024).optional(),
  new_password: z.string().min(8).max(1024).optional(),
  newPassword: z.string().min(8).max(1024).optional(),
}).refine((body) => body.token || body.reset_token, '重置令牌不能为空')
  .refine((body) => body.password || body.new_password || body.newPassword, '新密码至少需要 8 个字符');

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AuthServiceError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || '参数错误');
  return parsed.data;
}

export async function requireAuthenticatedSession(request: Request) {
  try {
    const session = await authenticateRequest(request);
    if (!session) throw new Error('missing token');
    return session;
  } catch {
    throw new AuthServiceError(401, 'UNAUTHORIZED', 'Token 无效或已过期');
  }
}

export function publicAuthUser(user: AuthUserRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname || user.username,
    avatar: user.avatar || '',
    bio: user.bio || '',
    url: user.url || '',
    role: user.role,
    totp_enabled: !!user.totp_enabled,
    utterlog_id: user.utterlog_id || '',
    utterlog_avatar: user.utterlog_avatar || '',
  };
}

function emailHash(email: string) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

async function authUser(user: AuthUserRow) {
  const source = await optionValue('avatar_source', 'gravatar');
  const hash = emailHash(user.email);
  return {
    ...publicAuthUser(user),
    avatar: source === 'utterlog'
      ? `https://id.utterlog.com/avatar/${hash}`
      : `https://gravatar.bluecdn.com/avatar/${hash}?s=128&d=mp`,
  };
}

export async function issueAuthSession(user: AuthUserRow) {
  return { ...(await issueAuthTokens(user)), user: await authUser(user) };
}

export async function issueAuthTokens(user: AuthUserRow) {
  const access = await signAccessToken(user.id, {
    username: user.username,
    email: user.email,
    role: user.role,
    nickname: user.nickname || user.username,
  });
  return {
    access_token: access.token,
    refresh_token: await signRefreshToken(user.id),
    expires_in: 86400,
    expires_at: access.expiresAt,
    token_type: 'Bearer',
  };
}

export async function loginWithPassword(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new AuthServiceError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || '参数错误');
  const user = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where email = $1`, [parsed.data.email]);
  if (!user) throw new AuthServiceError(401, 'UNAUTHORIZED', '账号不存在');
  if (!(await Bun.password.verify(parsed.data.password, user.password).catch(() => false))) {
    throw new AuthServiceError(401, 'UNAUTHORIZED', '密码错误');
  }
  if (user.status !== 'active') throw new AuthServiceError(401, 'UNAUTHORIZED', '账号已停用');
  if (user.totp_enabled) {
    const tempToken = randomBytes(32).toString('hex');
    await ephemeral.set(`totp-login:${tempToken}`, String(user.id), 300);
    return { require_2fa: true, temp_token: tempToken };
  }
  return issueAuthSession(user);
}

export async function refreshAuthTokens(input: unknown) {
  const parsed = refreshSchema.safeParse(input);
  if (!parsed.success) throw new AuthServiceError(400, 'VALIDATION_ERROR', 'refresh_token 不能为空');
  try {
    const { userId } = await verifyRefreshToken(parsed.data.refresh_token);
    const user = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where id = $1`, [userId]);
    if (!user || user.status !== 'active') throw new Error('inactive user');
    return issueAuthTokens(user);
  } catch {
    throw new AuthServiceError(401, 'UNAUTHORIZED', 'Refresh Token 无效');
  }
}

export async function authenticatedUser(request: Request) {
  try {
    const session = await authenticateRequest(request);
    if (!session) throw new Error('missing token');
    const user = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where id = $1`, [session.userId]);
    if (!user) throw new Error('missing user');
    return authUser(user);
  } catch {
    throw new AuthServiceError(401, 'UNAUTHORIZED', 'Token 无效或已过期');
  }
}

export async function getProfile(request: Request) {
  const { userId } = await requireAuthenticatedSession(request);
  const user = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where id = $1`, [userId]);
  if (!user) throw new AuthServiceError(401, 'UNAUTHORIZED', '用户不存在');
  const profile = publicAuthUser(user);
  const avatarSource = await optionValue('avatar_source', 'gravatar');
  return {
    ...profile,
    avatar: user.avatar || '',
    avatar_source: avatarSource || 'gravatar',
    gravatar_url: profile.email ? `https://gravatar.bluecdn.com/avatar/${emailHash(profile.email)}?s=128&d=mp` : '',
    utterlog_avatar: user.utterlog_avatar || '',
  };
}

export async function updateProfile(request: Request, input: unknown) {
  const body = parseInput(profileSchema, input);
  const { userId } = await requireAuthenticatedSession(request);
  const current = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where id = $1`, [userId]);
  if (!current) throw new AuthServiceError(401, 'UNAUTHORIZED', '用户不存在');
  const username = String(body.username || current.username).trim();
  const email = String(body.email || current.email).trim();
  const identityChanged = email !== current.email || username !== current.username;
  if (identityChanged) {
    if (!body.password) throw new AuthServiceError(400, 'PASSWORD_REQUIRED', '修改邮箱或登录账号需要验证密码');
    if (!(await Bun.password.verify(body.password, current.password).catch(() => false))) {
      throw new AuthServiceError(400, 'WRONG_PASSWORD', '密码验证失败');
    }
    const verifyCode = String(body.verify_code || '').trim();
    if (!verifyCode) throw new AuthServiceError(400, 'CODE_REQUIRED', '修改邮箱或登录账号需要邮箱验证码');
    if (await ephemeral.get(`email_code:${userId}`) !== verifyCode) {
      throw new AuthServiceError(400, 'INVALID_CODE', '验证码错误或已过期');
    }
  }
  await many(
    `update ${table('users')} set username = $1, email = $2, nickname = $3, bio = $4, url = $5, avatar = $6, updated_at = $7 where id = $8`,
    [username, email, String(body.nickname ?? current.nickname ?? ''), String(body.bio ?? current.bio ?? ''),
      String(body.url ?? current.url ?? ''), String(body.avatar ?? current.avatar ?? ''), nowUnix(), userId],
  );
  if (identityChanged) await ephemeral.del(`email_code:${userId}`);
  const user = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where id = $1`, [userId]);
  return user ? publicAuthUser(user) : null;
}

export async function changePassword(request: Request, input: unknown) {
  const body = parseInput(passwordChangeSchema, input);
  const { userId } = await requireAuthenticatedSession(request);
  const verifyCode = String(body.verify_code || body.verifyCode || '').trim();
  if (await ephemeral.get(`email_code:${userId}`) !== verifyCode) {
    throw new AuthServiceError(400, 'INVALID_CODE', '验证码错误或已过期');
  }
  const user = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where id = $1`, [userId]);
  if (!user) throw new AuthServiceError(401, 'UNAUTHORIZED', '用户不存在');
  const oldPassword = String(body.old_password || body.oldPassword || body.current_password || body.currentPassword || '');
  if (!(await Bun.password.verify(oldPassword, user.password).catch(() => false))) {
    throw new AuthServiceError(400, 'WRONG_PASSWORD', '当前密码错误');
  }
  const newPassword = String(body.new_password || body.newPassword || '');
  const hash = await Bun.password.hash(newPassword, { algorithm: 'bcrypt' });
  await many(`update ${table('users')} set password = $1, updated_at = extract(epoch from now())::bigint where id = $2`, [hash, user.id]);
  await ephemeral.del(`email_code:${userId}`);
  return null;
}

export async function sendProfileVerificationCode(request: Request) {
  const { userId } = await requireAuthenticatedSession(request);
  const user = await one<{ email: string }>(`select email from ${table('users')} where id = $1`, [userId]);
  if (!user?.email) throw new AuthServiceError(400, 'BAD_REQUEST', '用户邮箱不存在');
  const code = String(randomInt(100000, 1000000));
  await ephemeral.set(`email_code:${userId}`, code, 300);
  await sendConfiguredEmail(user.email, 'Utterlog 验证码', `<p>你的验证码是：<strong>${code}</strong></p><p>5 分钟内有效。</p>`);
  return { sent: true };
}

export async function forgotPassword(input: unknown) {
  const { email } = parseInput(forgotPasswordSchema, input);
  const normalizedEmail = email.toLowerCase();
  const user = await one<{ id: number }>(`select id from ${table('users')} where lower(email) = $1`, [normalizedEmail]).catch(() => null);
  if (user) {
    const token = createPasswordResetToken();
    const resetUrl = `${config.appUrl.replace(/\/+$/, '')}/admin/reset-password?token=${token}`;
    await many(
      `update ${table('users')} set reset_token = $1, reset_token_expires_at = $2, updated_at = $3 where id = $4`,
      [hashPasswordResetToken(token), nowUnix() + 3600, nowUnix(), user.id],
    );
    await sendConfiguredEmail(normalizedEmail, 'Utterlog 密码重置链接',
      `<p>你正在重置 Utterlog 管理账号密码。</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>链接 1 小时内有效。</p>`).catch(() => {});
  }
  return { sent: true };
}

export async function resetPassword(input: unknown) {
  const body = parseInput(resetPasswordSchema, input);
  const token = String(body.token || body.reset_token || '').trim();
  const user = await one<AuthUserRow>(
    `select ${authUserColumns} from ${table('users')} where reset_token in ($1, $2) and reset_token_expires_at > $3`,
    [hashPasswordResetToken(token), token, nowUnix()],
  );
  if (!user) throw new AuthServiceError(401, 'UNAUTHORIZED', '重置令牌无效或已过期');
  const password = String(body.password || body.new_password || body.newPassword || '');
  const hash = await Bun.password.hash(password, { algorithm: 'bcrypt' });
  await many(
    `update ${table('users')} set password = $1, reset_token = '', reset_token_expires_at = 0, updated_at = $2 where id = $3`,
    [hash, nowUnix(), user.id],
  );
  return null;
}
