import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { AnnotationServiceError, createAnnotation, listAnnotations } from '@backend/services/annotations';
import { apiFail, apiOk } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof AnnotationServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/annotations/')({ server: { handlers: {
  GET: async ({ request }) => {
    try { return apiOk(await listAnnotations(new URL(request.url).searchParams.get('post_id'))); }
    catch (error) { return serviceError(error); }
  },
  POST: async ({ request }) => {
    try {
      const session = await authenticateRequest(request).catch(() => null);
      return apiOk(await createAnnotation(await request.json().catch(() => ({})), session?.userId || 0));
    } catch (error) { return serviceError(error); }
  },
} } });
