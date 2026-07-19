import { createFileRoute } from '@tanstack/react-router';
import {
  cleanupSystemDatabase,
  clearRssCache,
  clearSystemCache,
  rebuildSystemStats,
  releaseListPayload,
  requestSystemUpgrade,
  SystemServiceError,
  versionPayload,
} from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/system/$action')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    const force = new URL(request.url).searchParams.get('refresh') === '1';
    if (params.action === 'version') return apiOk(await versionPayload(force));
    if (params.action === 'releases') return apiOk(await releaseListPayload(force));
    return apiFail(404, 'NOT_FOUND', '系统接口不存在');
  }),
  POST: ({ request, params }) => withAdmin(request, async () => {
    try {
      if (params.action === 'upgrade') return apiOk(await requestSystemUpgrade());
      if (params.action === 'rebuild-stats') return apiOk(await rebuildSystemStats());
      if (params.action === 'clear-cache') return apiOk(await clearSystemCache());
      if (params.action === 'clear-rss-cache') return apiOk(await clearRssCache());
      if (params.action === 'cleanup-database') return apiOk(await cleanupSystemDatabase());
      return apiFail(404, 'NOT_FOUND', '系统接口不存在');
    } catch (error) {
      if (error instanceof SystemServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
