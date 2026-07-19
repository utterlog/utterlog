import { createFileRoute } from '@tanstack/react-router';
import { finishInstallation, InstallServiceError } from '@backend/services/install';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/install/finish')({ server: { handlers: {
  POST: async ({ request }) => {
    try {
      return apiOk(await finishInstallation(
        await request.json().catch(() => ({})),
        request.headers.get('x-install-token') || '',
      ));
    } catch (error) {
      if (error instanceof InstallServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
