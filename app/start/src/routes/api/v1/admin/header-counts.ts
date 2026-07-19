import { createFileRoute } from '@tanstack/react-router';
import { adminCommentPendingCounts } from '@backend/services/comments';
import { unreadNotificationCount } from '@backend/services/notifications';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/admin/header-counts')({ server: { handlers: {
  GET: ({ request }) => withAdmin(request, async (session) => {
    const [unread, comments] = await Promise.all([
      unreadNotificationCount(session.userId),
      adminCommentPendingCounts(),
    ]);
    return apiOk({ unread, pending_comments: comments.pending });
  }),
} } });
