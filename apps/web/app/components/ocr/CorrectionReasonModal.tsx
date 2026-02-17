'use client';

import React, { useState } from 'react';

interface CorrectionReasonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    title: string;
    message: string;
    confirmLabel?: string;
}

export default function CorrectionReasonModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Save changes',
}: CorrectionReasonModalProps) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const trimmed = reason.trim();
        if (trimmed.length < 10) {
            setError('Correction reason must be at least 10 characters long.');
            return;
        }
        onConfirm(trimmed);
        setReason('');
        setError(null);
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
                <h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {title}
                </h3>
                <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {message}
                </p>

                <div style={{ marginBottom: 24 }}>
                    <label
                        htmlFor="correction-reason"
                        style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}
                    >
                        Correction Reason
                    </label>
                    <textarea
                        id="correction-reason"
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            if (e.target.value.trim().length >= 10) setError(null);
                        }}
                        placeholder="Explain why this change is being made (min 10 characters)..."
                        style={{
                            width: '100%',
                            minHeight: 120,
                            padding: '12px 16px',
                            borderRadius: 12,
                            border: `1px solid ${error ? '#ef4444' : '#d4d4d4'}`,
                            fontSize: 14,
                            color: 'var(--text-primary)',
                            outline: 'none',
                            resize: 'vertical',
                            transition: 'all 0.2s',
                        }}
                    />
                    {error && <p style={{ marginTop: 6, fontSize: 12, color: '#ef4444', fontWeight: 500 }}>{error}</p>}
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '12px 24px',
                            borderRadius: 12,
                            background: '#f5f5f5',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        style={{
                            padding: '12px 24px',
                            borderRadius: 12,
                            background: '#E11D48',
                            border: 'none',
                            color: '#ffffff',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)',
                            transition: 'all 0.2s',
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
