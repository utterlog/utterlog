import { createFileRoute } from '@tanstack/react-router';
import { searchPosts } from '@backend/services/search';
import { apiOk } from '../../../server/http';

export const Route = createFileRoute('/api/v1/search')({ server: { handlers: {
  GET: async ({ request }) => {
    const query = new URL(request.url).searchParams;
    return apiOk(await searchPosts(query.get('q') || '', Number(query.get('limit') || 10)));
  },
} } });
