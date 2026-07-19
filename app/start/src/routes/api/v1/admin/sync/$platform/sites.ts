import { createFileRoute } from '@tanstack/react-router';
import {
  createSyncSitePayload,
  ImportSyncServiceError,
  listSyncSitesPayload,
} from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof ImportSyncServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/admin/sync/$platform/sites')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    try {
      return apiOk(await listSyncSitesPayload(params.platform));
    } catch (error) {
      return serviceError(error);
    }
  }),
  POST: ({ request, params }) => withAdmin(request, async () => {
    try {
      const body = await request.json().catch(() => ({}));
      return apiOk(await createSyncSitePayload(params.platform, body));
    } catch (error) {
      return serviceError(error);
    }
  }),
} } });
