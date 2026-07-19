import { createFileRoute } from '@tanstack/react-router';
import { TelegramServiceError, testTelegramConnection } from '@backend/routes/telegram';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/telegram/test')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try { return apiOk(await testTelegramConnection(await request.json().catch(() => ({})))); }
    catch (error) {
      if (error instanceof TelegramServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
