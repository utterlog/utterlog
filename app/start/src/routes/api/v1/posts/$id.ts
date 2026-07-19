import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { getPostById } from '@backend/public-read';
import { deletePost, PostServiceError, updatePost } from '@backend/services/posts';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof PostServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/posts/$id')({ server: { handlers: {
  GET: async ({ request, params }) => {
    const session = await authenticateRequest(request).catch(() => null);
    const post = await getPostById(Number(params.id), new URL(request.url).searchParams.get('track') === '1', Boolean(session));
    return post ? apiOk(post) : apiFail(404, 'NOT_FOUND', '文章 not found');
  },
  PUT: ({ request, params }) => withAdmin(request, async () => {
    try {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      return apiOk({ id: await updatePost(Number(params.id), body) });
    } catch (error) {
      return serviceError(error);
    }
  }),
  DELETE: ({ request, params }) => withAdmin(request, async () => {
    try {
      await deletePost(Number(params.id));
      return apiOk(null);
    } catch (error) {
      return serviceError(error);
    }
  }),
} } });
