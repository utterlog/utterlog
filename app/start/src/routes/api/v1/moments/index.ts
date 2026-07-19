import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { listMoments } from '@backend/public-read';
import { createMoment, MomentServiceError } from '@backend/services/moments';
import { apiFail, apiOk, apiPaginated, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/moments/')({
  server: { handlers: {
    GET: async ({ request }) => {
      const query = new URL(request.url).searchParams;
      const session = await authenticateRequest(request).catch(() => null);
      const page = Math.max(1, Number(query.get('page') || 1) || 1);
      const perPage = Math.min(500, Math.max(1, Number(query.get('per_page') || 20) || 20));
      const result = await listMoments({ page, perPage, authed: Boolean(session), visibility: query.get('visibility') || '' });
      return apiPaginated(result.data.moments, result.meta);
    },
    POST: ({ request }) => withAdmin(request, async (session) => {
      try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        return apiOk({ id: await createMoment(body, session.userId) });
      } catch (err) {
        if (err instanceof MomentServiceError) return apiFail(err.status, 'VALIDATION_ERROR', err.message);
        throw err;
      }
    }),
  } },
});
