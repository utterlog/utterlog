import { createFileRoute } from '@tanstack/react-router';
import { FederationServiceError, verifyFederationToken } from '@backend/routes/compat';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/federation/verify')({ server: { handlers: {
  POST: async ({ request }) => {
    try { return apiOk(await verifyFederationToken(await request.json().catch(() => ({})))); }
    catch (error) {
      if (error instanceof FederationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
