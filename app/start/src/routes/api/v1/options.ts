import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@backend/auth/session';
import { readResolvedOptionMap, writeOptionMap } from '@backend/services/options';
import { apiOk, withAdmin } from '../../../server/http';

export const Route = createFileRoute('/api/v1/options')({
  server: { handlers: {
    GET: async ({ request }) => {
      const session = await authenticateRequest(request).catch(() => null);
      return apiOk(await readResolvedOptionMap(session?.role === 'admin'));
    },
    PUT: ({ request }) => withAdmin(request, async () => {
      await writeOptionMap(await request.json().catch(() => ({})));
      return apiOk();
    }),
    POST: ({ request }) => withAdmin(request, async () => {
      await writeOptionMap(await request.json().catch(() => ({})));
      return apiOk();
    }),
  } },
});
