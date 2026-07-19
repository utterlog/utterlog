import { describe, expect, test } from 'bun:test';
import { commentCaptchaSvgDataUrl, randomCommentCaptchaCode } from '../src/backend/services/comment-captcha';

describe('comment captcha rendering', () => {
  test('uses an unambiguous alphabet and requested length', () => {
    const code = randomCommentCaptchaCode(24);
    expect(code).toHaveLength(24);
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/);
  });

  test('renders an SVG data URL', () => {
    const url = commentCaptchaSvgDataUrl('ABCD');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(Buffer.from(url.split(',')[1], 'base64').toString()).toContain('>A</text>');
  });
});
