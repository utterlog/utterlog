import { createFileRoute } from '@tanstack/react-router';
import { addAlbumPhotos, ContentRecordError, listAlbumPhotos } from '@backend/services/content-records';
import { apiFail, apiOk, apiPaginated, withAdmin } from '../../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof ContentRecordError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/albums/$id/photos')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    try {
      const query = new URL(request.url).searchParams;
      const result = await listAlbumPhotos(params.id, { page: Number(query.get('page') || 1), perPage: Number(query.get('per_page') || 20) });
      return apiPaginated(result.rows, result.meta);
    } catch (error) { return serviceError(error); }
  }),
  POST: ({ request, params }) => withAdmin(request, async () => {
    try {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      return apiOk(await addAlbumPhotos(params.id, body.media_ids));
    } catch (error) { return serviceError(error); }
  }),
} } });
