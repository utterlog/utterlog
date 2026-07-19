import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import {
  aiGetActionPayload,
  aiPostActionPayload,
  type AiActionResult,
  AiServiceError,
  readerAiChatPayload,
} from '@backend/routes/ai';
import { apiFail, apiOk, apiPaginated, withAdmin } from '../../../../server/http';

const getActions = new Set(['conversations', 'logs', 'stats', 'batch-status']);
const postActions = new Set([
  'test',
  'generate-image',
  'cover',
  'chat',
  'slug',
  'summary',
  'tags',
  'format',
  'query',
  'batch-questions',
  'batch-summary',
  'batch-all',
  'batch-delete',
  'batch-stop',
]);

function actionResponse(result: AiActionResult) {
  if (result.response) return result.response;
  if (result.pagination) return apiPaginated(result.data, result.pagination);
  return apiOk(result.data);
}

function serviceError(error: unknown) {
  if (error instanceof AiServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/ai/$action')({ server: { handlers: {
  GET: ({ request, params }) => {
    if (!getActions.has(params.action)) return apiFail(404, 'NOT_FOUND', 'AI 接口不存在');
    return withAdmin(request, async ({ userId }) => {
      try {
        return actionResponse(await aiGetActionPayload(params.action, userId, new URL(request.url).searchParams));
      } catch (error) {
        return serviceError(error);
      }
    });
  },
  POST: async ({ request, params }) => {
    if (params.action === 'reader-chat') {
      try {
        const session = await authenticateRequest(request).catch(() => null);
        const body = await request.json().catch(() => ({}));
        return actionResponse(await readerAiChatPayload(body, session?.userId || 0));
      } catch (error) {
        return serviceError(error);
      }
    }
    if (!postActions.has(params.action)) return apiFail(404, 'NOT_FOUND', 'AI 接口不存在');
    return withAdmin(request, async ({ userId }) => {
      try {
        const body = await request.json().catch(() => ({}));
        return actionResponse(await aiPostActionPayload(params.action, body, userId, new URL(request.url).searchParams));
      } catch (error) {
        return serviceError(error);
      }
    });
  },
} } });
