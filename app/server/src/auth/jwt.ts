import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { config } from '../config';

const issuer = 'utterlog-app';
const audience = 'utterlog-client';
const secret = new TextEncoder().encode(config.jwtSecret);

export type TokenData = {
  username?: string;
  email?: string;
  role?: string;
  nickname?: string;
};

export async function signAccessToken(userId: number, data: TokenData) {
  const expiresAt = Math.floor(Date.now() / 1000) + config.jwtTtl;
  const token = await new SignJWT({ type: 'access', data })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setJti(randomUUID())
    .sign(secret);
  return { token, expiresAt };
}

export async function signRefreshToken(userId: number) {
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime('30d')
    .setJti(randomUUID())
    .sign(secret);
}

export async function verifyToken(token: string) {
  const verified = await jwtVerify(token, secret, {
    issuer,
    audience,
  }).catch(async () => jwtVerify(token, secret, { issuer }));
  const userId = Number.parseInt(verified.payload.sub || '', 10);
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('invalid subject');
  return { userId, payload: verified.payload };
}

export async function verifyAccessToken(token: string) {
  const result = await verifyToken(token);
  if (result.payload.type !== 'access') throw new Error('invalid token type');
  return result;
}

export async function verifyRefreshToken(token: string) {
  const result = await verifyToken(token);
  if (result.payload.type !== 'refresh') throw new Error('invalid token type');
  return result;
}
