import { createFileRoute } from '@tanstack/react-router';
import { applyForLink } from '@backend/services/public-write';
import { apiOk, withPublicWrite } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/links/apply')({ server: { handlers: { POST: ({ request }) => withPublicWrite(async () => {
  const body = await request.json().catch(() => ({}));
  return apiOk(await applyForLink(body));
}) } } });
