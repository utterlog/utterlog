import { createFileRoute } from '@tanstack/react-router';
import { ContentRecordError, removeAlbumPhoto } from '@backend/services/content-records';
import { apiFail, apiOk, withAdmin } from '../../../../../../server/http';

export const Route = createFileRoute('/api/v1/albums/$id/photos/$mediaId')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try {
      return apiOk(await removeAlbumPhoto(params.id, params.mediaId));
    } catch (error) {
      if (error instanceof ContentRecordError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
