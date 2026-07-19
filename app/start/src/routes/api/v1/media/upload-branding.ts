import { createFileRoute } from '@tanstack/react-router';
import { BrandingUploadError, storeBrandingUpload } from '@backend/services/branding';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/media/upload-branding')({
  server: {
    handlers: {
      POST: ({ request }) => withAdmin(request, async () => {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return apiFail(400, 'BAD_REQUEST', 'file 不能为空');
        try {
          return apiOk(await storeBrandingUpload(file, form.get('purpose')));
        } catch (err) {
          return apiFail(400, 'BAD_REQUEST', err instanceof BrandingUploadError ? err.message : '品牌图片上传失败');
        }
      }),
    },
  },
});
