import { createFileRoute } from '@tanstack/react-router';
import { mediaExif, MediaServiceError } from '@backend/services/media';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/exif')({ server: { handlers: {
  GET: async ({ request }) => {
    try {
      const urls = String(new URL(request.url).searchParams.get('urls') || '').split(',').map((url) => url.trim()).filter(Boolean);
      return apiOk(await mediaExif(urls));
    } catch (error) {
      if (error instanceof MediaServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
