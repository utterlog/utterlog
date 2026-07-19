import { createFileRoute } from '@tanstack/react-router';
import { startSocialFeedFetch } from '@backend/routes/compat';
import { apiOk, withAdmin } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/social/fetch-feeds')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true || new URL(request.url).searchParams.get('force') === '1';
    return apiOk(startSocialFeedFetch(force));
  }),
} } });
