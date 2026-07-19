import { createFileRoute } from '@tanstack/react-router';
import { resetPassword } from '@backend/services/auth';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/reset-password')({
  server: {
    handlers: {
      POST: ({ request }) => withAuthService(async () => {
        const body = await request.json().catch(() => ({}));
        return apiOk(await resetPassword(body));
      }),
    },
  },
});
