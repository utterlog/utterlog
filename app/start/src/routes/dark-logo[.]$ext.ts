import { createFileRoute } from '@tanstack/react-router';
import { join } from 'node:path';
import { config } from '@backend/config';
import { runtimePaths } from '@backend/paths';
import { brandingExts } from '@backend/media/storage';
import { fileResponse } from '@backend/static/response';

async function brandingResponse(request: Request, ext: string) {
  const normalized = ext.toLowerCase();
  if (!brandingExts.has(normalized)) return new Response('Not Found', { status: 404 });
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  const response = await fileResponse(join(config.uploadDir, 'branding', `dark-logo.${normalized}`), acceptEncoding)
    || await fileResponse(join(runtimePaths.serverPublicDir, `dark-logo.${normalized}`), acceptEncoding);
  if (!response) return new Response('Not Found', { status: 404 });
  const headers = new Headers(response.headers);
  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers })
    : new Response(response.body, { status: response.status, headers });
}

export const Route = createFileRoute('/dark-logo.$ext')({ server: { handlers: {
  GET: ({ request, params }) => brandingResponse(request, params.ext),
  HEAD: ({ request, params }) => brandingResponse(request, params.ext),
} } });
