import { createFileRoute } from '@tanstack/react-router';
import { deleteMediaRecord, MediaServiceError } from '@backend/services/media';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/$id')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try {
      await deleteMediaRecord(Number(params.id));
      return apiOk(null);
    } catch (error) {
      if (error instanceof MediaServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
