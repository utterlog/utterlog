import { createFileRoute } from '@tanstack/react-router';
import { listPluginsPayload } from '@backend/routes/extensions';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/plugins/')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => apiOk(await listPluginsPayload())),
} } });
