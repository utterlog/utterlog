import { describe, expect, test } from 'bun:test';
import { deletePost, PostServiceError, updatePost } from '../src/backend/services/posts';

describe('post service validation', () => {
  test('rejects invalid mutation ids before database access', async () => {
    await expect(updatePost(0, {})).rejects.toBeInstanceOf(PostServiceError);
    await expect(deletePost(0)).rejects.toBeInstanceOf(PostServiceError);
  });
});
