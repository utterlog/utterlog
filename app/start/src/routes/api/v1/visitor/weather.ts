import { createFileRoute } from '@tanstack/react-router';
import { getVisitorWeather } from '@backend/public-read';
import { requestIp } from '@backend/request-ip';
import { apiOk } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/visitor/weather')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = apiOk(await getVisitorWeather(requestIp(request)));
        response.headers.set('Cache-Control', 'private, max-age=600');
        return response;
      },
    },
  },
});
