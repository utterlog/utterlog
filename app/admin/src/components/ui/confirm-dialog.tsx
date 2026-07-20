import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent } from './shadcn/dialog';
import { Button } from './button';
import { useI18n } from '@/lib/i18n';

// Adapter: legacy ConfirmDialog (isOpen/onClose/onConfirm/loading) rendered
// with the shadcn Dialog + warning icon.
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen, onClose, onConfirm, title, message,
  confirmText, cancelText, loading,
}: ConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" showClose={false}>
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <h3 className="mt-4 text-base font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <div className="mt-5 flex justify-center gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelText || t('admin.common.cancel', '取消')}</Button>
            <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmText || t('admin.common.confirm', '确认')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
