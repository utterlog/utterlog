'use client';

import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  onClose: (id: string) => void;
  duration?: number;
}

const iconClasses = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation',
  info: 'fa-solid fa-circle-info',
};

export function Toast({ id, type, message, onClose, duration = 3000 }: ToastProps) {
  const colorMap = {
    success: { bg: '#f0fdf4', text: '#166534', accent: '#16a34a' },
    error: { bg: '#fef2f2', text: '#991b1b', accent: '#dc2626' },
    info: { bg: 'var(--color-bg-soft)', text: 'var(--color-text-main)', accent: 'var(--color-primary)' },
  };
  const c = colorMap[type];

  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', borderRadius: '1px',
        borderLeft: `4px solid ${c.accent}`,
        backgroundColor: c.bg, color: c.text,
        minWidth: '300px', maxWidth: '480px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        animation: 'slideIn 0.2s ease-out',
      }}
    >
      <i className={iconClasses[type]} style={{ flexShrink: 0, fontSize: '18px', color: c.accent }} />
      <p style={{ flex: 1, fontSize: '13px', fontWeight: 500, margin: 0 }}>{message}</p>
      <button
        onClick={() => onClose(id)}
        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: '2px' }}
      >
        <i className="fa-solid fa-xmark" style={{ fontSize: '14px', color: c.text }} />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: { id: string; type: ToastType; message: string }[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div style={{ position: 'fixed', top: '72px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {toasts.map((toast) => (
        <Toast key={toast.id} id={toast.id} type={toast.type} message={toast.message} onClose={onRemove} />
      ))}
    </div>
  );
}
