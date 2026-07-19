import { createFileRoute } from '@tanstack/react-router';
import { publicFeedResponse } from '@backend/routes/content';

export const Route = createFileRoute('/api/v1/feed')({ server: { handlers: {
  GET: ({ request }) => publicFeedResponse(request),
} } });
