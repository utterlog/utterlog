import { createFileRoute } from '@tanstack/react-router';
import { notificationEventStream, NotificationServiceError, notificationStreamUser } from '@backend/services/notifications';
import { apiFail } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/notifications/stream')({ server: { handlers: {
  GET: async ({ request }) => {
    try {
      const token = String(new URL(request.url).searchParams.get('token') || '').trim();
      return notificationEventStream(await notificationStreamUser(token));
    } catch (error) {
      if (error instanceof NotificationServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
