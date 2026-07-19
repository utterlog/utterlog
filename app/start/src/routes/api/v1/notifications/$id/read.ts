import { createFileRoute } from '@tanstack/react-router';
import { markNotificationRead, NotificationServiceError } from '@backend/services/notifications';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/notifications/$id/read')({ server: { handlers: {
  POST: ({ request, params }) => withAdmin(request, async (session) => {
    try {
      await markNotificationRead(session.userId, params.id);
      return apiOk(null);
    } catch (error) {
      if (error instanceof NotificationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
