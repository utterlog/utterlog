'use client';

// Shared <Button> for the blog frontend.
//
// 完全走 app/web/app/globals.css 的 .btn 体系（.btn / .btn-primary /
// .btn-secondary / .btn-danger / .btn-ghost + .btn-sm / .btn-lg），
// 这样 hover / :focus-visible / :disabled / :active 都在 CSS 层一次
// 定义，跟 admin .btn 的状态行为对齐 —— 不再用 inline CSSProperties，
// 否则伪类写不出来，焦点环、按下高亮全没了。
//
// loading=true：children 被替换成一个 .btn-spinner 环并把 disabled
// 自动设上；颜色继承 currentColor 所以 primary（白）/ secondary（深）
// 都能自然显示。

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    const classes = [
      'btn',
      `btn-${variant}`,
      size === 'sm' && 'btn-sm',
      size === 'lg' && 'btn-lg',
      className,
    ].filter(Boolean).join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        data-loading={loading ? 'true' : undefined}
        {...props}
      >
        {loading ? <span className="btn-spinner" aria-hidden="true" /> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
