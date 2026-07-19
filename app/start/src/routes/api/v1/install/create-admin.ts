import { createFileRoute } from '@tanstack/react-router';
import { createInstallAdmin, InstallServiceError } from '@backend/services/install';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/install/create-admin')({ server: { handlers: {
  POST: async ({ request }) => {
    try {
      return apiOk(await createInstallAdmin(await request.json().catch(() => ({}))));
    } catch (error) {
      if (error instanceof InstallServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
