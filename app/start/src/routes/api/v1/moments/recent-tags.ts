import { createFileRoute } from '@tanstack/react-router';
import { recentMomentTags } from '@backend/public-read';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/moments/recent-tags')({ server: { handlers: { GET: async ({ request }) => {
  const limit = Number(new URL(request.url).searchParams.get('limit') || 8) || 8;
  return apiOk(await recentMomentTags(limit));
} } } });
