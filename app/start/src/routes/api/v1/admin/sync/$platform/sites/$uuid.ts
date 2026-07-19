import { createFileRoute } from '@tanstack/react-router';
import { deleteSyncSitePayload, ImportSyncServiceError } from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/sync/$platform/sites/$uuid')({ server: { handlers: {
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try {
      return apiOk(await deleteSyncSitePayload(params.platform, params.uuid));
    } catch (error) {
      if (error instanceof ImportSyncServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
