import { createFileRoute } from '@tanstack/react-router';
import { readLocale } from '@backend/services/i18n';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/i18n/$locale')({ server: { handlers: {
  GET: async ({ params }) => {
    try {
      const locale = readLocale(params.locale);
      return locale ? apiOk(locale) : apiFail(404, 'NOT_FOUND', 'locale not found');
    } catch {
      return apiFail(404, 'NOT_FOUND', 'locale not found');
    }
  },
} } });
