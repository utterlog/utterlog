import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { config, table } from '../config';
import { exec, intParam, many, nowUnix, one } from '../db/helpers';
import { optionValue } from '../db/options';
import { ephemeral } from '../store/ephemeral';
import { AuthServiceError, authUserColumns, issueAuthSession, requireAuthenticatedSession, type AuthUserRow } from './auth';

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of secret.replace(/=+$/g, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(ch);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpCode(secret: string, step = Math.floor(Date.now() / 1000 / 30)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string, step = Math.floor(Date.now() / 1000 / 30)) {
  const normalized = code.replace(/\s+/g, '');
  return [-1, 0, 1].some((delta) => generateTotpCode(secret, step + delta) === normalized);
}

async function backupCodes() {
  const codes = Array.from({ length: 8 }, () => randomBytes(5).toString('hex'));
  const hashes = await Promise.all(codes.map((code) => Bun.password.hash(code, { algorithm: 'bcrypt' })));
  return { codes, hashes };
}

async function consumeBackupCode(userId: number, value: string | null | undefined, code: string) {
  const hashes = parseJson<string[]>(String(value || '[]'), []);
  for (let index = 0; index < hashes.length; index++) {
    if (!(await Bun.password.verify(code, hashes[index]).catch(() => false))) continue;
    hashes.splice(index, 1);
    await exec(`update ${table('users')} set totp_backup_codes = $1, updated_at = $2 where id = $3`,
      [JSON.stringify(hashes), nowUnix(), userId]);
    return true;
  }
  return false;
}

function fail(status: 400 | 401, code: string, message: string): never {
  throw new AuthServiceError(status, code, message);
}

function base64urlToBuffer(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '='), 'base64');
}

function bufferToBase64url(value: Uint8Array | Buffer) {
  return Buffer.from(value).toString('base64url');
}

async function relyingParty() {
  const configured = (await optionValue('site_url', config.appUrl)).trim() || config.appUrl;
  const origin = configured.replace(/\/+$/, '') || 'http://localhost:8080';
  return { origin, rpID: new URL(origin).hostname };
}

function webAuthnUserId(userId: number) {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(userId));
  return value;
}

async function owner() {
  return one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where role = 'admin' order by id asc limit 1`);
}

export async function setupTotp(request: Request) {
  const { userId } = await requireAuthenticatedSession(request);
  const existing = await one<{ totp_enabled: boolean }>(
    `select coalesce(totp_enabled, false) as totp_enabled from ${table('users')} where id = $1`, [userId]);
  if (existing?.totp_enabled) fail(400, 'TOTP_ALREADY_ENABLED', '两步验证已启用');
  const secret = base32Encode(randomBytes(20));
  await exec(`update ${table('users')} set totp_secret = $1 where id = $2`, [secret, userId]);
  const user = await one<{ email: string; username: string }>(`select email, username from ${table('users')} where id = $1`, [userId]);
  const title = await optionValue('site_title', 'Utterlog');
  const label = encodeURIComponent(`${title}:${user?.email || user?.username || userId}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(title)}&algorithm=SHA1&digits=6&period=30`;
  return { secret, uri, qr_code: uri };
}

export async function enableTotp(request: Request, input: unknown) {
  const { userId } = await requireAuthenticatedSession(request);
  const body = (input || {}) as Record<string, unknown>;
  const user = await one<{ totp_secret: string; totp_enabled: boolean }>(
    `select totp_secret, coalesce(totp_enabled, false) as totp_enabled from ${table('users')} where id = $1`, [userId]);
  if (user?.totp_enabled) fail(400, 'TOTP_ALREADY_ENABLED', '两步验证已启用');
  if (!user?.totp_secret) fail(400, 'TOTP_NOT_SETUP', '请先设置两步验证');
  if (!verifyTotpCode(user.totp_secret, String(body.code || ''))) fail(400, 'INVALID_TOTP', '验证码错误');
  const backup = await backupCodes();
  await exec(`update ${table('users')} set totp_enabled = true, totp_backup_codes = $1, updated_at = $2 where id = $3`,
    [JSON.stringify(backup.hashes), nowUnix(), userId]);
  return { enabled: true, backup_codes: backup.codes };
}

export async function disableTotp(request: Request, input: unknown) {
  const { userId } = await requireAuthenticatedSession(request);
  const body = (input || {}) as Record<string, unknown>;
  const password = String(body.password || '').trim();
  const code = String(body.code || '').trim();
  if (!password || !code) fail(400, 'BAD_REQUEST', '密码和验证码不能为空');
  const user = await one<{ id: number; password: string; totp_secret: string; totp_enabled: boolean; totp_backup_codes: string | null }>(
    `select id, password, totp_secret, coalesce(totp_enabled, false) as totp_enabled, totp_backup_codes from ${table('users')} where id = $1`, [userId]);
  if (!user) fail(400, 'NO_USER', '用户不存在');
  if (!user.totp_enabled) fail(400, 'TOTP_NOT_ENABLED', '两步验证未启用');
  if (!(await Bun.password.verify(password, user.password).catch(() => false))) fail(401, 'INVALID_PASSWORD', '密码错误');
  if (!(verifyTotpCode(user.totp_secret, code) || await consumeBackupCode(user.id, user.totp_backup_codes, code))) {
    fail(400, 'INVALID_CODE', '验证码错误');
  }
  await exec(`update ${table('users')} set totp_enabled = false, totp_secret = '', totp_backup_codes = '', updated_at = $1 where id = $2`,
    [nowUnix(), userId]);
  return { enabled: false };
}

export async function validateTotpLogin(input: unknown) {
  const body = (input || {}) as Record<string, unknown>;
  const tempToken = String(body.temp_token || '').trim();
  if (!tempToken) fail(401, 'UNAUTHORIZED', '临时 Token 无效或已过期');
  const userId = intParam(await ephemeral.get(`totp-login:${tempToken}`) || '');
  if (!userId) fail(401, 'UNAUTHORIZED', '临时 Token 无效或已过期');
  const user = await one<AuthUserRow & { totp_secret: string; totp_backup_codes: string | null }>(
    `select ${authUserColumns}, totp_secret, totp_backup_codes from ${table('users')} where id = $1`, [userId]);
  const code = String(body.code || '');
  if (!user?.totp_enabled || !(verifyTotpCode(user.totp_secret, code) || await consumeBackupCode(user.id, user.totp_backup_codes, code))) {
    fail(400, 'INVALID_TOTP', '验证码错误');
  }
  await ephemeral.del(`totp-login:${tempToken}`);
  return issueAuthSession(user);
}

export async function beginPasskeyRegistration(request: Request) {
  const { userId } = await requireAuthenticatedSession(request);
  const user = await one<{ id: number; username: string; email: string; nickname: string | null }>(
    `select id, username, email, nickname from ${table('users')} where id = $1`, [userId]);
  if (!user) fail(400, 'NO_USER', '用户不存在');
  const { rpID } = await relyingParty();
  const existing = await many<{ credential_id: Uint8Array }>(`select credential_id from ${table('passkeys')} where user_id = $1`, [user.id]);
  const publicKey = await generateRegistrationOptions({
    rpName: await optionValue('site_title', 'Utterlog'), rpID, userID: webAuthnUserId(user.id),
    userName: user.email || user.username, userDisplayName: user.nickname || user.username, attestationType: 'none',
    excludeCredentials: existing.map((row) => ({ id: bufferToBase64url(row.credential_id) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  const sessionId = randomUUID();
  await ephemeral.set(`webauthn:${sessionId}`, JSON.stringify({ challenge: publicKey.challenge, user_id: user.id }), 300);
  return { publicKey, session_id: sessionId };
}

export async function finishPasskeyRegistration(request: Request, input: unknown) {
  const { userId } = await requireAuthenticatedSession(request);
  const body = (input || {}) as RegistrationResponseJSON & { name?: string; session_id?: string };
  const sessionId = request.headers.get('X-WebAuthn-Session') || String(body.session_id || '').trim();
  const session = parseJson<{ challenge: string; user_id: number } | null>(await ephemeral.get(`webauthn:${sessionId}`) || 'null', null);
  if (!session || session.user_id !== userId) fail(400, 'SESSION_EXPIRED', '会话已过期，请重试');
  await ephemeral.del(`webauthn:${sessionId}`);
  const { origin, rpID } = await relyingParty();
  const verification = await verifyRegistrationResponse({ response: body, expectedChallenge: session.challenge,
    expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false })
    .catch(() => fail(400, 'REGISTRATION_FAILED', 'Passkey 注册验证失败'));
  if (!verification.verified || !verification.registrationInfo) fail(400, 'REGISTRATION_FAILED', 'Passkey 注册验证失败');
  const info = verification.registrationInfo;
  const url = new URL(request.url);
  await exec(
    `insert into ${table('passkeys')} (user_id, credential_id, public_key, attestation_type, aaguid, sign_count, backup_eligible, backup_state, name, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (credential_id) do update set name = excluded.name`,
    [userId, base64urlToBuffer(info.credential.id), Buffer.from(info.credential.publicKey), info.fmt || '',
      Buffer.from(String(info.aaguid || '').replace(/-/g, ''), 'hex'), info.credential.counter || 0,
      info.credentialDeviceType === 'multiDevice', info.credentialBackedUp,
      String(body.name || url.searchParams.get('name') || request.headers.get('X-Passkey-Name') || '通行密钥'), nowUnix()],
  );
  return { ok: true };
}

export async function beginPasskeyLogin() {
  const user = await owner();
  if (!user) fail(400, 'NO_USER', '未找到管理员');
  const credentials = await many<{ credential_id: Uint8Array }>(`select credential_id from ${table('passkeys')} where user_id = $1`, [user.id]);
  if (!credentials.length) fail(400, 'NO_PASSKEYS', '未注册通行密钥');
  const { rpID } = await relyingParty();
  const publicKey = await generateAuthenticationOptions({ rpID,
    allowCredentials: credentials.map((row) => ({ id: bufferToBase64url(row.credential_id) })), userVerification: 'preferred' });
  const sessionId = randomUUID();
  await ephemeral.set(`webauthn:${sessionId}`, JSON.stringify({ challenge: publicKey.challenge, user_id: user.id }), 300);
  return { publicKey, session_id: sessionId };
}

export async function finishPasskeyLogin(request: Request, input: unknown) {
  const body = (input || {}) as AuthenticationResponseJSON & { session_id?: string };
  const sessionId = request.headers.get('X-WebAuthn-Session') || String(body.session_id || '').trim();
  const session = parseJson<{ challenge: string; user_id: number } | null>(await ephemeral.get(`webauthn:${sessionId}`) || 'null', null);
  if (!session) fail(400, 'SESSION_EXPIRED', '会话已过期');
  await ephemeral.del(`webauthn:${sessionId}`);
  const credentialId = base64urlToBuffer(body.rawId || body.id || '');
  const credential = await one<{ user_id: number; credential_id: Uint8Array; public_key: Uint8Array; sign_count: number }>(
    `select user_id, credential_id, public_key, sign_count from ${table('passkeys')} where credential_id = $1`, [credentialId]);
  if (!credential || credential.user_id !== session.user_id) fail(400, 'AUTH_FAILED', '通行密钥不存在');
  const { origin, rpID } = await relyingParty();
  const verification = await verifyAuthenticationResponse({ response: body, expectedChallenge: session.challenge,
    expectedOrigin: origin, expectedRPID: rpID, credential: { id: bufferToBase64url(credential.credential_id),
      publicKey: new Uint8Array(credential.public_key), counter: Number(credential.sign_count || 0) }, requireUserVerification: false })
    .catch(() => fail(400, 'AUTH_FAILED', 'Passkey 认证失败'));
  if (!verification.verified) fail(400, 'AUTH_FAILED', 'Passkey 认证失败');
  await exec(`update ${table('passkeys')} set sign_count = $1, backup_eligible = $2, backup_state = $3, last_used_at = $4 where credential_id = $5`,
    [verification.authenticationInfo.newCounter, verification.authenticationInfo.credentialDeviceType === 'multiDevice',
      verification.authenticationInfo.credentialBackedUp, nowUnix(), base64urlToBuffer(verification.authenticationInfo.credentialID)]);
  const user = await one<AuthUserRow>(`select ${authUserColumns} from ${table('users')} where id = $1`, [credential.user_id]);
  if (!user) fail(400, 'NO_USER', '用户不存在');
  return issueAuthSession(user);
}

export async function passkeyAvailability() {
  const row = await one<{ count: string }>(`select count(*)::text as count from ${table('passkeys')}`).catch(() => null);
  const registered = Number(row?.count || 0);
  return { available: registered > 0, registered };
}

export async function listPasskeys(request: Request) {
  const { userId } = await requireAuthenticatedSession(request);
  return many<Record<string, unknown>>(
    `select id, name, sign_count, last_used_at, created_at, backup_eligible, backup_state from ${table('passkeys')} where user_id = $1 order by created_at desc`, [userId]);
}

export async function deletePasskey(request: Request, id: string) {
  const { userId } = await requireAuthenticatedSession(request);
  await exec(`delete from ${table('passkeys')} where id = $1 and user_id = $2`, [id, userId]);
  return null;
}
