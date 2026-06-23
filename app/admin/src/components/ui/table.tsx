

import { useI18n } from '@/lib/i18n';

interface TableProps {
  columns: { key: string; title: React.ReactNode; width?: string; render?: (row: any, col?: any, idx?: number) => React.ReactNode }[];
  data: any[];
  keyField?: string;
  loading?: boolean;
  emptyText?: string;
  rowStyle?: (row: any) => React.CSSProperties | undefined;
  // 'fixed' (default) = columns respect their widths strictly, good for
  // dense data tables. 'auto' = columns can grow with content, needed
  // when one column (e.g. inline tag list) should self-size to fit.
  tableLayout?: 'fixed' | 'auto';
}

export function Table({ columns, data, keyField = 'id', loading, emptyText, rowStyle, tableLayout = 'fixed' }: TableProps) {
  const { t } = useI18n();

  if (!loading && data.length === 0) {
    return (
      <div className="text-dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', fontSize: '14px' }}>
        {emptyText || t('admin.common.noData', '暂无数据')}
      </div>
    );
  }

  return (
    <div style={{ overflow: 'visible', position: 'relative', minHeight: loading ? '100px' : undefined }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(255,255,255,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(1px)',
        }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 20, color: 'var(--color-primary)' }} aria-hidden="true" />
        </div>
      )}
      <table className="table" style={{ width: '100%', tableLayout }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ width: col.width }}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr key={row[keyField]} className="hover:bg-soft" style={{ transition: 'background-color 0.1s', ...rowStyle?.(row) }}>
              {columns.map((col) => (
                <td key={`${row[keyField]}-${col.key}`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word', overflow: 'visible', position: 'relative' }}>
                  {col.render ? col.render(row, col, rowIdx) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total?: number;
}

export function Pagination({ currentPage, totalPages, onPageChange, total }: PaginationProps) {
  const { t } = useI18n();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', borderTop: '1px solid var(--color-divider)',
    }}>
      <span className="text-dim" style={{ fontSize: '13px' }}>
        {total !== undefined ? t('admin.common.totalItems', '共 {total} 条', { total }) : ''}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={{
            padding: '5px', borderRadius: '1px', border: '1px solid var(--color-border)',
            background: 'var(--color-bg-card)', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage <= 1 ? 0.4 : 1,
          }}
        >
          <i className="fa-solid fa-chevron-left" style={{ fontSize: '14px' }} />
        </button>
        <span className="text-sub" style={{ fontSize: '13px' }}>{currentPage} / {totalPages}</span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{
            padding: '5px', borderRadius: '1px', border: '1px solid var(--color-border)',
            background: 'var(--color-bg-card)', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage >= totalPages ? 0.4 : 1,
          }}
        >
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  );
}
