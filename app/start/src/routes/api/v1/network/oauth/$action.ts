import { createFileRoute } from '@tanstack/react-router';
import { NetworkServiceError, networkOauthAuthorization, networkOauthCallback } from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/network/oauth/$action')({ server: { handlers: {
  GET: async ({ request, params }) => {
    if (params.action === 'callback') return networkOauthCallback(new URL(request.url).searchParams);
    if (params.action !== 'authorize') return apiFail(404, 'NOT_FOUND', 'OAuth 接口不存在');
    return withAdmin(request, async ({ userId }) => {
      try { return apiOk(await networkOauthAuthorization(userId)); }
      catch (error) {
        if (error instanceof NetworkServiceError) return apiFail(error.status, error.code, error.message);
        throw error;
      }
    });
  },
} } });
