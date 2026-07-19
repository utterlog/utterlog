import { createFileRoute } from '@tanstack/react-router';
import { markAllNotificationsRead } from '@backend/services/notifications';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/notifications/read-all')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async (session) => {
    await markAllNotificationsRead(session.userId);
    return apiOk(null);
  }),
} } });
