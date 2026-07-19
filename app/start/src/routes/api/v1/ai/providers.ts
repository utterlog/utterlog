import { createFileRoute } from '@tanstack/react-router';
import {
  aiProvidersPayload,
  AiServiceError,
  saveAiProviderPayload,
} from '@backend/routes/ai';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof AiServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/ai/providers')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => apiOk(await aiProvidersPayload())),
  POST: ({ request }) => withAdmin(request, async () => {
    try {
      return apiOk(await saveAiProviderPayload(await request.json().catch(() => ({}))));
    } catch (error) {
      return serviceError(error);
    }
  }),
} } });
