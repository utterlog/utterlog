import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { deleteMoment, getMoment, MomentServiceError, updateMoment } from '@backend/services/moments';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(err: unknown) {
  if (err instanceof MomentServiceError) {
    return apiFail(err.status, err.status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message);
  }
  throw err;
}

export const Route = createFileRoute('/api/v1/moments/$id')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const session = await authenticateRequest(request).catch(() => null);
      const moment = await getMoment(Number(params.id), Boolean(session));
      return moment ? apiOk(moment) : apiFail(404, 'NOT_FOUND', '说说不存在');
    },
    PUT: ({ request, params }) => withAdmin(request, async () => {
      try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        return apiOk({ id: await updateMoment(Number(params.id), body) });
      } catch (err) {
        return serviceError(err);
      }
    }),
    DELETE: ({ request, params }) => withAdmin(request, async () => {
      try {
        await deleteMoment(Number(params.id));
        return apiOk(null);
      } catch (err) {
        return serviceError(err);
      }
    }),
  } },
});
