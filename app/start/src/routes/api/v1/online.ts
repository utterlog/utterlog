import { createFileRoute } from '@tanstack/react-router';
import { publicOnlineVisitors } from '@backend/services/tracking';
import { apiOk } from '../../../server/http';

export const Route = createFileRoute('/api/v1/online')({ server: { handlers: {
  GET: async () => apiOk(await publicOnlineVisitors()),
} } });
