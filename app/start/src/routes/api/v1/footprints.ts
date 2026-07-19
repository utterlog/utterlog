import { createFileRoute } from '@tanstack/react-router';
import { listPublicFootprints } from '@backend/public-read';
import { apiOk } from '../../../server/http';

export const Route = createFileRoute('/api/v1/footprints')({ server: { handlers: { GET: async ({ request }) => {
  const query = new URL(request.url).searchParams;
  return apiOk(await listPublicFootprints({ city: query.get('city') || '', country: query.get('country') || '',
    route: query.get('route') || '', keyword: query.get('keyword') || query.get('search') || '' }));
} } } });
