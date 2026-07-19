import { createFileRoute } from '@tanstack/react-router';
import { backupDownloadResponse, BackupServiceError } from '@backend/routes/backup';
import { apiFail, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/backup/download/$filename')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    try {
      return backupDownloadResponse(params.filename);
    } catch (error) {
      if (error instanceof BackupServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
