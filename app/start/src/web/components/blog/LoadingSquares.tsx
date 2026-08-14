'use client';

import type { CSSProperties } from 'react';

interface LoadingSquaresProps {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * 四个方块依次外扩的加载指示，用在全屏磨砂层这种「占据整屏」的场合。
 * 小尺寸行内位置用 LoadingSpinner（圆环），banner 那种块状区域用
 * LoadingBars（竖条）。
 *
 * **动画走 CSS，不用 SMIL。** 原始设计是 <animate> 加
 * begin="spinner_M16P.begin+0.15s" 的链式引用，在 React 19 的 hydration
 * 边界上 Chromium 会冻结首帧 —— 这个项目在旋转圆环上栽过一次
 * （见 LoadingSpinner 的注释）。链式 begin 换成 animation-delay。
 *
 * 原动画同时动 x / y / width / height（9→11 并向外挪 1），等价于以自身
 * 中心放大到 11/9 ≈ 1.22 倍。这里直接用 transform: scale —— 走合成器，
 * 不像改几何属性那样每帧触发重排。
 */
export default function LoadingSquares({
  size = 40,
  color = 'hsl(228, 97%, 42%)',
  className,
  style,
  title,
}: LoadingSquaresProps) {
  return (
    <svg
      className={['blog-squares', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill={color}
      role={title ? 'status' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {/* 顺时针：左上 → 右上 → 右下 → 左下，节奏跟原动画一致 */}
      <rect x="1.5" y="1.5" rx="1" width="9" height="9" />
      <rect x="13.5" y="1.5" rx="1" width="9" height="9" />
      <rect x="13.5" y="13.5" rx="1" width="9" height="9" />
      <rect x="1.5" y="13.5" rx="1" width="9" height="9" />
    </svg>
  );
}
