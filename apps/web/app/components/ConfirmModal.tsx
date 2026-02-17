'use client';

import { useEffect } from 'react';

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  taskTitle?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
};

export default function ConfirmModal({
  isOpen,
  title,
  message,
  taskTitle,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
}: ConfirmModalProps) {
  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const colors = {
    danger: { bg: '#fee2e2', text: '#991b1b', button: '#dc2626' },
    warning: { bg: '#fef3c7', text: '#92400e', button: '#f59e0b' },
    info: { bg: '#dbeafe', text: '#1e40af', button: '#F43F5E' },
  };

  const color = colors[variant];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onCancel}
      data-testid="confirm-modal"
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 450,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, marginBottom: 16, fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </h2>

        {taskTitle && (
          <div
            style={{
              background: color.bg,
              color: color.text,
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Task: {taskTitle}
          </div>
        )}

        <p style={{ margin: 0, marginBottom: 24, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            data-testid="confirm-no"
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            data-testid="confirm-yes"
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: 'none',
              background: color.button,
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
