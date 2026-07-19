import { describe, expect, test } from 'bun:test';
import { deleteMediaRecord, downloadMediaUrl, MediaServiceError, mediaExif } from '../src/backend/services/media';

describe('media service validation', () => {
  test('rejects invalid inputs before database or network access', async () => {
    await expect(deleteMediaRecord(0)).rejects.toBeInstanceOf(MediaServiceError);
    await expect(downloadMediaUrl({})).rejects.toBeInstanceOf(MediaServiceError);
    await expect(mediaExif([])).rejects.toBeInstanceOf(MediaServiceError);
  });
});
