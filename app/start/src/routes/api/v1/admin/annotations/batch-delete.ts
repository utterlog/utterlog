import { createFileRoute } from '@tanstack/react-router';
import { AnnotationServiceError, batchDeleteAnnotations } from '@backend/services/annotations';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/annotations/batch-delete')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try {
      const body = await request.json().catch(() => ({}));
      return apiOk(await batchDeleteAnnotations(body.ids));
    } catch (error) {
      if (error instanceof AnnotationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
