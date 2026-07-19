import { createFileRoute } from '@tanstack/react-router';
import {
  ImportSyncServiceError,
  importTypechoPayload,
  importWordPressPayload,
} from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof ImportSyncServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/import/$platform')({ server: { handlers: {
  POST: ({ request, params }) => withAdmin(request, async ({ userId }) => {
    try {
      if (params.platform === 'wordpress') return apiOk(await importWordPressPayload(request, userId));
      if (params.platform === 'typecho') {
        const body = await request.json().catch(() => ({}));
        return apiOk(await importTypechoPayload(body, userId));
      }
      return apiFail(404, 'NOT_FOUND', '导入平台不存在');
    } catch (error) {
      return serviceError(error);
    }
  }),
} } });
