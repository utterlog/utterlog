import { createFileRoute } from '@tanstack/react-router';
import { siteMetadata } from '@backend/routes/compat';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/federation/metadata')({ server: { handlers: {
  GET: async () => apiOk(await siteMetadata()),
} } });
