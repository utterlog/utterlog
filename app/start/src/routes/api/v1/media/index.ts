import { createFileRoute } from '@tanstack/react-router';
import { listMediaRecords } from '@backend/services/media';
import { apiPaginated, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/')({
  server: { handlers: { GET: ({ request }) => withAdmin(request, async () => {
    const query = new URL(request.url).searchParams;
    const result = await listMediaRecords({
      page: Number(query.get('page') || 1),
      perPage: Number(query.get('per_page') || 20),
      category: query.get('category') || '',
      excludeCategory: query.get('exclude_category') || '',
    });
    return apiPaginated(result.rows, result.meta);
  }) } },
});
