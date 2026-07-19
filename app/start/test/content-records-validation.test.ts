import { describe, expect, test } from 'bun:test';
import { addAlbumPhotos, addPlaylistSong, asContentResource, ContentRecordError, deleteContentRecord, removeAlbumPhoto, updateContentRecord } from '../src/backend/services/content-records';

describe('content record validation', () => {
  test('rejects unknown resources and invalid ids before database access', async () => {
    expect(() => asContentResource('posts')).toThrow(ContentRecordError);
    await expect(updateContentRecord('books', 0, {})).rejects.toBeInstanceOf(ContentRecordError);
    await expect(deleteContentRecord('movies', -1)).rejects.toBeInstanceOf(ContentRecordError);
    await expect(addPlaylistSong(0, 1)).rejects.toBeInstanceOf(ContentRecordError);
    await expect(addAlbumPhotos(0, [])).rejects.toBeInstanceOf(ContentRecordError);
    await expect(removeAlbumPhoto(1, 0)).rejects.toBeInstanceOf(ContentRecordError);
  });
});
