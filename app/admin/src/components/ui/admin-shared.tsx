import type { ReactNode } from 'react';
import { Button } from './button';

interface AdminToolbarProps {
  meta?: ReactNode;
  actions?: ReactNode;
}

export function AdminToolbar({ meta, actions }: AdminToolbarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: 'auto', minWidth: 0 }}>
        {typeof meta === 'string' ? <span className="text-dim" style={{ fontSize: '13px' }}>{meta}</span> : meta}
      </div>
      {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

export function MetricCard({ label, value, color }: MetricCardProps) {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <p className="text-dim" style={{ fontSize: '12px' }}>{label}</p>
      <p style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color }}>{value}</p>
    </div>
  );
}

interface MetricGridProps {
  children: ReactNode;
  columns?: number;
  compact?: boolean;
}

export function MetricGrid({ children, columns = 3, compact }: MetricGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '12px', marginBottom: compact ? '20px' : '24px' }}>
      {children}
    </div>
  );
}

export function LoadingState({ label = '加载中…', padding = '48px' }: { label?: string; padding?: string | number }) {
  return <div className="text-dim" style={{ textAlign: 'center', padding, fontSize: '13px' }}>{label}</div>;
}

interface EmptyPanelProps {
  title?: string;
  actionText?: string;
  onAction?: () => void;
  padding?: string | number;
  fontSize?: string | number;
}

export function EmptyPanel({ title = '暂无内容', actionText, onAction, padding = '48px', fontSize = '15px' }: EmptyPanelProps) {
  return (
    <div className="text-dim" style={{ textAlign: 'center', padding }}>
      <p style={{ fontSize, marginBottom: actionText ? '12px' : 0 }}>{title}</p>
      {actionText && onAction && (
        <Button onClick={onAction}>
          <i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />
          {actionText}
        </Button>
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
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
      {onEdit && (
        <button onClick={onEdit} className="action-btn primary" title={editTitle}>
          <i className="fa-regular fa-pen" style={{ fontSize: '14px' }} />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} className="action-btn danger" title={deleteTitle}>
          <i className="fa-regular fa-trash" style={{ fontSize: '14px' }} />
        </button>
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
    <div style={{ display: 'flex', gap }}>
      {stars.map((n) => {
        const icon = (
          <i
            className="fa-regular fa-star"
            style={{ fontSize: size, color: n <= value ? '#f59e0b' : 'var(--color-text-dim)' }}
          />
        );
        if (!onChange) return <span key={n}>{icon}</span>;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} 星`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
          >
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
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
      <Button variant="secondary" onClick={onCancel}>{cancelText}</Button>
      <Button onClick={onSubmit} loading={submitting}>{submitText}</Button>
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
    <div className="card" style={{ overflow: 'hidden' }}>
      {item.cover_url && (
        <div style={{ width: '100%', height: `${coverHeight}px`, backgroundColor: 'var(--color-bg-soft)', overflow: 'hidden' }}>
          <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ padding: '14px' }}>
        <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{item.title}</h3>
        {subtitle !== undefined ? (
          <p className="text-sub" style={{ fontSize: '12px', marginBottom: '6px' }}>{subtitle(item)}</p>
        ) : null}
        {item.rating > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <RatingStars value={item.rating} size={12} gap={2} />
          </div>
        )}
        {item.comment && (
          <p
            className="text-dim"
            style={{ fontSize: '12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {item.comment}
          </p>
        )}
        <div style={{ marginTop: '8px' }}>
          <RowActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />
        </div>
      </div>
    </div>
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
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: '12px' }}>
      {items.map((item) => (
        <MediaItemCard
          key={item.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          subtitle={subtitle}
          coverHeight={coverHeight}
        />
      ))}
    </div>
  );
}
