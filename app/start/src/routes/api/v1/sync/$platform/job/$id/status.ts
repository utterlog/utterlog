import { createFileRoute } from '@tanstack/react-router';
import { ImportSyncServiceError, syncJobStatusPayload } from '@backend/routes/compat';
import { apiFail, apiOk } from '../../../../../../../server/http';

export const Route = createFileRoute('/api/v1/sync/$platform/job/$id/status')({ server: { handlers: {
  GET: async ({ params }) => {
    try {
      return apiOk(await syncJobStatusPayload(params.platform, params.id));
    } catch (error) {
      if (error instanceof ImportSyncServiceError) return apiFail(error.status, error.code, error.message);
      console.error('TanStack Start sync status error:', error);
      return apiFail(500, 'INTERNAL_ERROR', '服务器内部错误');
    }
  },
} } });
