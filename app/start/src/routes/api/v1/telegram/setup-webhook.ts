import { createFileRoute } from '@tanstack/react-router';
import { setupTelegramWebhook, TelegramServiceError } from '@backend/routes/telegram';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/telegram/setup-webhook')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try { return apiOk(await setupTelegramWebhook()); }
    catch (error) {
      if (error instanceof TelegramServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
