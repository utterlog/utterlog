import { describe, expect, test } from 'bun:test';
import { replyToAdminComment } from '../src/backend/services/comments';

describe('admin comment reply validation', () => {
  test('rejects invalid ids before database access', async () => {
    await expect(replyToAdminComment(0, 1, { content: '有效回复' })).rejects.toThrow('无效的评论 ID');
    await expect(replyToAdminComment(1, 0, { content: '有效回复' })).rejects.toThrow('无效的用户 ID');
  });

  test('rejects empty and oversized replies before database access', async () => {
    await expect(replyToAdminComment(1, 1, { content: '  ' })).rejects.toThrow('回复内容不能为空');
    await expect(replyToAdminComment(1, 1, { content: '字'.repeat(20_001) })).rejects.toThrow('回复内容不能超过 20000 字');
  });
});
