import { createFileRoute } from '@tanstack/react-router';
import { processTelegramWebhookRequest, TelegramServiceError } from '@backend/routes/telegram';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/telegram/webhook')({ server: { handlers: {
  POST: async ({ request }) => {
    try { return apiOk(await processTelegramWebhookRequest(request)); }
    catch (error) {
      if (error instanceof TelegramServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
