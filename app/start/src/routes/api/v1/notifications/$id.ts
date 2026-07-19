import { createFileRoute } from '@tanstack/react-router';
import { deleteNotification, NotificationServiceError } from '@backend/services/notifications';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/notifications/$id')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async (session) => {
    try {
      await deleteNotification(session.userId, params.id);
      return apiOk(null);
    } catch (error) {
      if (error instanceof NotificationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
