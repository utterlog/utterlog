import { createFileRoute } from '@tanstack/react-router';
import { listComments } from '@backend/public-read';
import { authenticateRequest } from '@backend/auth/session';
import { createPublicComment } from '@backend/services/public-comments';
import { requestIp } from '@backend/request-ip';
import { apiOk, apiPaginated, withPublicWrite } from '../../../../server/http';

function positive(value: string | null, fallback: number) {
  const number = Number(value || fallback);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export const Route = createFileRoute('/api/v1/comments/')({
  server: { handlers: {
    GET: async ({ request }) => {
      const query = new URL(request.url).searchParams;
      const session = await authenticateRequest(request).catch(() => null);
      const authenticated = Boolean(session);
      const result = await listComments({
        page: positive(query.get('page'), 1), perPage: positive(query.get('per_page'), 20),
        status: authenticated ? query.get('status') || 'approved' : 'approved',
        postId: positive(query.get('post_id'), 0), topLevel: query.get('top_level') === 'true',
        excludeAdmin: ['1', 'true'].includes(query.get('exclude_admin') || ''), order: query.get('order') || 'desc',
        userId: authenticated ? positive(query.get('user_id'), 0) : 0,
        search: authenticated ? query.get('search') || '' : '',
      });
      return apiPaginated(result.data, result.meta);
    },
    POST: ({ request }) => withPublicWrite(async () => {
      const body = await request.json().catch(() => ({}));
      const session = await authenticateRequest(request).catch(() => null);
      return apiOk(await createPublicComment(body, {
        ip: requestIp(request),
        userAgent: request.headers.get('user-agent') || '',
        passportToken: request.headers.get('x-utterlog-passport') || '',
        userId: session?.userId || 0,
      }));
    }),
  } },
});
