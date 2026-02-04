'use client';

import { useState, useEffect } from 'react';

interface OcrFieldCreateModalProps {
    isOpen: boolean;
    isSaving: boolean;
    error: string | null;
    onClose: () => void;
    onSave: (payload: { fieldName: string; fieldValue: string; reason: string }) => void;
}

export default function OcrFieldCreateModal({
    isOpen,
    isSaving,
    error,
    onClose,
    onSave,
}: OcrFieldCreateModalProps) {
    const [fieldName, setFieldName] = useState('');
    const [fieldValue, setFieldValue] = useState('');
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!fieldName.trim() || !fieldValue.trim() || !reason.trim()) return;
        onSave({
            fieldName: fieldName.trim(),
            fieldValue: fieldValue.trim(),
            reason: reason.trim(),
        });
    };

    const isFormValid = fieldName.trim().length > 0 && fieldValue.trim().length > 0 && reason.trim().length > 0;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 42, 0.4)', // Slate 900 with alpha
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 20,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'white',
                    borderRadius: 16,
                    width: '100%',
                    maxHeight: '90vh',
                    maxWidth: 480,
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header */}
                <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                        Add Manual Field
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
                        Manually define a data point missed by extraction.
                    </p>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {error && (
                        <div style={{ padding: '10px 14px', background: '#feeded', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
                            {error}
                        </div>
                    )}

                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                            Field Name
                        </label>
                        <input
                            type="text"
                            value={fieldName}
                            onChange={(e) => setFieldName(e.target.value)}
                            placeholder="e.g. Invoice Number"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                fontSize: 14,
                                boxSizing: 'border-box'
                            }}
                            required
                            disabled={isSaving}
                            autoFocus
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                            Value
                        </label>
                        <input
                            type="text"
                            value={fieldValue}
                            onChange={(e) => setFieldValue(e.target.value)}
                            placeholder="The extracted value..."
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                fontSize: 14,
                                boxSizing: 'border-box'
                            }}
                            required
                            disabled={isSaving}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                            Reason for manual entry <span style={{ color: '#b91c1c' }}>*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Why is this field being added manually? (e.g. Missed by OCR, blurry text)"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                fontSize: 14,
                                minHeight: 80,
                                resize: 'vertical',
                                boxSizing: 'border-box'
                            }}
                            required
                            disabled={isSaving}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                color: '#475569',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!isFormValid || isSaving}
                            style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: 8,
                                border: 'none',
                                background: isFormValid && !isSaving ? '#2563eb' : '#94a3b8',
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: isFormValid && !isSaving ? 'pointer' : 'not-allowed'
                            }}
                        >
                            {isSaving ? 'Adding...' : 'Add Field'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
