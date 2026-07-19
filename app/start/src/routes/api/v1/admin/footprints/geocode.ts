import { createFileRoute } from '@tanstack/react-router';
import { FootprintServiceError, geocodeFootprint } from '@backend/services/footprints';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/footprints/geocode')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try {
      return apiOk(await geocodeFootprint(await request.json().catch(() => ({}))));
    } catch (error) {
      if (error instanceof FootprintServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
