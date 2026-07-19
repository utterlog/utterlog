import { createFileRoute } from '@tanstack/react-router';
import { ExtensionServiceError, setPluginState } from '@backend/routes/extensions';
import { apiFail, apiOk, withAdmin } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/plugins/$id/$action')({ server: { handlers: {
  POST: ({ request, params }) => withAdmin(request, async () => {
    try {
      if (!['activate', 'deactivate'].includes(params.action)) return apiFail(404, 'NOT_FOUND', '插件接口不存在');
      return apiOk(await setPluginState(params.id, params.action === 'activate'));
    } catch (error) {
      if (error instanceof ExtensionServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }),
} } });
