import { createFileRoute } from '@tanstack/react-router';
import { trackDuration } from '@backend/services/tracking';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/track/duration')({ server: { handlers: {
  POST: async ({ request }) => apiOk(await trackDuration(request, await request.json().catch(() => ({})))),
} } });
