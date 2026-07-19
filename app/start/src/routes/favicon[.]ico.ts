import { createFileRoute } from '@tanstack/react-router';
import { join } from 'node:path';
import { config } from '@backend/config';
import { runtimePaths } from '@backend/paths';
import { fileResponse } from '@backend/static/response';

async function faviconResponse(request: Request) {
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  const response = await fileResponse(join(config.uploadDir, 'branding', 'favicon.ico'), acceptEncoding)
    || await fileResponse(join(runtimePaths.webAppDir, 'public', 'favicon.ico'), acceptEncoding);
  if (!response) return new Response('Not Found', { status: 404 });
  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}

export const Route = createFileRoute('/favicon.ico')({ server: { handlers: {
  GET: ({ request }) => faviconResponse(request),
  HEAD: ({ request }) => faviconResponse(request),
} } });
