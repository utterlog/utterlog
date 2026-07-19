import { createFileRoute } from '@tanstack/react-router';
import { ExternalContentServiceError, parseRssUrl } from '@backend/routes/compat';
import { apiFail, apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/rss/parse')({ server: { handlers: {
  GET: async ({ request }) => {
    try {
      return apiOk(await parseRssUrl(new URL(request.url).searchParams.get('url')));
    } catch (error) {
      if (error instanceof ExternalContentServiceError) return apiFail(error.status, error.code, error.message);
      throw error;
    }
  },
} } });
