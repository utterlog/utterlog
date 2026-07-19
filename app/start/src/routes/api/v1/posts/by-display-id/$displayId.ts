import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { getPostByDisplayId } from '@backend/public-read';
import { apiFail, apiOk } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/posts/by-display-id/$displayId')({ server: { handlers: { GET: async ({ request, params }) => {
  const session = await authenticateRequest(request).catch(() => null);
  const post = await getPostByDisplayId(Number(params.displayId), new URL(request.url).searchParams.get('track') === '1', Boolean(session));
  return post ? apiOk(post) : apiFail(404, 'NOT_FOUND', '文章 not found');
} } } });
