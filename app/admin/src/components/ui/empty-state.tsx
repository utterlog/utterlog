
import { Inbox } from 'lucide-react';
import { Button } from './button';
import { useI18n } from '@/lib/i18n';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  actionText,
  onAction,
}: EmptyStateProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-7 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-base font-medium text-foreground">{title || t('admin.common.noData', '暂无数据')}</h3>
      <p className="mb-4 text-sm text-muted-foreground">{description || t('admin.common.emptyCreateHint', '开始创建您的第一条记录吧')}</p>
      {actionText && onAction && (
        <Button onClick={onAction}>{actionText}</Button>
      )}
    </div>
  );
}
