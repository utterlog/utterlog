import { createFileRoute } from '@tanstack/react-router';
import { systemUpdateCheckPayload } from '@backend/routes/compat';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/system/update-check')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => apiOk(await systemUpdateCheckPayload())),
} } });
