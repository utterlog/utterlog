import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import RoutePending from './components/RoutePending';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // 客户端导航时 loader 还没回来，默认渲染的是空 —— 点进文章会先白屏一下。
    // 给一个顶部进度条兜住。
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
