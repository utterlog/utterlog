import { createFileRoute } from '@tanstack/react-router';
import { AiServiceError, mutateAiCommentPayload } from '@backend/routes/ai';
import { apiFail, apiOk, withAdmin } from '../../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/ai-comments/$id/$action')({ server: { handlers: {
  POST: ({ request, params }) => withAdmin(request, async ({ userId }) => {
    try {
      const body = await request.json().catch(() => ({}));
      return apiOk(await mutateAiCommentPayload(params.id, params.action, body, userId));
    } catch (error) {
      if (error instanceof AiServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
