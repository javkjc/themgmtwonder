'use client';

import React from 'react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmStyle?: 'danger' | 'primary';
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    confirmStyle = 'primary',
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    const confirmButtonStyle = confirmStyle === 'danger'
        ? {
            background: '#dc2626',
            boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.4)',
          }
        : {
            background: '#2563eb',
            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)',
          };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 20,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#ffffff',
                    borderRadius: 24,
                    width: '100%',
                    maxWidth: 480,
                    padding: 32,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    animation: 'modalEnter 0.3s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                    {title}
                </h3>
                <p style={{ margin: '0 0 24px', fontSize: 15, color: '#475569', lineHeight: 1.6 }}>
                    {message}
                </p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '12px 24px',
                            borderRadius: 12,
                            background: '#f1f5f9',
                            border: 'none',
                            color: '#475569',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        style={{
                            padding: '12px 24px',
                            borderRadius: 12,
                            border: 'none',
                            color: '#ffffff',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            ...confirmButtonStyle,
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
            <style>{`
        @keyframes modalEnter {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
        </div>
    );
}
