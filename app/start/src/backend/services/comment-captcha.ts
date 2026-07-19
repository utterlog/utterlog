import { createHash } from 'node:crypto';
import { nowUnix } from '../db/helpers';
import { optionValue } from '../db/options';
import { ephemeral } from '../store/ephemeral';
import { PublicWriteError } from './public-write';

export async function commentCaptchaMode() {
  const mode = (await optionValue('comment_captcha_mode', '')).trim();
  if (mode === 'pow' || mode === 'image' || mode === 'off') return mode;
  const legacy = (await optionValue('comment_captcha_enabled', '1')).trim().toLowerCase();
  return legacy === '0' || legacy === 'false' ? 'off' : 'pow';
}

export async function commentCaptchaDifficulty() {
  const raw = Number.parseInt(await optionValue('comment_captcha_difficulty', '4'), 10);
  if (!Number.isFinite(raw)) return 4;
  return Math.min(6, Math.max(1, raw));
}

export function randomCommentCaptchaCode(length = 4) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function svgEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function commentCaptchaSvgDataUrl(code: string) {
  const dots = Array.from({ length: 70 }, () => {
    const x = Math.floor(Math.random() * 120);
    const y = Math.floor(Math.random() * 40);
    const opacity = (0.12 + Math.random() * 0.28).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="1" fill="#334155" opacity="${opacity}" />`;
  }).join('');
  const lines = Array.from({ length: 3 }, () => {
    const x1 = Math.floor(Math.random() * 120);
    const y1 = Math.floor(Math.random() * 40);
    const x2 = Math.floor(Math.random() * 120);
    const y2 = Math.floor(Math.random() * 40);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1" opacity="0.55" />`;
  }).join('');
  const letters = code.split('').map((ch, idx) => {
    const x = 12 + idx * 26 + Math.floor(Math.random() * 4);
    const y = 28 + Math.floor(Math.random() * 5);
    const rotate = -12 + Math.floor(Math.random() * 25);
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})">${svgEscape(ch)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
    <rect width="120" height="40" fill="#f8fafc"/>
    ${dots}${lines}
    <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="24" font-weight="700" fill="#323278">${letters}</g>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function verifyPowCaptcha(challenge: unknown, nonce: unknown) {
  const id = String(challenge || '').trim();
  const value = String(nonce || '').trim();
  if (!id || !value) return false;
  const stored = await ephemeral.get(`captcha:${id}`);
  if (!stored) return false;
  const [difficultyText, expiresText] = stored.split(':');
  const difficulty = Number.parseInt(difficultyText || '', 10);
  const expires = Number.parseInt(expiresText || '', 10);
  if (!Number.isFinite(difficulty) || !Number.isFinite(expires) || nowUnix() > expires) {
    await ephemeral.del(`captcha:${id}`);
    return false;
  }
  const hash = createHash('sha256').update(id + value).digest('hex');
  const valid = hash.startsWith('0'.repeat(difficulty));
  if (valid) await ephemeral.del(`captcha:${id}`);
  return valid;
}

async function verifyImageCaptcha(id: unknown, code: unknown) {
  const key = String(id || '').trim();
  const input = String(code || '').trim().toLowerCase();
  if (!key || !input) return false;
  const expected = await ephemeral.get(`captcha:img:${key}`);
  if (!expected) return false;
  const valid = input === expected;
  if (valid) await ephemeral.del(`captcha:img:${key}`);
  return valid;
}

export async function verifyCommentCaptcha(body: Record<string, unknown>) {
  const mode = await commentCaptchaMode();
  if (mode === 'off') return true;
  if (mode === 'image') return verifyImageCaptcha(body.captcha_id, body.captcha_code);
  return verifyPowCaptcha(body.captcha_challenge, body.captcha_nonce);
}

export async function createCommentCaptchaChallenge() {
  const mode = await commentCaptchaMode();
  if (mode === 'off') return { enabled: false, mode: 'off' as const };
  if (mode === 'image') return { enabled: true, mode: 'image' as const };
  const challenge = crypto.randomUUID().replaceAll('-', '');
  const difficulty = await commentCaptchaDifficulty();
  const expires = nowUnix() + 120;
  await ephemeral.set(`captcha:${challenge}`, `${difficulty}:${expires}`, 120);
  return { enabled: true, mode: 'pow' as const, challenge, difficulty, expires };
}

export async function createCommentImageCaptcha(seed = '') {
  if (await commentCaptchaMode() !== 'image') {
    throw new PublicWriteError(400, 'WRONG_MODE', '图片验证码未启用');
  }
  const code = randomCommentCaptchaCode();
  const id = createHash('md5').update(`${Date.now()}-${seed}-${code}-${Math.random()}`).digest('hex');
  await ephemeral.set(`captcha:img:${id}`, code.toLowerCase(), 300);
  return { id, image: commentCaptchaSvgDataUrl(code) };
}
