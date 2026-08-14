import { notFound } from '@tanstack/react-router';
import { publicPageMeta } from './public-meta';
import { preloadPageChunk } from '../components/PublicPage';
import {
  loadStartPublicPage,
  type PublicPageData,
  type PublicPageRequest,
} from '../server/public-pages';

/**
 * 公开页的统一取数入口。
 *
 * `preload` 来自路由 loader 的同名参数（TanStack Router 在预取时置为 true）。
 * 一路透传到服务端，只为了让预取不计入全站浏览量 —— 鼠标划过链接不等于看了
 * 一篇文章。数据本身不受影响，预取拿到的和真实导航拿到的是同一份。
 */
export async function loadPublicPage(request: PublicPageRequest, preload = false) {
  // 取数的同时把这个页面的组件 chunk 也拉下来，两件事并行。
  //
  // 不这么做的话：数据先到、组件还在下载，框架（header/footer）已经渲染
  // 而内容区空着 —— 就是「切页面先出框架再出内容」的由来。router 的
  // defaultPreload: 'intent' 只预取数据，管不到组件代码。
  //
  // 放在 await 之前，不是之后：等 data 回来才知道 kind 就太晚了，而
  // request 里本来就带着 kind。配合 'intent' 预取，鼠标划过链接时
  // 数据和组件会一起开始下载，点下去基本是即时的。
  if ('kind' in request && typeof request.kind === 'string') {
    preloadPageChunk(request.kind);
  }
  const data = await loadStartPublicPage({ data: { ...request, preload } });
  if (data.kind === 'not-found') throw notFound();
  return data;
}

export function publicRouteNumber(value: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw notFound();
  return parsed;
}

export function publicPageHead(data: PublicPageData | undefined) {
  if (!data || data.kind === 'not-found') return {};
  const meta = publicPageMeta(data);
  return {
    meta: [
      { title: meta.title },
      ...(meta.description ? [{ name: 'description', content: meta.description }] : []),
    ],
  };
}
