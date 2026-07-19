import { createFileRoute } from '@tanstack/react-router';
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  finishPasskeyLogin,
  finishPasskeyRegistration,
} from '@backend/services/auth-security';
import { apiFail, apiOk, withAuthService } from '../../../../../../server/http';

export const Route = createFileRoute('/api/v1/auth/passkey/$flow/$action')({
  server: {
    handlers: {
      POST: ({ request, params }) => withAuthService(async () => {
        const body = await request.json().catch(() => ({}));
        if (params.flow === 'register' && params.action === 'begin') return apiOk(await beginPasskeyRegistration(request));
        if (params.flow === 'register' && params.action === 'finish') return apiOk(await finishPasskeyRegistration(request, body));
        if (params.flow === 'login' && params.action === 'begin') return apiOk(await beginPasskeyLogin());
        if (params.flow === 'login' && params.action === 'finish') return apiOk(await finishPasskeyLogin(request, body));
        return apiFail(404, 'NOT_FOUND', 'api route not found');
      }),
    },
  },
});
