import { createFileRoute } from '@tanstack/react-router';
import { ContentRecordError, importPlaylist } from '@backend/services/content-records';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/playlists/import')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async (session) => {
    try {
      return apiOk(await importPlaylist(await request.json().catch(() => ({})), session.userId));
    } catch (error) {
      if (error instanceof ContentRecordError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
