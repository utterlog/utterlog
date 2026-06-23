import type { ReactNode } from 'react';

interface PageTitleProps {
  title: ReactNode;
  icon?: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function PageTitle({
  title,
  icon,
  subtitle,
  meta,
  actions,
  className = '',
}: PageTitleProps) {
  const cls = ['blog-page-title', className].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <span className="blog-page-title-rail" aria-hidden="true" />
      <div className="blog-page-title-main">
        {icon && (
          <span className="blog-page-title-icon" aria-hidden="true">
            <i className={icon} />
          </span>
        )}
        <div className="blog-page-title-copy">
          <h1 className="blog-page-title-text">{title}</h1>
          {subtitle && <div className="blog-page-title-subtitle">{subtitle}</div>}
        </div>
      </div>
      {(meta || actions) && (
        <div className="blog-page-title-side">
          {actions}
          {meta && <div className="blog-page-title-meta">{meta}</div>}
        </div>
      )}
    </div>
  );
}
