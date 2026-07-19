import { createFileRoute } from '@tanstack/react-router';
import { listAdminFootprints } from '@backend/services/footprints';
import { apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/footprints/')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => {
    const query = new URL(request.url).searchParams;
    return apiOk(await listAdminFootprints({ city: query.get('city') || '', country: query.get('country') || '',
      route: query.get('route') || '', keyword: query.get('keyword') || query.get('search') || '' }));
  }),
} } });
