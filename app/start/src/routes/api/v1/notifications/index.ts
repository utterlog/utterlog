import { createFileRoute } from '@tanstack/react-router';
import { listNotifications } from '@backend/services/notifications';
import { apiPaginated, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/notifications/')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async (session) => {
    const query = new URL(request.url).searchParams;
    const result = await listNotifications(session.userId, { page: Number(query.get('page') || 1), perPage: Number(query.get('per_page') || 20) });
    return apiPaginated(result.rows, result.meta);
  }),
} } });
