import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { serverApiBase } from './lib/server-api';

/**
 * Install gate: on every page request, check if Utterlog is installed.
 * If not installed AND request is NOT /install, redirect to /install.
 * If installed AND request IS /install, redirect to /.
 *
 * Status is cached per-request via fetch — in Edge runtime, Next.js dedupes
 * same-URL fetches within the same request.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets, API proxies, /admin (served by Bun), Next internals.
  // Also skip the proxy-only URLs (/feed, /uploads/*) so the install-gate
  // fetch doesn't run on them — those routes exit via next.config.js
  // rewrites to the Bun app, where adding middleware overhead + a
  // potential fetch failure path just creates mysterious 500s.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/uploads/') ||
    pathname === '/feed' ||
    pathname.match(/\.(?:ico|png|jpg|jpeg|svg|webp|avif|gif|css|js|woff2?|ttf|map|xml)$/)
  ) {
    return NextResponse.next();
  }

  const apiUrl = serverApiBase();
  const isInstallPage = pathname === '/install' || pathname.startsWith('/install/');

  // Fail CLOSED: on a fresh deploy, if the API is unreachable we assume NOT
  // installed and send the user to /install. The install page itself handles
  // "API unreachable" in its own UI (retry / troubleshooting hints), which is
  // a much better UX than silently showing a broken blog.
  let installed = false;
  let apiReachable = false;
  try {
    const r = await fetch(apiUrl + '/install/status', {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    apiReachable = r.ok;
    if (r.ok) {
      const j = await r.json();
      installed = j?.data?.installed === true;
    }
  } catch {
    apiReachable = false;
  }

  // If we're already on /install, let it through so the user can see the wizard
  // (which can probe the API on its own and show better errors).
  if (isInstallPage) {
    if (apiReachable && installed) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // Not on /install. If not installed OR API down → send to /install.
  if (!installed) {
    return NextResponse.redirect(new URL('/install', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every page except static/next internals (also filtered in
    // the function body above). /feed is listed explicitly so middleware
    // doesn't wrap the external-rewrite proxy and inject a failure
    // path — keeps the RSS XML response unhindered.
    '/((?!_next|api/|uploads/|feed$|.*\\.(?:ico|png|jpg|jpeg|svg|webp|avif|gif|css|js|woff2?|ttf|map|xml)$).*)',
  ],
};
