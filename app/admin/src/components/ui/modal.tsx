
import { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = { sm: '400px', md: '520px', lg: '680px', xl: '860px' };

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: sizeMap[size],
        maxHeight: 'calc(100vh - 32px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-card)', borderRadius: '1px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
      }}>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
            flex: '0 0 auto',
          }}>
            <h3 className="text-main" style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>{title}</h3>
            <button onClick={onClose} className="btn-ghost" style={{ padding: '4px', borderRadius: '1px', border: 'none', cursor: 'pointer' }}>
              <i className="fa-solid fa-xmark text-dim" style={{ fontSize: '16px' }} />
            </button>
          </div>
        )}
        <div style={{ flex: '1 1 auto', padding: '20px', minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
