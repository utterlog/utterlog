import { createFileRoute } from '@tanstack/react-router';
import { config } from '@backend/config';
import { fileResponse, safeJoin } from '@backend/static/response';

async function uploadResponse(request: Request, splat: string) {
  if (!splat) return new Response('Not Found', { status: 404 });
  const response = await fileResponse(
    safeJoin(config.uploadDir, splat),
    request.headers.get('accept-encoding') || '',
  );
  if (!response) return new Response('Not Found', { status: 404 });
  const headers = new Headers(response.headers);
  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers })
    : new Response(response.body, { status: response.status, headers });
}

export const Route = createFileRoute('/uploads/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => uploadResponse(request, String(params._splat || '')),
      HEAD: ({ request, params }) => uploadResponse(request, String(params._splat || '')),
    },
  },
});
