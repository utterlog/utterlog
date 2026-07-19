import { createFileRoute } from '@tanstack/react-router';
import { requestIp, visitorGeo } from '@backend/services/analytics';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/visitor/geo')({ server: { handlers: {
  GET: async ({ request }) => apiOk(await visitorGeo(requestIp(request))),
} } });
