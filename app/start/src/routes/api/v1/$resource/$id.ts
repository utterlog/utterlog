import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { asContentResource, ContentRecordError, deleteContentRecord, getContentRecord, updateContentRecord } from '@backend/services/content-records';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof ContentRecordError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/$resource/$id')({ server: { handlers: {
  GET: async ({ request, params }) => {
    try {
      const resource = asContentResource(params.resource);
      const session = await authenticateRequest(request).catch(() => null);
      const record = await getContentRecord(resource, params.id, Boolean(session));
      return record ? apiOk(record) : apiFail(404, 'NOT_FOUND', '内容不存在');
    } catch (error) {
      return serviceError(error);
    }
  },
  PUT: async ({ request, params }) => {
    let resource;
    try {
      resource = asContentResource(params.resource);
    } catch (error) {
      return serviceError(error);
    }
    return withAdmin(request, async () => {
      try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        return apiOk(await updateContentRecord(resource, Number(params.id), body));
      } catch (error) {
        return serviceError(error);
      }
    });
  },
  DELETE: async ({ request, params }) => {
    let resource;
    try {
      resource = asContentResource(params.resource);
    } catch (error) {
      return serviceError(error);
    }
    return withAdmin(request, async () => {
      try {
        return apiOk(await deleteContentRecord(resource, Number(params.id)));
      } catch (error) {
        return serviceError(error);
      }
    });
  },
} } });
