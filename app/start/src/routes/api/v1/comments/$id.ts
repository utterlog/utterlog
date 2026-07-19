import { createFileRoute } from '@tanstack/react-router';
import { approveAdminComment, deleteAdminComment, updateAdminComment } from '@backend/services/comments';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function commentId(value: string) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export const Route = createFileRoute('/api/v1/comments/$id')({
  server: {
    handlers: {
      PUT: ({ request, params }) => withAdmin(request, async () => {
        const id = commentId(params.id);
        if (!id) return apiFail(400, 'BAD_REQUEST', '无效的评论 ID');
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        try {
          const result = await updateAdminComment(id, body);
          return result ? apiOk(result) : apiFail(404, 'NOT_FOUND', '评论不存在');
        } catch (err) {
          return apiFail(400, 'BAD_REQUEST', err instanceof Error ? err.message : '评论更新失败');
        }
      }),
      PATCH: ({ request, params }) => withAdmin(request, async () => {
        const id = commentId(params.id);
        if (!id) return apiFail(400, 'BAD_REQUEST', '无效的评论 ID');
        const result = await approveAdminComment(id);
        return result ? apiOk(result) : apiFail(404, 'NOT_FOUND', '评论不存在');
      }),
      DELETE: ({ request, params }) => withAdmin(request, async () => {
        const id = commentId(params.id);
        if (!id) return apiFail(400, 'BAD_REQUEST', '无效的评论 ID');
        return apiOk(await deleteAdminComment(id));
      }),
    },
  },
});
