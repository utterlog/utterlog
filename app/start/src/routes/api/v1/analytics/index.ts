import { createFileRoute } from '@tanstack/react-router';
import { analyticsOverview, analyticsPeriod } from '@backend/services/analytics';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/analytics/')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => apiOk(await analyticsOverview(analyticsPeriod(new URL(request.url).searchParams.get('period'))))),
} } });
