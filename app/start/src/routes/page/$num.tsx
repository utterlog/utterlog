import { createFileRoute, redirect } from '@tanstack/react-router';
import { publicRouteNumber } from '../../lib/public-route';

/**
 * 旧的分页路径，现在只做重定向。
 *
 * 分页已改用 search 参数（理由见 routes/index.tsx）。这条留着是为了让
 * 已经发出去的 /page/2 链接和搜索引擎收录的地址继续可用，统一送回
 * `/?page=2`，站内不会有两个 URL 渲染同一页内容。
 */
export const Route = createFileRoute('/page/$num')({
  // 301 而不是默认的 307：这是永久搬家，让搜索引擎把已收录的 /page/N
  // 换成新地址、权重跟着过去，别一直当临时跳转两头都留着。
  loader: ({ params }) => {
    const page = publicRouteNumber(params.num, 1);
    if (page === 1) throw redirect({ to: '/', statusCode: 301 });
    throw redirect({ to: '/', search: { page }, statusCode: 301 });
  },
});
