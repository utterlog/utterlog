'use client';

import { Modal } from './modal';
import { Button } from './button';

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
  confirmText = '确认', cancelText = '取消', loading,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px', height: '48px', margin: '0 auto', borderRadius: '50%',
          backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px', color: '#dc2626' }} />
        </div>
        <h3 className="text-main" style={{ fontSize: '16px', fontWeight: 600, marginTop: '16px' }}>{title}</h3>
        <p className="text-sub" style={{ fontSize: '14px', marginTop: '8px' }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelText}</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmText}</Button>
        </div>
      </div>
    </Modal>
  );
}
