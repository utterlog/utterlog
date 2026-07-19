import { createFileRoute } from '@tanstack/react-router';
import { deleteAiProviderPayload } from '@backend/routes/ai';
import { apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/ai/providers/$id')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => apiOk(await deleteAiProviderPayload(params.id))),
} } });
