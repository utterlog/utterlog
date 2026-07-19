import { describe, expect, test } from 'bun:test';
import { createMoment, deleteMoment, MomentServiceError, updateMoment } from '../src/backend/services/moments';

describe('moment service validation', () => {
  test('rejects empty content before database access', async () => {
    await expect(createMoment({ content: '   ' }, 1)).rejects.toBeInstanceOf(MomentServiceError);
  });

  test('rejects invalid mutation ids before database access', async () => {
    await expect(updateMoment(0, { content: 'test' })).rejects.toBeInstanceOf(MomentServiceError);
    await expect(deleteMoment(-1)).rejects.toBeInstanceOf(MomentServiceError);
  });
});
