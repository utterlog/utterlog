import { createFileRoute } from '@tanstack/react-router';
import { deletePasskey } from '@backend/services/auth-security';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/passkeys/$id')({
  server: {
    handlers: {
      DELETE: ({ request, params }) => withAuthService(async () => apiOk(await deletePasskey(request, params.id))),
    },
  },
});
