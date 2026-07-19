import { createFileRoute } from '@tanstack/react-router';
import { ExternalContentServiceError, parseMediaLink } from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/parse')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try { return apiOk(await parseMediaLink(await request.json().catch(() => ({})))); }
    catch (error) {
      if (error instanceof ExternalContentServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
