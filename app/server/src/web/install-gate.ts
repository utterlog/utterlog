import { config } from '../config';

export async function installGate(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (
    pathname.startsWith('/_next')
    || pathname.startsWith('/api/')
    || pathname.startsWith('/admin')
    || pathname.startsWith('/uploads/')
    || pathname === '/feed'
    || pathname.match(/\.(?:ico|png|jpg|jpeg|svg|webp|avif|gif|css|js|woff2?|ttf|map|xml)$/)
  ) {
    return null;
  }

  const isInstallPage = pathname === '/install' || pathname.startsWith('/install/');
  const apiBase = process.env.INTERNAL_API_URL || `http://127.0.0.1:${config.port}/api/v1`;

  let installed = false;
  let apiReachable = false;
  try {
    const r = await fetch(`${apiBase}/install/status`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    apiReachable = r.ok;
    if (r.ok) {
      const j = await r.json() as { data?: { installed?: boolean } };
      installed = j?.data?.installed === true;
    }
  } catch {
    apiReachable = false;
  }

  if (isInstallPage) {
    if (apiReachable && installed) {
      return Response.redirect(new URL('/', url).toString(), 302);
    }
    return null;
  }

  if (!installed) {
    return Response.redirect(new URL('/install', url).toString(), 302);
  }

  return null;
}

export async function proxyFeed(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/feed', '/rss', '/rss.xml', '/atom.xml'].includes(url.pathname)) return null;
  const apiBase = process.env.INTERNAL_API_URL || `http://127.0.0.1:${config.port}/api/v1`;
  try {
    const res = await fetch(`${apiBase}/feed`, {
      headers: { accept: 'application/xml' },
      cache: 'no-store',
    });
    const body = await res.text();
    const headers: Record<string, string> = {
      'content-type': res.headers.get('content-type') || 'application/xml; charset=utf-8',
      'cache-control': res.headers.get('cache-control') || 'public, max-age=300, must-revalidate',
    };
    const etag = res.headers.get('etag');
    if (etag) headers.etag = etag;
    return new Response(body, {
      status: res.ok ? 200 : 502,
      headers,
    });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Feed error</title><description>${msg}</description></channel></rss>`,
      { status: 500, headers: { 'content-type': 'application/xml; charset=utf-8' } },
    );
  }
}
