import { createFileRoute } from '@tanstack/react-router';
import { trackPageView } from '@backend/services/tracking';
import { apiOk } from '../../../server/http';

export const Route = createFileRoute('/api/v1/track')({ server: { handlers: {
  POST: async ({ request }) => apiOk(await trackPageView(request, await request.json().catch(() => ({})))),
} } });
