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
 * Loading spinner — pure CSS border ring + global `spin` keyframe.
 *
 * 之前是 SVG + SMIL `<animateTransform>`，在 React 19 hydration 边界
 * Chromium 可能冻结首帧，表现为导航中右上角 / 评论区 / 随机访问按钮
 * 里的圆圈"卡住"不转。纯 CSS 旋转是 hydration-safe 的，必然跑起来。
 *
 * 视觉跟原来几乎一致：3/4 可见环 + 单边 transparent + 旋转。颜色用
 * 原来的 hsl(228, 97%, 42%) 蓝色做默认，调用方不传 color 时保持原样。
 */
export default function LoadingSpinner({ size = 20, color = 'hsl(228, 97%, 42%)', className, style, title }: LoadingSpinnerProps) {
  // Border width scales with size —— 12px 评论区小点 2px，28px 卡片用 3px。
  const borderWidth = Math.max(2, Math.round(size / 10));
  return (
    <span
      className={['blog-spinner', className].filter(Boolean).join(' ')}
      role={title ? 'status' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        boxSizing: 'border-box',
        border: `${borderWidth}px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        opacity: 0.9,
        verticalAlign: 'middle',
        flexShrink: 0,
        // Reuse globals.css @keyframes spin (line 1348). inline animation
        // keeps the component self-contained without adding a new class.
        animation: 'spin 0.75s linear infinite',
        ...style,
      }}
    />
  );
}
