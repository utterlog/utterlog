import { createFileRoute } from '@tanstack/react-router';
import { editVisitorComment } from '@backend/services/public-write';
import { apiOk, withPublicWrite } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/comments/$id/edit')({ server: { handlers: { PUT: ({ request, params }) => withPublicWrite(async () => {
  const body = await request.json().catch(() => ({}));
  return apiOk(await editVisitorComment(Number(params.id), body));
}) } } });
