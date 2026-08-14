import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import RoutePending from './components/RoutePending';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // 切页面时让浏览器原生做交叉淡化：截住旧画面，新画面就绪后淡进去，
    // 动画跑在合成器上不占主线程。不支持的浏览器（目前是 Firefox）
    // 自动退回瞬间切换，不用写兼容分支。
    //
    // 它只平滑「旧页面 → 组件加载占位」这一跳；占位换成真实内容那一跳
    // 不再触发 view transition（同一次导航内的后续渲染），那段由
    // PublicPage 里的 .route-enter 淡入接手。两者互补，不会双重淡入。
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
