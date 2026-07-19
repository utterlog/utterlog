import { createFileRoute } from '@tanstack/react-router';
import { sendProfileVerificationCode } from '@backend/services/auth';
import { apiOk, withAuthService } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/profile/send-code')({
  server: {
    handlers: {
      POST: ({ request }) => withAuthService(async () => apiOk(await sendProfileVerificationCode(request))),
    },
  },
});
