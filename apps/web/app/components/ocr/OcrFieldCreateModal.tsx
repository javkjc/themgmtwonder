'use client';

import { useState, useEffect } from 'react';

interface OcrFieldCreateModalProps {
    isOpen: boolean;
    isSaving: boolean;
    error: string | null;
    onClose: () => void;
    onSave: (payload: {
        fieldName: string;
        fieldValue: string;
        reason: string;
        fieldType: 'text' | 'number' | 'date' | 'currency';
    }) => void;
    initialFieldName?: string;
    initialFieldValue?: string;
}

export default function OcrFieldCreateModal({
    isOpen,
    isSaving,
    error,
    onClose,
    onSave,
    initialFieldName = '',
    initialFieldValue = '',
}: OcrFieldCreateModalProps) {
    const [fieldName, setFieldName] = useState(initialFieldName);
    const [fieldValue, setFieldValue] = useState(initialFieldValue);
    const [reason, setReason] = useState('');
    const [fieldType, setFieldType] = useState<'text' | 'number' | 'date' | 'currency'>('text');
    const [touched, setTouched] = useState({
        fieldName: false,
        fieldValue: false,
        reason: false,
    });
    const [previewValue, setPreviewValue] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setFieldName('');
            setFieldValue('');
            setReason('');
            setFieldType('text');
            setPreviewValue(null);
            setTouched({
                fieldName: false,
                fieldValue: false,
                reason: false,
            });
        } else {
            // Pre-fill when opening if initials are provided
            setFieldName(initialFieldName);
            setFieldValue(initialFieldValue);
            setPreviewValue(null);
        }
    }, [isOpen, initialFieldName, initialFieldValue]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = fieldName.trim();
        const trimmedValue = fieldValue.trim();
        const trimmedReason = reason.trim();
        setTouched({
            fieldName: true,
            fieldValue: true,
            reason: true,
        });
        if (!trimmedName || !trimmedValue || !trimmedReason) return;
        onSave({
            fieldName: trimmedName,
            fieldValue: trimmedValue,
            reason: trimmedReason,
            fieldType,
        });
    };

    const fieldNameError =
        touched.fieldName && fieldName.trim().length === 0 ? 'Field name is required' : undefined;
    const fieldValueError =
        touched.fieldValue && fieldValue.trim().length === 0 ? 'Field value is required' : undefined;
    const reasonError =
        touched.reason && reason.trim().length === 0 ? 'Reason is required' : undefined;

    const isFormValid =
        fieldName.trim().length > 0 &&
        fieldValue.trim().length > 0 &&
        reason.trim().length > 0;

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
                            onBlur={() => setTouched((prev) => ({ ...prev, fieldName: true }))}
                            placeholder="e.g. Invoice Number"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: `1px solid ${fieldNameError ? '#ef4444' : '#e2e8f0'}`,
                                fontSize: 14,
                                boxSizing: 'border-box',
                            }}
                            required
                            disabled={isSaving}
                            autoFocus
                            aria-invalid={Boolean(fieldNameError)}
                        />
                        {fieldNameError && (
                            <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>{fieldNameError}</p>
                        )}
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                            Value
                        </label>
                        <input
                            type="text"
                            value={fieldValue}
                            onChange={(e) => {
                                setFieldValue(e.target.value);
                                setPreviewValue(null);
                            }}
                            onBlur={() => setTouched((prev) => ({ ...prev, fieldValue: true }))}
                            placeholder="The extracted value..."
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: `1px solid ${fieldValueError ? '#ef4444' : '#e2e8f0'}`,
                                fontSize: 14,
                                boxSizing: 'border-box',
                                marginBottom: 8,
                            }}
                            required
                            disabled={isSaving}
                            aria-invalid={Boolean(fieldValueError)}
                        />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: previewValue ? 8 : 0 }}>
                            <button
                                type="button"
                                onClick={() => setPreviewValue(fieldValue.trim())}
                                disabled={isSaving || !fieldValue}
                                style={{
                                    fontSize: 11,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #e2e8f0',
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    fontWeight: 600,
                                    cursor: isSaving || !fieldValue ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                onMouseOver={(e) => {
                                    if (!isSaving && fieldValue) e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                                onMouseOut={(e) => {
                                    if (!isSaving && fieldValue) e.currentTarget.style.borderColor = '#e2e8f0';
                                }}
                            >
                                Trim
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewValue(fieldValue.replace(/[^\d.-]/g, ''))}
                                disabled={isSaving || !fieldValue}
                                style={{
                                    fontSize: 11,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #e2e8f0',
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    fontWeight: 600,
                                    cursor: isSaving || !fieldValue ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                onMouseOver={(e) => {
                                    if (!isSaving && fieldValue) e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                                onMouseOut={(e) => {
                                    if (!isSaving && fieldValue) e.currentTarget.style.borderColor = '#e2e8f0';
                                }}
                            >
                                Normalize Currency
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const d = new Date(fieldValue);
                                    if (!isNaN(d.getTime())) {
                                        setPreviewValue(d.toISOString().split('T')[0]);
                                    } else {
                                        setPreviewValue('Invalid Date');
                                    }
                                }}
                                disabled={isSaving || !fieldValue}
                                style={{
                                    fontSize: 11,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #e2e8f0',
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    fontWeight: 600,
                                    cursor: isSaving || !fieldValue ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                onMouseOver={(e) => {
                                    if (!isSaving && fieldValue) e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                                onMouseOut={(e) => {
                                    if (!isSaving && fieldValue) e.currentTarget.style.borderColor = '#e2e8f0';
                                }}
                            >
                                Parse Date
                            </button>
                        </div>
                        {previewValue !== null && (
                            <div
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    background: '#f0f9ff',
                                    border: '1px solid #bae6fd',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 8,
                                }}
                            >
                                <div style={{ fontSize: 12, color: '#0369a1' }}>
                                    <span style={{ fontWeight: 700, marginRight: 6 }}>Preview:</span>
                                    <code style={{ background: '#e0f2fe', padding: '2px 4px', borderRadius: 4 }}>{previewValue}</code>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        type="button"
                                        onClick={() => setPreviewValue(null)}
                                        style={{
                                            padding: '4px 8px',
                                            borderRadius: 6,
                                            border: 'none',
                                            background: 'transparent',
                                            color: '#64748b',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Discard
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (previewValue !== 'Invalid Date') {
                                                setFieldValue(previewValue);
                                                setPreviewValue(null);
                                            }
                                        }}
                                        disabled={previewValue === 'Invalid Date'}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: 6,
                                            border: 'none',
                                            background: previewValue === 'Invalid Date' ? '#94a3b8' : '#0284c7',
                                            color: 'white',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            cursor: previewValue === 'Invalid Date' ? 'not-allowed' : 'pointer',
                                            boxShadow: previewValue === 'Invalid Date' ? 'none' : '0 2px 4px rgba(2, 132, 199, 0.2)',
                                        }}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                        {fieldValueError && (
                            <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>{fieldValueError}</p>
                        )}
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                            Field Type
                        </label>
                        <select
                            value={fieldType}
                            onChange={(e) => setFieldType(e.target.value as 'text' | 'number' | 'date' | 'currency')}
                            disabled={isSaving}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                fontSize: 14,
                                boxSizing: 'border-box',
                                background: isSaving ? '#f1f5f9' : '#ffffff',
                            }}
                        >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="currency">Currency</option>
                        </select>
                        <p style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                            Choose a type so downstream workflows understand how this field should behave.
                        </p>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                            Reason for manual entry <span style={{ color: '#b91c1c' }}>*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            onBlur={() => setTouched((prev) => ({ ...prev, reason: true }))}
                            placeholder="Why is this field being added manually? (e.g. Missed by OCR, blurry text)"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: `1px solid ${reasonError ? '#ef4444' : '#e2e8f0'}`,
                                fontSize: 14,
                                minHeight: 80,
                                resize: 'vertical',
                                boxSizing: 'border-box',
                            }}
                            required
                            disabled={isSaving}
                            aria-invalid={Boolean(reasonError)}
                        />
                        {reasonError && (
                            <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>{reasonError}</p>
                        )}
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
