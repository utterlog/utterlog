import { createFileRoute, redirect } from '@tanstack/react-router';
import { publicRouteNumber } from '../../lib/public-route';
import { HOME_PAGE_MAX } from '../../lib/home-pagination';

/**
 * /page/N 的兜底路由。
 *
 * 正常的 /page/2..999999 在 router 的 rewrite 里就被翻成 '/' + ?page=N 了，
 * 根本走不到这里（见 lib/home-pagination.ts）。留在这里过的只有：
 *   /page/1                          → 301 回 `/`，一页内容只留一个地址
 *   /page/007                        → 301 到 /page/7，规范化
 *   /page/0、/page/abc、/page/12345678 → publicRouteNumber 抛 notFound，真 404
 */
export const Route = createFileRoute('/page/$num')({
  loader: ({ params }) => {
    const page = publicRouteNumber(params.num, 1, HOME_PAGE_MAX);
    if (page === 1) throw redirect({ to: '/', statusCode: 301 });
    throw redirect({ to: '/', search: { page }, statusCode: 301 });
  },
});
