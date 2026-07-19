import { createFileRoute } from '@tanstack/react-router';
import { publicFeedResponse } from '@backend/routes/content';

export const Route = createFileRoute('/feed')({
  server: { handlers: {
    GET: ({ request }) => publicFeedResponse(request),
    HEAD: ({ request }) => publicFeedResponse(request),
  } },
});
