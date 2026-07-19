import { createFileRoute } from '@tanstack/react-router';
import { AiServiceError, deleteAiCommentPayload } from '@backend/routes/ai';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/ai-comments/$id')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try {
      return apiOk(await deleteAiCommentPayload(params.id));
    } catch (error) {
      if (error instanceof AiServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
