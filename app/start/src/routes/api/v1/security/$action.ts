import { createFileRoute } from '@tanstack/react-router';
import { banIp, getSecuritySettings, listSecurityBans, SecurityServiceError, securityOverview, securityTimeline, unbanIp, updateSecuritySettings } from '@backend/services/security';
import { apiFail, apiOk, apiPaginated, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof SecurityServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/security/$action')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    try {
      if (params.action === 'overview') return apiOk(await securityOverview());
      if (params.action === 'settings') return apiOk(await getSecuritySettings());
      if (params.action === 'bans') return apiOk(await listSecurityBans());
      if (params.action === 'timeline') {
        const query = new URL(request.url).searchParams;
        const paginated = ['page', 'ip', 'per_page', 'limit'].some((key) => query.has(key));
        const result = await securityTimeline({ ip: query.get('ip') || '', page: Number(query.get('page') || 1),
          perPage: Number(query.get('per_page') || query.get('limit') || 50), paginated });
        return result.meta ? apiPaginated(result.rows, result.meta) : apiOk(result.rows);
      }
      return apiFail(404, 'NOT_FOUND', '安全接口不存在');
    } catch (error) { return serviceError(error); }
  }),
  POST: ({ request, params }) => withAdmin(request, async () => {
    try {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      if (params.action === 'settings') return apiOk(await updateSecuritySettings(body));
      if (params.action === 'ban') return apiOk(await banIp(body));
      if (params.action === 'unban') return apiOk(await unbanIp(body));
      return apiFail(404, 'NOT_FOUND', '安全接口不存在');
    } catch (error) { return serviceError(error); }
  }),
} } });
