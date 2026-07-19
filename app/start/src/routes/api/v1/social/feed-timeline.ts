import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { socialFeedTimeline } from '@backend/routes/compat';
import { apiPaginated } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/social/feed-timeline')({ server: { handlers: {
  GET: async ({ request }) => {
    const session = await authenticateRequest(request).catch(() => null);
    const result = await socialFeedTimeline(session?.userId || 1, new URL(request.url).searchParams);
    return apiPaginated(result.rows, result.meta);
  },
} } });
