import { createFileRoute } from '@tanstack/react-router';
import { PublicPage } from '../components/PublicPage';
import { loadPublicPage, publicPageHead } from '../lib/public-route';

/**
 * 首页 + 分页。
 *
 * 页码在 router **内部**走 search 参数（`'/' + ?page=2`），是为了让翻页留在
 * 同一条路由里。起因是「翻页像整页刷新」：给 .blog-main 打记号翻一页，记号
 * 连同元素本身一起从文档里消失了 —— `/` 和 `/page/2` 是两条路由，切过去
 * 布局整个重挂，hero、侧栏、滚动位置全部重来。留在一条路由里就只是 loader
 * 重跑、HomePage 收到新的 posts，React 就地更新右侧列表。
 *
 * 而地址栏和 `<a href>` 里出现的是 `/page/2`：router 装了一对 rewrite 做
 * 双向翻译（见 lib/home-pagination.ts）。所以这里读到的 search.page，就是
 * 用户地址栏 `/page/N` 里的那个 N。
 */
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = Number(search.page);
    // 只认 ≥2 的整数；1 和垃圾值一律当首页，URL 上不留 ?page=1
    return Number.isInteger(raw) && raw >= 2 ? { page: raw } : {};
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps, preload }) => loadPublicPage({ kind: 'home', page: deps.page }, preload),
  head: ({ loaderData }) => publicPageHead(loaderData),
  component: StartHome,
});

function StartHome() {
  const data = Route.useLoaderData();
  return <PublicPage data={data} />;
}
