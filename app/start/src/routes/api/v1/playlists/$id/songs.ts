import { createFileRoute } from '@tanstack/react-router';
import { addPlaylistSong, ContentRecordError, removePlaylistSong } from '@backend/services/content-records';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof ContentRecordError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/playlists/$id/songs')({ server: { handlers: {
  POST: ({ request, params }) => withAdmin(request, async () => {
    try {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      await addPlaylistSong(params.id, body.music_id || body.id);
      return apiOk(null);
    } catch (error) { return serviceError(error); }
  }),
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      await removePlaylistSong(params.id, body.music_id || body.id);
      return apiOk(null);
    } catch (error) { return serviceError(error); }
  }),
} } });
