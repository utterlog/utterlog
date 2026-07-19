import { createFileRoute } from '@tanstack/react-router';
import { listPasskeys } from '@backend/services/auth-security';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/passkeys/')({
  server: {
    handlers: {
      GET: ({ request }) => withAuthService(async () => apiOk(await listPasskeys(request))),
    },
  },
});
