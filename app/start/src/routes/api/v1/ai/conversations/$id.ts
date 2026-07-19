import { createFileRoute } from '@tanstack/react-router';
import {
  aiConversationPayload,
  AiServiceError,
  deleteAiConversationPayload,
} from '@backend/routes/ai';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof AiServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/ai/conversations/$id')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async ({ userId }) => {
    try {
      return apiOk(await aiConversationPayload(params.id, userId));
    } catch (error) {
      return serviceError(error);
    }
  }),
  DELETE: ({ request, params }) => withAdmin(request, async ({ userId }) => (
    apiOk(await deleteAiConversationPayload(params.id, userId))
  )),
} } });
