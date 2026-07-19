import { createFileRoute } from '@tanstack/react-router';
import { FederationServiceError, receiveFederationWebhook } from '@backend/routes/compat';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/federation/webhook')({ server: { handlers: {
  POST: async ({ request }) => {
    try {
      return apiOk(await receiveFederationWebhook(await request.json().catch(() => ({})),
        request.headers.get('x-utterlog-webhook-secret') || ''));
    } catch (error) {
      if (error instanceof FederationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
