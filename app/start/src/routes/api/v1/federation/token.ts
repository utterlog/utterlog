import { createFileRoute } from '@tanstack/react-router';
import { FederationServiceError, issueFederationToken } from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/federation/token')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async ({ userId }) => {
    try { return apiOk(await issueFederationToken(userId)); }
    catch (error) {
      if (error instanceof FederationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
