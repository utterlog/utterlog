import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import RoutePending from './components/RoutePending';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // ⚠ 2026-08-14 关闭：开着会和 hydration 打架 —— 线上 /links 出现
    // 「Transition was aborted because of invalid state」+ React #418
    // （hydration 失败）反复循环，页面无限闪烁。原因待查，先回滚止血。
    // defaultViewTransition: true,
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
