/**
 * 路由切换时的加载指示。
 *
 * 之前 router 没有配 pendingComponent，TanStack Router 在 loader 未完成时
 * 渲染的是空 —— 从首页点进文章会先白屏一下，数据到了才「啪」地出现。
 *
 * 做成顶部进度条而不是整页 spinner：整页转圈会把已经渲染好的 header / 页面
 * 框架也盖掉，视觉上反而像是重新加载了一次；顶部细条只占 2px，读者看得到
 * 「在加载」但版面不跳动。
 *
 * 配合 router 的 defaultPendingMs（见 router.tsx）：快得看不见的导航不会
 * 闪一下进度条。
 */
export default function RoutePending() {
  return (
    <div className="route-pending" role="status" aria-label="加载中">
      <div className="route-pending-bar" />
    </div>
  );
}
