import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import {
  followSocialSite,
  SocialServiceError,
  socialFollowing,
  socialFollowStatus,
  socialManagement,
  unfollowSocialSite,
} from '@backend/routes/compat';
import { apiFail, apiOk, withAdmin } from '../../../../server/http';

function serviceError(error: unknown) {
  if (error instanceof SocialServiceError) return apiFail(error.status, error.code, error.message);
  throw error;
}

export const Route = createFileRoute('/api/v1/social/$action')({ server: { handlers: {
  GET: async ({ request, params }) => {
    if (params.action === 'follow-status') {
      try {
        const session = await authenticateRequest(request).catch(() => null);
        return apiOk(await socialFollowStatus(session?.userId || 1, new URL(request.url).searchParams.get('site_url')));
      } catch (error) { return serviceError(error); }
    }
    return withAdmin(request, async ({ userId }) => {
      if (params.action === 'following') return apiOk(await socialFollowing(userId));
      if (params.action === 'management') return apiOk(await socialManagement(userId));
      return apiFail(404, 'NOT_FOUND', '社交接口不存在');
    });
  },
  POST: ({ request, params }) => withAdmin(request, async ({ userId }) => {
    try {
      const body = await request.json().catch(() => ({}));
      if (params.action === 'follow') return apiOk(await followSocialSite(userId, body));
      if (params.action === 'unfollow') return apiOk(await unfollowSocialSite(userId, body));
      return apiFail(404, 'NOT_FOUND', '社交接口不存在');
    } catch (error) { return serviceError(error); }
  }),
} } });
