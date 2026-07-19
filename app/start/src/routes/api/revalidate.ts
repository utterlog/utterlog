import { createFileRoute } from '@tanstack/react-router';
import { handleRevalidate } from '@backend/cache/revalidate';
import { withAdmin } from '../../server/http';

export const Route = createFileRoute('/api/revalidate')({ server: { handlers: {
  POST: ({ request }) => withAdmin(request, async () => {
    const body = await request.json().catch(() => ({}));
    const result = await handleRevalidate(body);
    return Response.json({ success: true, message: 'Cache cleared', ...result });
  }),
  OPTIONS: () => new Response(null, { status: 204 }),
} } });
