'use client';

import type { CSSProperties } from 'react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * 全站统一的加载指示：一段沿圆周伸缩的弧线 + 整体旋转。
 *
 * **动画走 CSS，不用 SMIL。** 视觉是照着 SVG + `<animate>` 那版做的，
 * 但那种写法在这个项目上出过事：React 19 的 hydration 边界会让
 * Chromium 冻结 SMIL 的首帧，圆圈就那么定在那儿不转 —— 导航按钮、
 * 评论区、随机访问都中过招。CSS 动画不经过 hydration，必然跑起来。
 *
 * 所以这里保留 SVG 的形（r=9.5 / stroke-width 3 / 圆头端点），
 * 把 stroke-dasharray、stroke-dashoffset、rotate 三条动画交给
 * globals.css 的 keyframes（.blog-spinner）。
 *
 * 尺寸靠 viewBox 缩放，stroke-width 固定 3 —— 小尺寸下线条会跟着变细，
 * 正是想要的效果。
 */
export default function LoadingSpinner({
  size = 20,
  color = 'hsl(228, 97%, 42%)',
  className,
  style,
  title,
}: LoadingSpinnerProps) {
  return (
    <svg
      className={['blog-spinner', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke={color}
      role={title ? 'status' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    >
      <circle cx="12" cy="12" r="9.5" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
