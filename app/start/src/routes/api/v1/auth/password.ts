import { createFileRoute } from '@tanstack/react-router';
import { changePassword } from '@backend/services/auth';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/password')({
  server: {
    handlers: {
      PUT: ({ request }) => withAuthService(async () => {
        const body = await request.json().catch(() => ({}));
        return apiOk(await changePassword(request, body));
      }),
    },
  },
});
