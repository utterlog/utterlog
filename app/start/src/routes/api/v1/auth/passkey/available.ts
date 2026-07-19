import { createFileRoute } from '@tanstack/react-router';
import { passkeyAvailability } from '@backend/services/auth-security';
import { apiOk, withAuthService } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/passkey/available')({
  server: {
    handlers: {
      GET: () => withAuthService(async () => apiOk(await passkeyAvailability())),
    },
  },
});
