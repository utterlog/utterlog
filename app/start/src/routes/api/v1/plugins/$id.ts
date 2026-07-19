import { createFileRoute } from '@tanstack/react-router';
import { deletePlugin, ExtensionServiceError } from '@backend/routes/extensions';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/plugins/$id')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try { return apiOk(await deletePlugin(params.id)); }
    catch (error) {
      if (error instanceof ExtensionServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
