import { createFileRoute } from '@tanstack/react-router';
import { disableTotp, enableTotp, setupTotp, validateTotpLogin } from '@backend/services/auth-security';
import { apiFail, apiOk, withAuthService } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/totp/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) => withAuthService(async () => {
        const body = await request.json().catch(() => ({}));
        if (params.action === 'setup') return apiOk(await setupTotp(request));
        if (params.action === 'verify') return apiOk(await enableTotp(request, body));
        if (params.action === 'disable') return apiOk(await disableTotp(request, body));
        if (params.action === 'validate') return apiOk(await validateTotpLogin(body));
        return apiFail(404, 'NOT_FOUND', 'api route not found');
      }),
    },
  },
});
