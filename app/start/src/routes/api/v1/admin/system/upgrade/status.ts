import { createFileRoute } from '@tanstack/react-router';
import { systemUpgradeStatusPayload } from '@backend/routes/compat';
import { apiOk, withAdmin } from '../../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/system/upgrade/status')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => apiOk(await systemUpgradeStatusPayload())),
} } });
