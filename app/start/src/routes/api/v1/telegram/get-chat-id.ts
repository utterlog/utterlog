import { createFileRoute } from '@tanstack/react-router';
import { discoverTelegramChats, TelegramServiceError } from '@backend/routes/telegram';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/telegram/get-chat-id')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try { return apiOk(await discoverTelegramChats(await request.json().catch(() => ({})))); }
    catch (error) {
      if (error instanceof TelegramServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
