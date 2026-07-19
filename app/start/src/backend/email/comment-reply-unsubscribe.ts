import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { nowUnix } from '../db/helpers';
import { optionValue, saveOption } from '../db/options';

function parseJsonOption<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function unsubscribeSecret() {
  let secret = (await optionValue('unsubscribe_secret', '')).trim();
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    await saveOption('unsubscribe_secret', secret);
  }
  return secret;
}

export async function verifyCommentReplyUnsubscribe(emailEnc: string, sig: string) {
  if (!emailEnc || !sig) return '';
  let email = '';
  try {
    email = Buffer.from(emailEnc, 'base64url').toString('utf8').trim().toLowerCase();
  } catch {
    return '';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  const mac = createHmac('sha256', await unsubscribeSecret()).update(`comment_reply:${email}`).digest('base64url').slice(0, 22);
  const a = Buffer.from(sig);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return '';
  return email;
}

export async function commentReplyUnsubscribeUrl(siteUrl: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  const enc = Buffer.from(normalized).toString('base64url');
  const sig = createHmac('sha256', await unsubscribeSecret()).update(`comment_reply:${normalized}`).digest('base64url').slice(0, 22);
  return `${siteUrl.replace(/\/+$/, '')}/api/v1/unsubscribe/comment-reply?e=${enc}&t=${sig}`;
}

export async function isCommentReplyOptedOut(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const optouts = parseJsonOption<Record<string, unknown>>(await optionValue('comment_reply_optouts_v1', '{}'), {});
  return Object.prototype.hasOwnProperty.call(optouts, normalized);
}

export async function addCommentReplyOptout(email: string) {
  const option = 'comment_reply_optouts_v1';
  const current = parseJsonOption<Record<string, number>>(await optionValue(option, '{}'), {});
  current[email.toLowerCase()] = nowUnix();
  await saveOption(option, JSON.stringify(current));
}
