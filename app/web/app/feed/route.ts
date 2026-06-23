import { NextResponse } from 'next/server';
import { serverApiBase } from '@/lib/server-api';

// /feed proxy to the Bun app's RSS output.
//
// We previously tried a next.config.js rewrite to the old split API container
// to skip the Node hop entirely, but that setup returned opaque 500s in
// production — likely a Next.js 16 quirk with external-URL rewrites
// wrapping a middleware-protected route. A direct route handler is
// more plumbing, but it's also more debuggable: when the upstream fails
// the response body tells you which host was contacted and why.
//
// Dynamic so Next doesn't try to prerender at build time (the API isn't
// running then).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const upstream = `${serverApiBase()}/feed`;
  try {
    const res = await fetch(upstream, {
      headers: { 'Accept': 'application/xml' },
      cache: 'no-store',
    });
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[feed] upstream ${res.status} from ${upstream}`);
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Feed upstream error ${res.status}</title><link>${upstream}</link></channel></rss>`,
        { status: 502, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
      );
    }
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/xml; charset=utf-8',
        'Cache-Control': res.headers.get('cache-control') || 'public, max-age=3600',
      },
    });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.warn(`[feed] fetch failed (${upstream}):`, msg);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Feed fetch failed</title><description>${msg.replace(/[<&>]/g, '')}</description></channel></rss>`,
      { status: 500, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
    );
  }
}
