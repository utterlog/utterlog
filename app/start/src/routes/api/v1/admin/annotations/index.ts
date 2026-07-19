import { createFileRoute } from '@tanstack/react-router';
import { listAdminAnnotations } from '@backend/services/annotations';
import { apiOk, apiPaginated, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/annotations/')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async () => {
    const query = new URL(request.url).searchParams;
    const result = await listAdminAnnotations({ page: Number(query.get('page') || 1),
      perPage: Number(query.get('per_page') || 20), postId: Number(query.get('post_id') || 0) });
    return apiPaginated(result.rows, result.meta);
  }),
} } });
