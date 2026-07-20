import { Dialog, DialogContent, DialogHeader, DialogTitle } from './shadcn/dialog';
import { cn } from '@/lib/utils';

// Adapter: legacy Modal (isOpen/onClose/title/size) now renders the shadcn
// Dialog (Base UI) — overlay, esc, scroll-lock and close button come for free.
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[680px]',
  xl: 'max-w-[860px]',
};

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(sizeMap[size], 'max-h-[calc(100vh-32px)] overflow-y-auto')}>
        {title && <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>}
        {children}
      </DialogContent>
    </Dialog>
  );
}
