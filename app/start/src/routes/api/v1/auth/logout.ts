import { createFileRoute } from '@tanstack/react-router';
import { authenticatedUser } from '@backend/services/auth';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/logout')({
  server: {
    handlers: {
      POST: ({ request }) => withAuthService(async () => {
        await authenticatedUser(request);
        return apiOk(null);
      }),
    },
  },
});
