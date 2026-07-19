import { createFileRoute } from '@tanstack/react-router';
import {
  ImportSyncServiceError,
  syncBatchPayload,
  syncFinishPayload,
  syncPingPayload,
  syncRollbackPayload,
  syncStartPayload,
} from '@backend/routes/compat';
import { apiFail, apiOk } from '../../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof ImportSyncServiceError) return apiFail(error.status, error.code, error.message);
  console.error('TanStack Start sync error:', error);
  return apiFail(500, 'INTERNAL_ERROR', '服务器内部错误');
}

export const Route = createFileRoute('/api/v1/sync/$platform/$action')({ server: { handlers: {
  POST: async ({ request, params }) => {
    try {
      const body = await request.json().catch(() => ({}));
      if (params.action === 'ping') return apiOk(await syncPingPayload(params.platform, body));
      if (params.action === 'start') return apiOk(await syncStartPayload(params.platform, body));
      if (params.action === 'batch') return apiOk(await syncBatchPayload(params.platform, body));
      if (params.action === 'finish') return apiOk(await syncFinishPayload(params.platform, body));
      if (params.action === 'rollback') return apiOk(await syncRollbackPayload(params.platform, body));
      return apiFail(404, 'NOT_FOUND', '同步接口不存在');
    } catch (error) {
      return serviceError(error);
    }
  },
} } });
