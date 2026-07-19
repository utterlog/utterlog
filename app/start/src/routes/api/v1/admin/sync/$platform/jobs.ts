import { createFileRoute } from '@tanstack/react-router';
import { ImportSyncServiceError, listSyncJobsPayload } from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/sync/$platform/jobs')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    try {
      return apiOk(await listSyncJobsPayload(params.platform, new URL(request.url).searchParams));
    } catch (error) {
      if (error instanceof ImportSyncServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
