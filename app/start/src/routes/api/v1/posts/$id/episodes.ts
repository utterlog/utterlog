import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { listPostEpisodes } from '@backend/public-read';
import { apiFail, apiOk } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/posts/$id/episodes')({ server: { handlers: { GET: async ({ request, params }) => {
  const session = await authenticateRequest(request).catch(() => null);
  const result = await listPostEpisodes(Number(params.id), Boolean(session));
  return result ? apiOk(result) : apiFail(404, 'NOT_FOUND', '文章 not found');
} } } });
