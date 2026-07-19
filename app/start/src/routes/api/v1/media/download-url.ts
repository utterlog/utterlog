import { createFileRoute } from '@tanstack/react-router';
import { downloadMediaUrl, MediaServiceError } from '@backend/services/media';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/download-url')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try {
      return apiOk(await downloadMediaUrl(await request.json().catch(() => ({}))));
    } catch (error) {
      if (error instanceof MediaServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
