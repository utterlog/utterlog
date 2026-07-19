import { createFileRoute } from '@tanstack/react-router';
import { adminStatsPayload } from '@backend/services/dashboard';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/stats')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => apiOk(await adminStatsPayload())),
} } });
