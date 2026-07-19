import { createFileRoute } from '@tanstack/react-router';
import { getOwnerPublic } from '@backend/public-read';
import { apiOk } from '../../../server/http';

export const Route = createFileRoute('/api/v1/owner')({ server: { handlers: { GET: async () => apiOk(await getOwnerPublic()) } } });
