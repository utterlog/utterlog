import { createFileRoute } from '@tanstack/react-router';
import { adminCommentPendingCounts } from '@backend/services/comments';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/comments/pending-count')({
  server: { handlers: { GET: ({ request }) => withAdmin(request, async () => apiOk(await adminCommentPendingCounts())) } },
});
