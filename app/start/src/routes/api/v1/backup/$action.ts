import { createFileRoute } from '@tanstack/react-router';
import { backupListPayload, BackupServiceError, backupStatsPayload, createBackupPayload, deleteBackupFile, importBackupFile } from '@backend/routes/backup';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof BackupServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/backup/$action')({ server: { handlers: {
  GET: ({ request, params }) => withAdmin(request, async () => {
    if (params.action === 'stats') return apiOk(await backupStatsPayload());
    if (params.action === 'list') return apiOk(await backupListPayload());
    return apiFail(404, 'NOT_FOUND', '备份接口不存在');
  }),
  POST: ({ request, params }) => withAdmin(request, async () => {
    try {
      if (params.action === 'create') return apiOk(await createBackupPayload());
      if (params.action === 'import') {
        const form = await request.formData().catch(() => null);
        const file = form?.get('file');
        if (!(file instanceof File)) return apiFail(400, 'BAD_REQUEST', '请上传备份文件');
        return apiOk(await importBackupFile(file));
      }
      return apiFail(404, 'NOT_FOUND', '备份接口不存在');
    } catch (error) { return serviceError(error); }
  }),
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try {
      await deleteBackupFile(params.action);
      return apiOk(null);
    } catch (error) { return serviceError(error); }
  }),
} } });
