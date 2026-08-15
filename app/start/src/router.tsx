import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import RoutePending from './components/RoutePending';
import { homePagePathRewrite } from './lib/home-pagination';

export function getRouter() {
  return createRouter({
    routeTree,
    // 首页分页：地址栏是 /page/2，router 内部仍是 '/' + ?page=2。
    // 详见 lib/home-pagination.ts —— 这是「翻页不重挂布局」的全部机关。
    rewrite: homePagePathRewrite,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // 切页面时让浏览器原生做交叉淡化，动画跑在合成器上不占主线程。
    // 不支持的浏览器（目前是 Firefox）自动退回瞬间切换，不用写兼容分支。
    //
    // 曾在 2026-08-14 因为 /links 无限闪烁回滚过一次，当时以为是它的锅。
    // 真凶是 formatLastPost 用了本地时区，SSR 与浏览器算出不同日期造成
    // hydration 失败（React #418）—— view transition 只是把这个静默
    // mismatch 放大成了看得见的死循环。根因修掉后重新启用。
    //
    // 前提是页面不能有 hydration mismatch。以后再出现「切页面反复闪烁」，
    // 先查控制台有没有 #418，别急着怪这一行。
    defaultViewTransition: true,
    // 客户端导航时 loader 还没回来，默认渲染的是空 —— 点进文章会先白屏一下。
    // 给一个顶部进度条兜住。
    //
    // 注：实测这个 pendingComponent 在本项目的 SSR 路由上从未被触发过，
    // 真正在工作的是 __root.tsx 里订阅 onBeforeLoad/onRendered 的 NavProgress。
    // 这里保留是为了兜住将来可能新增的、走标准 loader pending 流程的路由。
    defaultPendingComponent: RoutePending,
    // 200ms 内完成的导航不显示（大多数带 preload 的点击属于这类），
    // 免得快得看不清的闪烁反而显得卡。
    defaultPendingMs: 200,
    // 一旦显示了，至少留 300ms —— 否则 200ms 门槛边缘的导航会「闪一下就没」，
    // 那种一帧的跳动比不显示更难受。
    defaultPendingMinMs: 300,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
