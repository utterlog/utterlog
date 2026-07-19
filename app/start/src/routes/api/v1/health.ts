import { createFileRoute } from '@tanstack/react-router';
import { appVersion } from '@backend/system/metrics';
import { apiOk } from '../../../server/http';

export const Route = createFileRoute('/api/v1/health')({ server: { handlers: {
  GET: async () => apiOk({ status: 'ok', version: appVersion() }),
} } });
