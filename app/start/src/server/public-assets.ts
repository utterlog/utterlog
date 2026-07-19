import { join } from 'node:path';
import { runtimePaths } from '@backend/paths';
import { fileResponse, safeJoin } from '@backend/static/response';

const roots = {
  static: join(runtimePaths.webAppDir, 'public', 'static'),
  styles: join(runtimePaths.webAppDir, 'styles'),
  emoji: join(runtimePaths.webAppDir, 'public', 'emoji'),
  icons: join(runtimePaths.webAppDir, 'public', 'icons'),
  images: join(runtimePaths.webAppDir, 'public', 'images'),
} as const;

export async function publicAssetResponse(request: Request, kind: keyof typeof roots, splat: string) {
  if (!splat) return new Response('Not Found', { status: 404 });
  const response = await fileResponse(
    safeJoin(roots[kind], splat),
    request.headers.get('accept-encoding') || '',
  );
  if (!response) return new Response('Not Found', { status: 404 });
  const headers = new Headers(response.headers);
  if (kind === 'styles' || /-[A-Za-z0-9_-]+\.(?:js|css)$/.test(splat)) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers })
    : new Response(response.body, { status: response.status, headers });
}
