import { ButtonHTMLAttributes, forwardRef } from 'react';

// Unified with global .btn CSS classes so every <Button> in the admin inherits
// the same radius / min-height / padding as any raw .btn usage. Variants map
// directly to .btn-primary / .btn-secondary / .btn-danger / .btn-ghost, and
// the .card .btn { border-radius: 0 } rule continues to square-off buttons
// inside cards without any per-site change here.
//
// Size only nudges font-size / padding — the box (radius, border, appearance)
// still comes from .btn so the whole admin looks consistent.

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const sizeStyle: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '12px', minHeight: '32px' },
  md: {}, // inherit .btn defaults (48px min-height, .625rem 1rem padding, 14px)
  lg: { padding: '.75rem 1.25rem', fontSize: '14px', minHeight: '52px' },
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, disabled, style, className = '', ...props }, ref) => {
    const classes = `btn btn-${variant}${className ? ' ' + className : ''}`;
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={classes}
        style={{ ...sizeStyle[size], ...style }}
        {...props}
      >
        {loading ? (
          // v2.3.11: 统一 admin loading 视觉 —— 齿轮 SVG + spin-cog
          // keyframe 全部撤掉，改用与 Spinner 组件、其它散写位置一致
          // 的 fa-spinner fa-spin（FA 自带 keyframes，无本地动画）。
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 14 }} aria-hidden="true" />
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
