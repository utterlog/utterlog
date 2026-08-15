import { createFileRoute } from '@tanstack/react-router';
import { PublicPage } from '../components/PublicPage';
import { loadPublicPage, publicPageHead } from '../lib/public-route';

/**
 * 首页 + 分页。
 *
 * 页码走 search 参数（`/?page=2`）而不是路径（`/page/2`），是为了让翻页
 * 留在**同一条路由**里。
 *
 * 起因是「翻页像整页刷新」：给 .blog-main 打记号翻一页，记号连同元素本身
 * 一起从文档里消失了 —— `/` 和 `/page/2` 是两条路由，切过去布局整个重挂，
 * hero、侧栏、滚动位置全部重来。而 `/page/2` → `/page/3` 因为是同一条路由
 * 就好好的：只有右侧列表换，别的原地不动。
 *
 * 换成 search 之后每一跳都是后一种情形：loader 重跑、HomePage 收到新的
 * posts，React 就地更新右侧列表，其余部分连重渲染都不需要。
 *
 * `/page/$num` 那条路由保留着，重定向到这里，旧链接和搜索引擎的收录不断。
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
