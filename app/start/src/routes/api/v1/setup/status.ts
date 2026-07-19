import { createFileRoute } from '@tanstack/react-router';
import { setupStatus } from '@backend/services/install';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/setup/status')({ server: { handlers: {
  GET: async () => apiOk(await setupStatus()),
} } });
