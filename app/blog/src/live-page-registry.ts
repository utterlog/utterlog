import type { ComponentType } from 'react';
import RouteLive from './route-live';
import MomentsClient from '@/app/(blog)/moments/MomentsClient';
import LinksClient from '@/app/(blog)/links/LinksClient';
import FeedsClient from '@/app/(blog)/feeds/FeedsClient';
import AlbumsClient from '@/app/(blog)/albums/AlbumsClient';
import MusicClient from '@/app/(blog)/music/MusicClient';
import type { RoutePageData } from '@/lib/route-page-data';

/** 整页客户端组件 —— 自行拉数或强交互，必须重挂后 useEffect / 事件才生效。 */
const LIVE_PAGES: Record<string, ComponentType<{ boot?: unknown }>> = {
  '/moments': MomentsClient,
  '/links': LinksClient,
  '/feeds': FeedsClient,
  '/albums': AlbumsClient,
  '/music': MusicClient,
};

const ROUTE_LIVE_KINDS = new Set<RoutePageData['kind']>(['home', 'post', 'footprints']);

export function resolveLivePage(pathname: string, pageData?: RoutePageData): ComponentType<{ boot?: unknown }> | null {
  if (pageData && ROUTE_LIVE_KINDS.has(pageData.kind)) {
    return RouteLive;
  }
  const path = pathname.replace(/\/+$/, '') || '/';
  return LIVE_PAGES[path] ?? null;
}
