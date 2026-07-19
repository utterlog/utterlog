import { createFileRoute } from '@tanstack/react-router';
import { deleteTheme, ExtensionServiceError } from '@backend/routes/extensions';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/themes/$id')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try { return apiOk(await deleteTheme(params.id)); }
    catch (error) {
      if (error instanceof ExtensionServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
