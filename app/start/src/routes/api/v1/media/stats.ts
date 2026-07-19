import { createFileRoute } from '@tanstack/react-router';
import { mediaStorageStats } from '@backend/services/media';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/stats')({
  server: { handlers: { GET: ({ request }) => withAdmin(request, async () => apiOk(await mediaStorageStats())) } },
});
