import { createFileRoute } from '@tanstack/react-router';
import { ExtensionServiceError, uploadExtensionFile } from '@backend/routes/extensions';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/plugins/upload')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return apiFail(400, 'BAD_REQUEST', '请上传 zip 文件');
      return apiOk(await uploadExtensionFile(file, 'plugin'));
    } catch (error) {
      if (error instanceof ExtensionServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
