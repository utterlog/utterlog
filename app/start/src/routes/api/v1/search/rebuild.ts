import { createFileRoute } from '@tanstack/react-router';
import { rebuildEmbeddings } from '@backend/routes/ai';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/search/rebuild')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async ({ userId }) => {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    try {
      return apiOk(await rebuildEmbeddings(Number(body.limit || 0), userId));
    } catch (error) {
      return apiFail(400, 'EMBEDDING_REBUILD_FAILED', error instanceof Error ? error.message : '重建搜索索引失败');
    }
  }),
} } });
