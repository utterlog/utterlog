import { createFileRoute } from '@tanstack/react-router';
import { InstallServiceError, saveSetupConfig } from '@backend/services/install';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/setup/save')({ server: { handlers: {
  POST: async () => {
    try {
      return apiOk(await saveSetupConfig());
    } catch (error) {
      if (error instanceof InstallServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
