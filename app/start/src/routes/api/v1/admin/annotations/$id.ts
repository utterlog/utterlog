import { createFileRoute } from '@tanstack/react-router';
import { AnnotationServiceError, deleteAnnotation } from '@backend/services/annotations';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/annotations/$id')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try { return apiOk(await deleteAnnotation(params.id)); }
    catch (error) {
      if (error instanceof AnnotationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
