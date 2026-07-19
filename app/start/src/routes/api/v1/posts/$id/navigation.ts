import { createFileRoute } from '@tanstack/react-router';
import { getPostNavigation } from '@backend/public-read';
import { apiOk } from '../../../../../server/http';

export const Route = createFileRoute('/api/v1/posts/$id/navigation')({ server: { handlers: { GET: async ({ params }) => apiOk(await getPostNavigation(Number(params.id))) } } });
