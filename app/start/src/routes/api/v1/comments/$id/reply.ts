import { createFileRoute } from '@tanstack/react-router';
import { replyToAdminComment } from '@backend/services/comments';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/comments/$id/reply')({
  server: { handlers: { POST: ({ request, params }) => withAdmin(request, async (session) => {
    const id = Number.parseInt(params.id, 10);
    const body = await request.json().catch(() => ({}));
    try {
      const result = await replyToAdminComment(id, session.userId, body);
      return result ? apiOk(result) : apiFail(404, 'NOT_FOUND', '评论不存在');
    } catch (err) {
      return apiFail(400, 'BAD_REQUEST', err instanceof Error ? err.message : '回复失败');
    }
  }) } },
});
