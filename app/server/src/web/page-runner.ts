export { invokePage } from '../../../blog/src/page-runner';

export function searchParamsRecord(url: URL) {
  const out: Record<string, string> = {};
  url.searchParams.forEach((value, key) => { out[key] = value; });
  return out;
}

export function htmlResponse(html: string, status = 200, method = 'GET') {
  return new Response(method === 'HEAD' ? null : html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-cache, no-store, must-revalidate',
      pragma: 'no-cache',
      expires: '0',
    },
  });
}

export function isAssetPath(pathname: string) {
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/api')) return true;
  if (pathname.startsWith('/admin')) return true;
  if (pathname.startsWith('/uploads')) return true;
  if (pathname.startsWith('/static')) return true;
  if (pathname.startsWith('/styles/')) return true;
  if (pathname === '/feed' || pathname === '/rss' || pathname === '/rss.xml' || pathname === '/atom.xml') return false;
  return /\.[a-z0-9]+$/i.test(pathname);
}
