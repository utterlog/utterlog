import { createFileRoute } from '@tanstack/react-router';
import { deleteMetaRecord, getMetaRecord, saveMetaRecord } from '@backend/services/metas';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/categories/$id')({
  server: { handlers: {
    GET: async ({ params }) => {
      const row = await getMetaRecord('category', Number(params.id));
      return row ? apiOk(row) : apiFail(404, 'NOT_FOUND', '分类 not found');
    },
    PUT: ({ request, params }) => withAdmin(request, async () => {
      const id = Number(params.id);
      if (!Number.isInteger(id) || id <= 0) return apiFail(400, 'BAD_REQUEST', '分类 ID 无效');
      return apiOk({ id: await saveMetaRecord('category', await request.json().catch(() => ({})), id) });
    }),
    DELETE: ({ request, params }) => withAdmin(request, async () => {
      const deleted = await deleteMetaRecord('category', Number(params.id));
      return deleted ? apiOk() : apiFail(404, 'NOT_FOUND', '分类 not found');
    }),
  } },
});
