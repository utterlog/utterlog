import { describe, expect, test } from 'bun:test';
import { createPublicComment } from '../src/backend/services/public-comments';

const request = { ip: '127.0.0.1', userAgent: 'test', passportToken: '', userId: 0 };

describe('public comment validation', () => {
  test('rejects short and oversized comments before database access', async () => {
    await expect(createPublicComment({ content: '短' }, request)).rejects.toThrow('评论内容至少 5 个字');
    await expect(createPublicComment({ content: '字'.repeat(20_001) }, request)).rejects.toThrow('评论内容不能超过 20000 字');
  });
});
