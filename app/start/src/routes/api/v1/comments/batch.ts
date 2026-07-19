import { createFileRoute } from '@tanstack/react-router';
import { batchAdminComments, type AdminCommentAction } from '@backend/services/comments';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/comments/batch')({
  server: {
    handlers: {
      POST: ({ request }) => withAdmin(request, async () => {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        try {
          const result = await batchAdminComments({
            ids: body.ids,
            action: String(body.action || '') as AdminCommentAction,
            allStatus: body.all === true ? String(body.status || '') : undefined,
          });
          return apiOk(result);
        } catch (err) {
          return apiFail(400, 'BAD_REQUEST', err instanceof Error ? err.message : '批量操作失败');
        }
      }),
    },
  },
});
