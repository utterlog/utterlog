// Spinner — admin 后台所有 loading 的唯一入口。
//
// 历史:之前后台有 3 种 loading 视觉 ——
//   1. fa-solid fa-spinner fa-spin   (8 圆点环) ← 主流
//   2. fa-light fa-spinner-third     (1/3 圆弧)  ← 仅 PostCreate
//   3. 纯文字"加载中…"                          ← AiSettings / DashboardHome
// 切页面 / 切 tab 时三种交替出现,视觉抖动。v2.3.1 起强制全部走这
// 一个组件,样式 / 颜色 / 字号 / 文案统一。
//
// 三种用法:
//
//   <Spinner inline />     → 仅图标,行内(按钮 / 输入框右上 / icon-only)
//   <Spinner />            → 块级居中,容器内填充(Tab 切换、表单首屏)
//   <Spinner overlay />    → fixed 全屏遮罩(路由切换 / 鉴权检查 / 阻塞操作)
//
// 通用 props:
//   text   覆盖默认 "加载中…"
//   size   inline/block 的图标字号(默认 14)
import { useI18n } from '@/lib/i18n';

interface SpinnerProps {
  /** 仅图标。给按钮、输入框等行内场景用。 */
  inline?: boolean;
  /** 全屏遮罩(position: fixed,viewport 中央)。
   *  路由切换、鉴权未就绪、强制阻塞操作时用。
   *  RouteLoading 在 App.tsx 已经走这个。 */
  overlay?: boolean;
  /** 自定义文字。默认走 i18n common.loading。 */
  text?: string;
  /** 图标字号(px)。默认 14。inline 不带文字时建议 12-13。 */
  size?: number;
}

export default function Spinner({ inline, overlay, text, size = 14 }: SpinnerProps) {
  if (inline) {
    return (
      <i
        className="fa-solid fa-spinner fa-spin"
        style={{ fontSize: size }}
        aria-hidden="true"
      />
    );
  }

  // 直接用 i18n 拿默认文案。inline 不会走到这里。
  // overlay / block 共享同一组居中 + 图标 + 文字结构。
  const { t } = useI18n();
  const label = text ?? t('common.loading', '加载中…');

  const content = (
    <>
      <i
        className="fa-solid fa-spinner fa-spin"
        style={{ fontSize: size, color: 'var(--color-primary)', marginRight: 8 }}
        aria-hidden="true"
      />
      <span style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>{label}</span>
    </>
  );

  if (overlay) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 9999,
        }}
      >
        {content}
      </div>
    );
  }

  // Block 默认:容器内居中。padding 给一点高度,免得在很短的容器里
  // 看起来贴边。
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 200,
        padding: '24px 16px',
      }}
    >
      {content}
    </div>
  );
}
