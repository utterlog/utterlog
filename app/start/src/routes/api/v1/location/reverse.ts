import { createFileRoute } from '@tanstack/react-router';
import { FootprintServiceError, reverseLocation } from '@backend/services/footprints';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/location/reverse')({ server: { handlers: {
  GET: async ({ request }) => {
    const query = new URL(request.url).searchParams;
    try {
      return apiOk(await reverseLocation(Number(query.get('lat')), Number(query.get('lng'))));
    } catch (error) {
      if (error instanceof FootprintServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
