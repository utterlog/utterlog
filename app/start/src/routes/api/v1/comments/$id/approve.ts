import { createFileRoute } from '@tanstack/react-router';
import { approveAdminComment } from '@backend/services/comments';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/comments/$id/approve')({
  server: { handlers: { PATCH: ({ request, params }) => withAdmin(request, async () => {
    const id = Number.parseInt(params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return apiFail(400, 'BAD_REQUEST', '无效的评论 ID');
    const updated = await approveAdminComment(id);
    return updated ? apiOk(updated) : apiFail(404, 'NOT_FOUND', '评论不存在');
  }) } },
});
