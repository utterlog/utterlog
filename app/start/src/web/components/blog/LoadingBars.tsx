'use client';

import type { CSSProperties } from 'react';

interface LoadingBarsProps {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * 三条竖条依次起伏的加载指示，用在 banner 换图这种「块状区域」上 ——
 * 圆环适合小尺寸的行内位置，大块图片区域用竖条更压得住。
 * 其余地方仍用 LoadingSpinner（圆形）。
 *
 * **动画同样走 CSS，不用 SMIL。** 原始设计是 `<animate>` 加
 * `begin="spinner_aqiq.begin+0.15s"` 这种链式引用，在 React 19 的
 * hydration 边界上 Chromium 会冻结首帧 —— 这个项目在旋转圆环上已经
 * 栽过一次（见 LoadingSpinner 与 HomePage 里的注释）。链式 begin 换成
 * animation-delay，效果一样且必然跑起来。
 *
 * 形变用 transform: scaleY 而不是直接动 y / height：SVG 几何属性作为
 * CSS 动画目标虽然现代浏览器支持，但 transform 走合成器、更省，
 * 也不会触发布局。
 */
export default function LoadingBars({
  size = 24,
  color = 'hsl(228, 97%, 42%)',
  className,
  style,
  title,
}: LoadingBarsProps) {
  return (
    <svg
      className={['blog-bars', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill={color}
      role={title ? 'status' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <rect x="1" y="1" width="6" height="22" />
      <rect x="9" y="1" width="6" height="22" />
      <rect x="17" y="1" width="6" height="22" />
    </svg>
  );
}
