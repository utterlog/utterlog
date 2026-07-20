import type { ReactNode } from 'react';
import { Pencil, Trash2, Star, Loader2, Plus } from 'lucide-react';
import { Button as ShadcnButton } from './shadcn/button';
import { Card } from './shadcn/card';
import { cn } from '@/lib/utils';

// Shared admin composites, now rendered with the shadcn design system.
// Public APIs are unchanged so every page keeps working.

interface AdminToolbarProps { meta?: ReactNode; actions?: ReactNode; }

export function AdminToolbar({ meta, actions }: AdminToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="mr-auto flex min-w-0 items-center gap-1">
        {typeof meta === 'string' ? <span className="text-sm text-muted-foreground">{meta}</span> : meta}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

interface MetricCardProps { label: ReactNode; value: ReactNode; color?: string; }

export function MetricCard({ label, value, color }: MetricCardProps) {
  return (
    <Card className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={color ? { color } : undefined}>{value}</p>
    </Card>
  );
}

interface MetricGridProps { children: ReactNode; columns?: number; compact?: boolean; }

export function MetricGrid({ children, columns = 3, compact }: MetricGridProps) {
  return (
    <div
      className={cn('grid gap-3', compact ? 'mb-5' : 'mb-6')}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function LoadingState({ label = '加载中…' }: { label?: string; padding?: string | number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

interface EmptyPanelProps {
  title?: string;
  actionText?: string;
  onAction?: () => void;
  padding?: string | number;
  fontSize?: string | number;
}

export function EmptyPanel({ title = '暂无内容', actionText, onAction }: EmptyPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {actionText && onAction && (
        <ShadcnButton variant="outline" size="sm" onClick={onAction}><Plus /> {actionText}</ShadcnButton>
      )}
    </div>
  );
}

interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editTitle?: string;
  deleteTitle?: string;
}

export function RowActions({ onEdit, onDelete, editTitle = '编辑', deleteTitle = '删除' }: RowActionsProps) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <ShadcnButton variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title={editTitle} onClick={onEdit}>
          <Pencil className="size-4" />
        </ShadcnButton>
      )}
      {onDelete && (
        <ShadcnButton variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title={deleteTitle} onClick={onDelete}>
          <Trash2 className="size-4" />
        </ShadcnButton>
      )}
    </div>
  );
}

interface RatingStarsProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  gap?: number;
}

export function RatingStars({ value, onChange, size = 18, gap = 4 }: RatingStarsProps) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex" style={{ gap }}>
      {stars.map((n) => {
        const filled = n <= value;
        const icon = (
          <Star
            style={{ width: size, height: size }}
            className={filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}
          />
        );
        if (!onChange) return <span key={n}>{icon}</span>;
        return (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} 星`} className="cursor-pointer p-0.5">
            {icon}
          </button>
        );
      })}
    </div>
  );
}

interface DialogFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitText?: string;
  cancelText?: string;
}

export function DialogFooter({ onCancel, onSubmit, submitting, submitText = '保存', cancelText = '取消' }: DialogFooterProps) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <ShadcnButton variant="outline" onClick={onCancel}>{cancelText}</ShadcnButton>
      <ShadcnButton onClick={onSubmit} disabled={submitting}>
        {submitting && <Loader2 className="animate-spin" />}{submitText}
      </ShadcnButton>
    </div>
  );
}

interface MediaItemCardProps {
  item: any;
  onEdit: (item: any) => void;
  onDelete: (id: number) => void;
  subtitle?: (item: any) => ReactNode;
  coverHeight?: number;
}

export function MediaItemCard({ item, onEdit, onDelete, subtitle, coverHeight = 160 }: MediaItemCardProps) {
  return (
    <Card className="overflow-hidden p-0">
      {item.cover_url && (
        <div className="w-full overflow-hidden bg-muted" style={{ height: coverHeight }}>
          <img src={item.cover_url} alt={item.title} className="size-full object-cover" />
        </div>
      )}
      <div className="p-3.5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">{item.title}</h3>
        {subtitle !== undefined ? <p className="mb-1.5 text-xs text-muted-foreground">{subtitle(item)}</p> : null}
        {item.rating > 0 && <div className="mb-1.5"><RatingStars value={item.rating} size={12} gap={2} /></div>}
        {item.comment && <p className="line-clamp-2 text-xs text-muted-foreground">{item.comment}</p>}
        <div className="mt-2"><RowActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} /></div>
      </div>
    </Card>
  );
}

interface MediaItemGridProps {
  items: any[];
  onEdit: (item: any) => void;
  onDelete: (id: number) => void;
  subtitle?: (item: any) => ReactNode;
  minWidth?: number;
  coverHeight?: number;
}

export function MediaItemGrid({ items, onEdit, onDelete, subtitle, minWidth = 240, coverHeight = 160 }: MediaItemGridProps) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}>
      {items.map((item) => (
        <MediaItemCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} subtitle={subtitle} coverHeight={coverHeight} />
      ))}
    </div>
  );
}
