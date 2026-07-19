import { createFileRoute } from '@tanstack/react-router';
import { analyticsBreakdown, analyticsGeoIp, analyticsLogs, analyticsMap, analyticsPeriod, AnalyticsServiceError, analyticsVisitors, onlineVisitors, requestIp } from '@backend/services/analytics';
import { apiFail, apiOk, apiPaginated, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/analytics/$action')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    try {
      const query = new URL(request.url).searchParams;
      if (params.action === 'online') {
        const online = await onlineVisitors();
        return apiOk({ online, count: online.length });
      }
      if (params.action === 'visitors') {
        const result = await analyticsVisitors({ page: Number(query.get('page') || 1), perPage: Number(query.get('per_page') || 20) });
        return apiPaginated(result.rows, result.meta);
      }
      if (params.action === 'logs') {
        const result = await analyticsLogs({ page: Number(query.get('page') || 1), perPage: Number(query.get('per_page') || 20) });
        return apiPaginated(result.rows, result.meta);
      }
      if (params.action === 'geoip') return apiOk(await analyticsGeoIp(query.get('ip') || requestIp(request), query.get('provider') || ''));
      if (params.action === 'map') return apiOk(await analyticsMap(analyticsPeriod(query.get('period'))));
      if (params.action === 'breakdown') return apiOk(await analyticsBreakdown(analyticsPeriod(query.get('period')), query.get('dimension') || 'all'));
      return apiFail(404, 'NOT_FOUND', '统计接口不存在');
    } catch (error) {
      if (error instanceof AnalyticsServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
