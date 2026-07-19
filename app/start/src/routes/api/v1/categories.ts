import { createFileRoute } from '@tanstack/react-router';
import { listMetaRecords, saveMetaRecord } from '@backend/services/metas';
import { apiOk, apiPaginated, withAdmin } from '../../../server/http';

export const Route = createFileRoute('/api/v1/categories')({
  server: { handlers: {
    GET: async ({ request }) => {
      const query = new URL(request.url).searchParams;
      const paginated = ['page', 'per_page', 'limit', 'search', 'q'].some((key) => query.has(key));
      const result = await listMetaRecords('category', {
        includeEmpty: true,
        page: Number(query.get('page') || 1),
        perPage: Number(query.get('per_page') || query.get('limit') || (paginated ? 20 : 500)),
        search: query.get('search') || query.get('q') || '',
      });
      return paginated ? apiPaginated(result.rows, result.meta) : apiOk(result.rows);
    },
    POST: ({ request }) => withAdmin(request, async () => {
      const id = await saveMetaRecord('category', await request.json().catch(() => ({})));
      return apiOk({ id });
    }),
  } },
});
