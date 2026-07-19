import { createFileRoute } from '@tanstack/react-router';
import { getPublicAlbum } from '@backend/public-read';
import { apiFail, apiOk } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/public/albums/$id')({ server: { handlers: { GET: async ({ request, params }) => {
  const query = new URL(request.url).searchParams;
  const result = await getPublicAlbum(params.id, Number(query.get('page') || 1) || 1, Number(query.get('per_page') || 20) || 20);
  return result ? apiOk(result) : apiFail(404, 'NOT_FOUND', 'album not found');
} } } });
