'use client';


interface TableProps {
  columns: { key: string; title: React.ReactNode; width?: string; render?: (row: any, col?: any, idx?: number) => React.ReactNode }[];
  data: any[];
  keyField?: string;
  loading?: boolean;
  emptyText?: string;
  rowStyle?: (row: any) => React.CSSProperties | undefined;
}

export function Table({ columns, data, keyField = 'id', loading, emptyText = '暂无数据', rowStyle }: TableProps) {
  if (!loading && data.length === 0) {
    return (
      <div className="text-dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', fontSize: '14px' }}>
        {emptyText}
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
          <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="var(--color-primary)">
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
            <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
              <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
            </path>
          </svg>
        </div>
      )}
      <table className="table" style={{ width: '100%', tableLayout: 'fixed' }}>
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
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', borderTop: '1px solid var(--color-divider)',
    }}>
      <span className="text-dim" style={{ fontSize: '13px' }}>
        {total !== undefined ? `共 ${total} 条` : ''}
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
