import { createFileRoute } from '@tanstack/react-router';
import { getProfile, updateProfile } from '@backend/services/auth';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/profile/')({
  server: {
    handlers: {
      GET: ({ request }) => withAuthService(async () => apiOk(await getProfile(request))),
      PUT: ({ request }) => withAuthService(async () => {
        const body = await request.json().catch(() => ({}));
        return apiOk(await updateProfile(request, body));
      }),
    },
  },
});
