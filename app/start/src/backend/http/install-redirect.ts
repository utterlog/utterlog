import { installStatus } from '../services/install';

const passthroughPrefixes = [
  '/api/',
  '/admin/',
  '/uploads/',
  '/themes/',
  '/assets/',
  '/static/',
  '/styles/',
  '/emoji/',
  '/icons/',
  '/images/',
];

const passthroughPaths = new Set([
  '/api',
  '/admin',
  '/feed',
  '/rss',
  '/rss.xml',
  '/atom.xml',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/llms-full.txt',
]);

export function skipsInstallRedirect(pathname: string) {
  return passthroughPaths.has(pathname)
    || passthroughPrefixes.some((prefix) => pathname.startsWith(prefix))
    || /\.(?:ico|png|jpg|jpeg|svg|webp|avif|gif|css|js|woff2?|ttf|map|xml)$/i.test(pathname);
}

export async function installRedirect(request: Request, databaseReady: boolean) {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;

  const url = new URL(request.url);
  const isInstallPage = url.pathname === '/install' || url.pathname.startsWith('/install/');
  if (!isInstallPage && skipsInstallRedirect(url.pathname)) return null;

  const status = await installStatus(databaseReady).catch(() => null);
  const installed = status?.installed === true;
  if (isInstallPage) {
    return installed ? Response.redirect(new URL('/', url), 302) : null;
  }
  return installed ? null : Response.redirect(new URL('/install', url), 302);
}
