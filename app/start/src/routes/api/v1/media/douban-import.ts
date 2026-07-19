import { createFileRoute } from '@tanstack/react-router';
import { doubanImportPayload, ExternalContentServiceError } from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/douban-import')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try { return apiOk(await doubanImportPayload(await request.json().catch(() => ({})))); }
    catch (error) {
      if (error instanceof ExternalContentServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
