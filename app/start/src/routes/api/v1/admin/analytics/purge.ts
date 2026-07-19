import { createFileRoute } from '@tanstack/react-router';
import { purgeAnalytics } from '@backend/routes/compat';
import { apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/analytics/purge')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => apiOk(await purgeAnalytics(new URL(request.url).searchParams))),
} } });
