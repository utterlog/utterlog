import { createFileRoute } from '@tanstack/react-router';
import { systemStatusPayload } from '@backend/services/dashboard';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/system/status')({ server: { handlers: {
  GET: async () => apiOk(await systemStatusPayload()),
} } });
