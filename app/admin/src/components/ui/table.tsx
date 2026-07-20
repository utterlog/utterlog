import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  Table as STable, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from './shadcn/table';
import { Button } from './shadcn/button';
import { useI18n } from '@/lib/i18n';

// Adapter: legacy columns-API Table + Pagination rendered with shadcn.
interface TableProps {
  columns: { key: string; title: React.ReactNode; width?: string; render?: (row: any, col?: any, idx?: number) => React.ReactNode }[];
  data: any[];
  keyField?: string;
  loading?: boolean;
  emptyText?: string;
  rowStyle?: (row: any) => React.CSSProperties | undefined;
  tableLayout?: 'fixed' | 'auto';
}

export function Table({ columns, data, keyField = 'id', loading, emptyText, rowStyle, tableLayout = 'fixed' }: TableProps) {
  const { t } = useI18n();

  if (!loading && data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        {emptyText || t('admin.common.noData', '暂无数据')}
      </div>
    );
  }

  return (
    <div className="relative" style={{ minHeight: loading ? 100 : undefined }}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
        </div>
      )}
      <STable style={{ tableLayout }}>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} style={{ width: col.width }}>{col.title}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIdx) => (
            <TableRow key={row[keyField]} style={rowStyle?.(row)}>
              {columns.map((col) => (
                <TableCell key={`${row[keyField]}-${col.key}`} className="break-words align-middle">
                  {col.render ? col.render(row, col, rowIdx) : row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </STable>
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
    <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
      <span className="text-sm text-muted-foreground">
        {total !== undefined ? t('admin.common.totalItems', '共 {total} 条', { total }) : ''}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="size-8" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm text-muted-foreground">{currentPage} / {totalPages}</span>
        <Button variant="outline" size="icon" className="size-8" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
