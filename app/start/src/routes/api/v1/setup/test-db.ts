import { createFileRoute } from '@tanstack/react-router';
import { InstallServiceError, testSetupDatabase } from '@backend/services/install';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/setup/test-db')({ server: { handlers: {
  POST: async ({ request }) => {
    try {
      return apiOk(await testSetupDatabase(await request.json().catch(() => ({}))));
    } catch (error) {
      if (error instanceof InstallServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
