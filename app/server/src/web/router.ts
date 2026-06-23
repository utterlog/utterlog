import { createElement, type ReactElement } from 'react';
import { NotFoundError, RedirectError } from 'next/navigation';
import { invokePage, htmlResponse, isAssetPath, searchParamsRecord } from './page-runner';
import { renderBlogPage } from './render';
import { renderStandalonePage } from './render-standalone';
import { installGate, proxyFeed } from './install-gate';
import { matchRoute, BlogNotFound } from '../../../blog/src/route-match';
import { resolvePageMeta } from '../../../blog/src/page-meta';
import { loadRoutePageData } from '../../../web/lib/route-page-data';
import InstallPage from '../../../web/app/install/page';
import LoginPage from '../../../web/app/login/page';

async function renderBlog(
  pathname: string,
  Page: (props: any) => any,
  params: Record<string, string | string[]> = {},
  searchParams: Record<string, string> = {},
) {
  const meta = await resolvePageMeta(Page, params, searchParams);
  const element = await invokePage(Page, params, searchParams);
  const pageData = await loadRoutePageData(Page, params);
  return renderBlogPage(element as ReactElement, meta, { pathname, params, searchParams, pageData });
}

async function renderThemedNotFound(pathname: string, searchParams: Record<string, string>) {
  const element = await invokePage(BlogNotFound, {}, searchParams);
  return renderBlogPage(element as ReactElement, { title: '404' }, { pathname, params: {}, searchParams });
}

async function matchBlogPage(pathname: string, searchParams: Record<string, string>) {
  const matched = matchRoute(pathname);
  if (!matched) return null;
  return renderBlog(pathname, matched.Page, matched.params, searchParams);
}

export async function handleBlogRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (isAssetPath(pathname)) return null;

  const feed = await proxyFeed(request);
  if (feed) return feed;

  const gate = await installGate(request);
  if (gate) return gate;

  const searchParams = searchParamsRecord(url);

  try {
    if (pathname === '/install' || pathname.startsWith('/install/')) {
      const html = renderStandalonePage(createElement(InstallPage), 'Utterlog 安装', 'install');
      return htmlResponse(html, 200, method);
    }

    if (pathname === '/login' || pathname.startsWith('/login/')) {
      const html = renderStandalonePage(createElement(LoginPage), '登录', 'login');
      return htmlResponse(html, 200, method);
    }

    const html = await matchBlogPage(pathname, searchParams);
    if (!html) return null;
    return htmlResponse(html, 200, method);
  } catch (err) {
    if (
      err instanceof NotFoundError
      || (err instanceof Error && err.name === 'NotFoundError')
    ) {
      const html = await renderThemedNotFound(pathname, searchParams);
      return htmlResponse(html, 404, method);
    }
    if (
      err instanceof RedirectError
      || (err instanceof Error && err.name === 'RedirectError')
    ) {
      const redirectErr = err as RedirectError;
      return new Response(null, { status: redirectErr.status ?? 302, headers: { location: redirectErr.url } });
    }
    console.error('Bun blog render error:', err);
    return htmlResponse('<!doctype html><html><body><h1>500</h1></body></html>', 500, method);
  }
}
