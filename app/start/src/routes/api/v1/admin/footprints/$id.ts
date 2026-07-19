import { createFileRoute } from '@tanstack/react-router';
import { FootprintServiceError, updatePostFootprint } from '@backend/services/footprints';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/footprints/$id')({ server: { handlers: {
  PUT: ({ request, params }) => withAdmin(request, async () => {
    try {
      await updatePostFootprint(Number(params.id), await request.json().catch(() => ({})));
      return apiOk();
    } catch (error) {
      if (error instanceof FootprintServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
