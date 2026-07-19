import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { socialFeedStats } from '@backend/routes/compat';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/social/feed-stats')({ server: { handlers: {
  GET: async ({ request }) => {
    const session = await authenticateRequest(request).catch(() => null);
    return apiOk(await socialFeedStats(session?.userId || 1));
  },
} } });
