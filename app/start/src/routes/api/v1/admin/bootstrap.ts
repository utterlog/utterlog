import { createFileRoute } from '@tanstack/react-router';
import { adminDashboardPayload } from '@backend/services/dashboard';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/bootstrap')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => apiOk(await adminDashboardPayload())),
} } });
