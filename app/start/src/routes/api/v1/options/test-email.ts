import { createFileRoute } from '@tanstack/react-router';
import { OptionServiceError, sendTestEmail } from '@backend/services/options';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/options/test-email')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async ({ userId }) => {
    try {
      return apiOk(await sendTestEmail(userId, await request.json().catch(() => ({}))));
    } catch (error) {
      if (error instanceof OptionServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
