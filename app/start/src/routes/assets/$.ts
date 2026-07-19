import { createFileRoute } from '@tanstack/react-router';
import { runtimePaths } from '@backend/paths';
import { fileResponse, safeJoin } from '@backend/static/response';

async function assetResponse(request: Request, splat: string) {
  if (!splat) return new Response('Not Found', { status: 404 });
  const response = await fileResponse(
    safeJoin(runtimePaths.startClientAssetsDir, splat),
    request.headers.get('accept-encoding') || '',
  );
  if (!response) return new Response('Not Found', { status: 404 });
  const headers = new Headers(response.headers);
  if (/-[A-Za-z0-9_-]+\.(js|css)$/.test(splat)) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers })
    : new Response(response.body, { status: response.status, headers });
}

export const Route = createFileRoute('/assets/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => assetResponse(request, String(params._splat || '')),
      HEAD: ({ request, params }) => assetResponse(request, String(params._splat || '')),
    },
  },
});
