import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { listPosts } from '@backend/public-read';
import { createPost, PostServiceError } from '@backend/services/posts';
import { apiFail, apiOk, apiPaginated, withAdmin } from '../../../server/http';

function positive(value: string | null, fallback: number) {
  const number = Number(value || fallback);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export const Route = createFileRoute('/api/v1/posts')({
  server: { handlers: { GET: async ({ request }) => {
    const query = new URL(request.url).searchParams;
    const session = await authenticateRequest(request).catch(() => null);
    const result = await listPosts({
      page: positive(query.get('page'), 1), perPage: positive(query.get('per_page') || query.get('limit'), 20),
      status: session ? query.get('status') || '' : 'publish', authed: Boolean(session),
      type: query.get('type') || 'post', search: query.get('search') || '', category: query.get('category') || '',
      categoryId: positive(query.get('category_id'), 0), tag: query.get('tag') || '', tagId: positive(query.get('tag_id'), 0),
      videoType: query.get('video_type') || '', region: query.get('region') || '', year: query.get('year') || '',
      genre: query.get('genre') || '', orderBy: query.get('order_by') || '', order: query.get('order') || '',
    });
    return apiPaginated(result.data, result.meta);
  }, POST: ({ request }) => withAdmin(request, async (session) => {
    try {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      return apiOk({ id: await createPost(body, session.userId) });
    } catch (error) {
      if (error instanceof PostServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  }) } },
});
