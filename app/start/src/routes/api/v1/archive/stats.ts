import { createFileRoute } from '@tanstack/react-router';
import { archiveStatsPayload } from '@backend/public-read';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/archive/stats')({ server: { handlers: { GET: async () => apiOk(await archiveStatsPayload()) } } });
