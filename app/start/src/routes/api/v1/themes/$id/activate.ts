import { createFileRoute } from '@tanstack/react-router';
import { activateTheme, ExtensionServiceError } from '@backend/routes/extensions';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/themes/$id/activate')({ server: { handlers: {
  POST: ({ request, params }) => withAdmin(request, async () => {
    try { return apiOk(await activateTheme(params.id, await request.json().catch(() => ({})))); }
    catch (error) {
      if (error instanceof ExtensionServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
