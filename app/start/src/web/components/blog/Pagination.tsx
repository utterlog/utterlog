'use client';

import Link from '@/components/AppLink';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath?: string;
  onPageChange?: (page: number) => void;
}

const SIZE = 33;

const baseStyle: React.CSSProperties = {
  width: SIZE, height: SIZE,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '13px', fontWeight: 500,
  border: '1px solid #d0d0d0', background: '#fff', color: '#333',
  textDecoration: 'none', transition: 'all 0.15s', cursor: 'pointer',
};

const activeStyle: React.CSSProperties = {
  ...baseStyle,
  background: 'var(--color-primary, #f53004)', borderColor: 'var(--color-primary, #f53004)',
  color: '#fff', cursor: 'default',
};

const disabledStyle: React.CSSProperties = {
  ...baseStyle,
  color: '#ccc', borderColor: '#e0e0e0', cursor: 'default',
};

const ellipsisStyle: React.CSSProperties = {
  ...baseStyle,
  border: 'none', background: 'none', cursor: 'default', color: '#999',
};

export default function Pagination({ currentPage, totalPages, basePath = '', onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPageUrl = (page: number) => {
    if (page === 1) return basePath || '/';
    // 首页分页走 search 参数，为的是翻页不换路由、只换右侧列表
    // （详见 routes/index.tsx 的注释）。分类/标签等带 basePath 的列表
    // 仍是各自的路径式分页，它们本来就是同一条路由内换参数。
    if (!basePath) return `/?page=${page}`;
    return `${basePath}/page/${page}`;
  };

  // Build page numbers with ellipsis
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  const PageBtn = ({ p, children }: { p: number; children: React.ReactNode }) => {
    if (onPageChange) {
      return (
        <button onClick={(e) => { e.preventDefault(); onPageChange(p); }} style={baseStyle}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary, #f53004)'; e.currentTarget.style.color = 'var(--color-primary, #f53004)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.color = '#333'; }}
        >{children}</button>
      );
    }
    return (
      // 开预取（AppLink 默认 intent）：鼠标搭上按钮就开始取下一页，
      // 真正点下去时数据多半已经在手上了。原来这里是 prefetch={false}。
      <Link href={getPageUrl(p)} style={baseStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary, #f53004)'; e.currentTarget.style.color = 'var(--color-primary, #f53004)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.color = '#333'; }}
      >{children}</Link>
    );
  };

  return (
    <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '12px 0' }}>
      {/* Previous */}
      {currentPage > 1 ? (
        <PageBtn p={currentPage - 1}>
          <i className="fa-solid fa-chevron-left" style={{ fontSize: '11px' }} />
        </PageBtn>
      ) : (
        <span style={disabledStyle}>
          <i className="fa-solid fa-chevron-left" style={{ fontSize: '11px' }} />
        </span>
      )}

      {/* Page numbers */}
      {pages.map((page, idx) =>
        page === '...' ? (
          <span key={`e${idx}`} style={ellipsisStyle}>...</span>
        ) : page === currentPage ? (
          <span key={page} style={activeStyle}>{page}</span>
        ) : (
          <PageBtn key={page} p={page}>{page}</PageBtn>
        )
      )}

      {/* Next */}
      {currentPage < totalPages ? (
        <PageBtn p={currentPage + 1}>
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '11px' }} />
        </PageBtn>
      ) : (
        <span style={disabledStyle}>
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '11px' }} />
        </span>
      )}
    </nav>
  );
}
