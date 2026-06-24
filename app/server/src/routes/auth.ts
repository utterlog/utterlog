import type { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config, table } from '../config';
import { many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { sendConfiguredEmail } from '../email';
import { badRequest, ok, unauthorized } from '../http/response';
import { nonEmptyString, parseJson } from '../http/validation';
import { auth, currentUserId } from '../auth/middleware';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { createPasswordResetToken, hashPasswordResetToken } from '../auth/password-reset';
import { ephemeral } from '../store/ephemeral';

type UserRow = {
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

const userColumns = 'id, username, email, password, nickname, avatar, bio, url, role, status, coalesce(totp_enabled, false) as totp_enabled, coalesce(utterlog_id, \'\') as utterlog_id, coalesce(utterlog_avatar, \'\') as utterlog_avatar';

const loginSchema = z.object({
  email: nonEmptyString(320),
  password: z.string().min(1).max(1024),
});

const refreshSchema = z.object({
  refresh_token: nonEmptyString(4096),
});

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

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(320),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(128).optional(),
  reset_token: z.string().trim().min(32).max(128).optional(),
  password: z.string().min(8).max(1024).optional(),
  new_password: z.string().min(8).max(1024).optional(),
  newPassword: z.string().min(8).max(1024).optional(),
}).refine((body) => body.token || body.reset_token, '重置令牌不能为空')
  .refine((body) => body.password || body.new_password || body.newPassword, '新密码至少需要 8 个字符');

function publicUser(user: UserRow) {
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

function gravatarUrl(email: string, size = 128) {
  return `https://gravatar.bluecdn.com/avatar/${emailHash(email)}?s=${size}&d=mp`;
}

function utterlogAvatarUrl(email: string) {
  return `https://id.utterlog.com/avatar/${emailHash(email)}`;
}

import { optionValue } from '../db/options';
async function authUser(user: UserRow) {
  const source = await optionValue('avatar_source', 'gravatar');
  return {
    ...publicUser(user),
    avatar: source === 'utterlog' ? utterlogAvatarUrl(user.email) : gravatarUrl(user.email, 128),
  };
}

async function issueTokens(user: UserRow) {
  const data = {
    username: user.username,
    email: user.email,
    role: user.role,
    nickname: user.nickname || user.username,
  };
  const access = await signAccessToken(user.id, data);
  const refresh = await signRefreshToken(user.id);
  return {
    access_token: access.token,
    refresh_token: refresh,
    expires_in: 86400,
    expires_at: access.expiresAt,
    token_type: 'Bearer',
  };
}

export function registerAuthRoutes(app: Hono) {
  app.post('/api/v1/auth/login', async (c) => {
    const parsed = await parseJson(c, loginSchema);
    if (!parsed.ok) return parsed.response;
    const { email, password } = parsed.data;
    const user = await one<UserRow>(`select ${userColumns} from ${table('users')} where email = $1`, [email]);
    if (!user) return unauthorized(c, '账号不存在');
    const valid = await Bun.password.verify(password, user.password).catch(() => false);
    if (!valid) return unauthorized(c, '密码错误');
    if (user.totp_enabled) {
      const tempToken = randomBytes(32).toString('hex');
      await ephemeral.set(`totp-login:${tempToken}`, String(user.id), 300);
      return ok(c, { require_2fa: true, temp_token: tempToken });
    }
    return ok(c, { ...(await issueTokens(user)), user: await authUser(user) });
  });

  app.post('/api/v1/auth/refresh', async (c) => {
    const parsed = await parseJson(c, refreshSchema);
    if (!parsed.ok) return parsed.response;
    const token = parsed.data.refresh_token;
    try {
      const { userId } = await verifyRefreshToken(token);
      const user = await one<UserRow>(`select ${userColumns} from ${table('users')} where id = $1`, [userId]);
      if (!user) return unauthorized(c, '用户不存在');
      return ok(c, await issueTokens(user));
    } catch {
      return unauthorized(c, 'Refresh Token 无效');
    }
  });

  app.post('/api/v1/auth/logout', auth, (c) => ok(c, null));

  app.get('/api/v1/auth/me', auth, async (c) => {
    const user = await one<UserRow>(`select ${userColumns} from ${table('users')} where id = $1`, [currentUserId(c)]);
    if (!user) return unauthorized(c, '用户不存在');
    return ok(c, await authUser(user));
  });

  app.get('/api/v1/profile', auth, async (c) => {
    const user = await one<UserRow>(`select ${userColumns} from ${table('users')} where id = $1`, [currentUserId(c)]);
    if (!user) return unauthorized(c, '用户不存在');
    const profile = publicUser(user);
    const avatarSource = await optionValue('avatar_source', 'gravatar');
    return ok(c, {
      ...profile,
      avatar: user.avatar || '',
      avatar_source: avatarSource || 'gravatar',
      gravatar_url: profile.email ? gravatarUrl(profile.email, 128) : '',
      utterlog_avatar: user.utterlog_avatar || '',
    });
  });

  app.put('/api/v1/profile', auth, async (c) => {
    const parsed = await parseJson(c, profileSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const userId = currentUserId(c);
    const current = await one<UserRow>(`select ${userColumns} from ${table('users')} where id = $1`, [userId]);
    if (!current) return unauthorized(c, '用户不存在');
    const username = String(body.username || current.username).trim();
    const email = String(body.email || current.email).trim();
    if (!username || !email) return badRequest(c, '用户名和邮箱不能为空');
    const emailChanged = email !== current.email;
    const usernameChanged = username !== current.username;
    if (emailChanged || usernameChanged) {
      const password = String(body.password || '');
      if (!password) return badRequest(c, '修改邮箱或登录账号需要验证密码', 'PASSWORD_REQUIRED');
      const passwordOK = await Bun.password.verify(password, current.password).catch(() => false);
      if (!passwordOK) return badRequest(c, '密码验证失败', 'WRONG_PASSWORD');
      const verifyCode = String(body.verify_code || '').trim();
      if (!verifyCode) return badRequest(c, '修改邮箱或登录账号需要邮箱验证码', 'CODE_REQUIRED');
      const storedCode = await ephemeral.get(`email_code:${userId}`);
      if (!storedCode || storedCode !== verifyCode) return badRequest(c, '验证码错误或已过期', 'INVALID_CODE');
    }
    await many(
      `update ${table('users')} set username = $1, email = $2, nickname = $3, bio = $4, url = $5, avatar = $6, updated_at = $7 where id = $8`,
      [
        username,
        email,
        String(body.nickname ?? current.nickname ?? ''),
        String(body.bio ?? current.bio ?? ''),
        String(body.url ?? current.url ?? ''),
        String(body.avatar ?? current.avatar ?? ''),
        nowUnix(),
        userId,
      ],
    );
    if (emailChanged || usernameChanged) await ephemeral.del(`email_code:${userId}`);
    const user = await one<UserRow>(`select ${userColumns} from ${table('users')} where id = $1`, [userId]);
    return ok(c, user ? publicUser(user) : null);
  });

  app.put('/api/v1/auth/password', auth, async (c) => {
    const parsed = await parseJson(c, passwordChangeSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const oldPassword = String(body.old_password || body.oldPassword || body.current_password || body.currentPassword || '');
    const newPassword = String(body.new_password || body.newPassword || '');
    const verifyCode = String(body.verify_code || body.verifyCode || '').trim();
    const storedCode = await ephemeral.get(`email_code:${currentUserId(c)}`);
    if (!storedCode || storedCode !== verifyCode) return badRequest(c, '验证码错误或已过期', 'INVALID_CODE');
    const user = await one<UserRow>(`select ${userColumns} from ${table('users')} where id = $1`, [currentUserId(c)]);
    if (!user) return unauthorized(c, '用户不存在');
    const valid = await Bun.password.verify(oldPassword, user.password).catch(() => false);
    if (!valid) return badRequest(c, '当前密码错误', 'WRONG_PASSWORD');
    const hash = await Bun.password.hash(newPassword, { algorithm: 'bcrypt' });
    await many(`update ${table('users')} set password = $1, updated_at = extract(epoch from now())::bigint where id = $2`, [hash, user.id]);
    await ephemeral.del(`email_code:${currentUserId(c)}`);
    return ok(c, null);
  });

  app.post('/api/v1/auth/forgot-password', async (c) => {
    const parsed = await parseJson(c, forgotPasswordSchema);
    if (!parsed.ok) return parsed.response;
    const email = parsed.data.email.toLowerCase();
    const user = await one<{ id: number }>(`select id from ${table('users')} where lower(email) = $1`, [email]).catch(() => null);
    if (user) {
      const token = createPasswordResetToken();
      const tokenHash = hashPasswordResetToken(token);
      const resetUrl = `${config.appUrl.replace(/\/+$/, '')}/admin/reset-password?token=${token}`;
      await many(
        `update ${table('users')} set reset_token = $1, reset_token_expires_at = $2, updated_at = $3 where id = $4`,
        [tokenHash, nowUnix() + 3600, nowUnix(), user.id],
      );
      await sendConfiguredEmail(
        email,
        'Utterlog 密码重置链接',
        `<p>你正在重置 Utterlog 管理账号密码。</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>链接 1 小时内有效。</p>`,
      ).catch(() => {});
    }
    return ok(c, { sent: true });
  });

  app.post('/api/v1/auth/reset-password', async (c) => {
    const parsed = await parseJson(c, resetPasswordSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const token = String(body.token || body.reset_token || '').trim();
    const tokenHash = hashPasswordResetToken(token);
    const newPassword = String(body.password || body.new_password || body.newPassword || '');
    const user = await one<UserRow>(
      `select ${userColumns} from ${table('users')} where reset_token in ($1, $2) and reset_token_expires_at > $3`,
      [tokenHash, token, nowUnix()],
    );
    if (!user) return unauthorized(c, '重置令牌无效或已过期');
    const hash = await Bun.password.hash(newPassword, { algorithm: 'bcrypt' });
    await many(
      `update ${table('users')} set password = $1, reset_token = '', reset_token_expires_at = 0, updated_at = $2 where id = $3`,
      [hash, nowUnix(), user.id],
    );
    return ok(c, null);
  });
}
