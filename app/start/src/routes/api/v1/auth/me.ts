import { createFileRoute } from '@tanstack/react-router';
import { authenticatedUser } from '@backend/services/auth';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/me')({
  server: {
    handlers: {
      GET: ({ request }) => withAuthService(async () => apiOk(await authenticatedUser(request))),
    },
  },
});
