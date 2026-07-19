import { createFileRoute } from '@tanstack/react-router';
import { MediaServiceError, uploadMediaFile } from '@backend/services/media';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/upload')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    try {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return apiFail(400, 'BAD_REQUEST', 'file 不能为空');
      return apiOk(await uploadMediaFile(file, form.get('folder')));
    } catch (error) {
      if (error instanceof MediaServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
