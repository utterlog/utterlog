import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // compact window around the current page
  const pages: number[] = [];
  const from = Math.max(1, currentPage - 2);
  const to = Math.min(totalPages, currentPage + 2);
  for (let i = from; i <= to; i++) pages.push(i);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="上一页"
      >
        <ChevronLeft />
      </Button>
      {from > 1 && <span className="px-1 text-sm text-muted-foreground">…</span>}
      {pages.map((p) => (
        <Button
          key={p}
          variant={p === currentPage ? 'default' : 'outline'}
          size="icon"
          onClick={() => onPageChange(p)}
        >
          {p}
        </Button>
      ))}
      {to < totalPages && <span className="px-1 text-sm text-muted-foreground">…</span>}
      <Button
        variant="outline"
        size="icon"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="下一页"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
