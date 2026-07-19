import { createFileRoute } from '@tanstack/react-router';
import { localeFiles } from '@backend/services/i18n';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/i18n/locales')({ server: { handlers: {
  GET: async () => apiOk({ locales: localeFiles() }),
} } });
