import { createFileRoute } from '@tanstack/react-router';
import { installStatus } from '@backend/services/install';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/install/status')({ server: { handlers: {
  GET: async () => apiOk(await installStatus()),
} } });
