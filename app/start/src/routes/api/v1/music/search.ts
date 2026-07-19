import { createFileRoute } from '@tanstack/react-router';
import { MusicProxyError, searchMusic } from '@backend/services/music-proxy';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/music/search')({ server: { handlers: {
  GET: async ({ request }) => {
    const query = new URL(request.url).searchParams;
    try {
      return apiOk(await searchMusic({ platform: query.get('platform') || '', server: query.get('server') || '',
        q: query.get('q') || '', page: Number(query.get('page') || 1), limit: Number(query.get('limit') || 20) }));
    } catch (error) {
      if (error instanceof MusicProxyError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
