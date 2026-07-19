import { createFileRoute } from '@tanstack/react-router';
import { loginWithPassword } from '@backend/services/auth';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/login')({
  server: {
    handlers: {
      POST: ({ request }) => withAuthService(async () => {
        const body = await request.json().catch(() => ({}));
        return apiOk(await loginWithPassword(body));
      }),
    },
  },
});
