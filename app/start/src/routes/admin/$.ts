import { createFileRoute } from '@tanstack/react-router';
import { join } from 'node:path';
import { config } from '@backend/config';
import { fileResponse, safeJoin } from '@backend/static/response';

export function isAdminAssetPath(splat: string) {
  return Boolean(splat && /\.[a-z0-9]+(?:\.(?:br|gz))?$/i.test(splat));
}

async function adminResponse(request: Request, splat: string) {
  if (isAdminAssetPath(splat)) {
    const asset = await fileResponse(
      safeJoin(config.adminDistDir, splat),
      request.headers.get('accept-encoding') || '',
    );
    if (asset) {
      const headers = new Headers(asset.headers);
      const hashed = /\/assets\/[^/]+-[A-Za-z0-9_-]+\.(js|css)$/.test(`/${splat}`);
      headers.set('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
      if (request.method === 'HEAD') return new Response(null, { status: asset.status, headers });
      return new Response(asset.body, { status: asset.status, headers });
    }

    return new Response(request.method === 'HEAD' ? null : 'Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  const file = Bun.file(join(config.adminDistDir, 'index.html'));
  if (!(await file.exists())) return new Response('Admin build not found', { status: 503 });
  if (request.method === 'HEAD') {
    return new Response(null, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
        'x-utterlog-renderer': 'tanstack-start-admin',
        pragma: 'no-cache',
        expires: '0',
      },
    });
  }
  return new Response(file, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'x-utterlog-renderer': 'tanstack-start-admin',
      pragma: 'no-cache',
      expires: '0',
    },
  });
}

export const Route = createFileRoute('/admin/$')({
  server: { handlers: {
    GET: ({ request, params }) => adminResponse(request, String(params._splat || '')),
    HEAD: ({ request, params }) => adminResponse(request, String(params._splat || '')),
  } },
});
