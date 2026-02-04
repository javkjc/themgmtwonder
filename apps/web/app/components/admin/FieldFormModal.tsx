'use client';

import { useEffect, useState } from 'react';
import type { Field, FieldCharacterType, CreateFieldDto, UpdateFieldDto } from '../../lib/api/fields';

type FieldFormModalProps = {
    isOpen: boolean;
    mode: 'create' | 'edit';
    field?: Field;
    onSubmit: (data: CreateFieldDto | UpdateFieldDto) => Promise<void>;
    onCancel: () => void;
    submitting: boolean;
    error: string | null;
};

export default function FieldFormModal({
    isOpen,
    mode,
    field,
    onSubmit,
    onCancel,
    submitting,
    error,
}: FieldFormModalProps) {
    const [fieldKey, setFieldKey] = useState('');
    const [label, setLabel] = useState('');
    const [characterType, setCharacterType] = useState<FieldCharacterType>('varchar');
    const [characterLimit, setCharacterLimit] = useState('');
    const [showTypeChangeWarning, setShowTypeChangeWarning] = useState(false);

    // Initialize form when modal opens or field changes
    useEffect(() => {
        if (isOpen) {
            if (mode === 'edit' && field) {
                setFieldKey(field.fieldKey);
                setLabel(field.label);
                setCharacterType(field.characterType);
                setCharacterLimit(field.characterLimit ? String(field.characterLimit) : '');
                setShowTypeChangeWarning(false);
            } else {
                // Reset for create mode
                setFieldKey('');
                setLabel('');
                setCharacterType('varchar');
                setCharacterLimit('');
                setShowTypeChangeWarning(false);
            }
        }
    }, [isOpen, mode, field]);

    // Show warning when character type changes in edit mode
    useEffect(() => {
        if (mode === 'edit' && field && characterType !== field.characterType) {
            setShowTypeChangeWarning(true);
        } else {
            setShowTypeChangeWarning(false);
        }
    }, [mode, field, characterType]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (mode === 'create') {
            const dto: CreateFieldDto = {
                fieldKey: fieldKey.trim(),
                label: label.trim(),
                characterType,
                ...(characterType === 'varchar' && characterLimit ? { characterLimit: parseInt(characterLimit, 10) } : {}),
            };
            await onSubmit(dto);
        } else {
            const dto: UpdateFieldDto = {
                label: label.trim(),
                characterType,
                ...(characterType === 'varchar' && characterLimit ? { characterLimit: parseInt(characterLimit, 10) } : {}),
            };
            await onSubmit(dto);
        }
    };

    const isFormValid = () => {
        if (mode === 'create') {
            return fieldKey.trim() && label.trim();
        }
        return label.trim();
    };

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
        >
            <div
                style={{
                    background: 'white',
                    borderRadius: 12,
                    padding: 24,
                    maxWidth: 500,
                    width: '90%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{ margin: 0, marginBottom: 20, fontSize: 20, fontWeight: 600, color: '#1e293b' }}>
                    {mode === 'create' ? 'Create New Field' : 'Edit Field'}
                </h2>

                <form onSubmit={handleSubmit}>
                    {/* Field Key */}
                    <div style={{ marginBottom: 16 }}>
                        <label
                            htmlFor="fieldKey"
                            style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#475569' }}
                        >
                            Field Key {mode === 'create' && <span style={{ color: '#dc2626' }}>*</span>}
                        </label>
                        {mode === 'create' ? (
                            <>
                                <input
                                    id="fieldKey"
                                    type="text"
                                    value={fieldKey}
                                    onChange={(e) => setFieldKey(e.target.value)}
                                    placeholder="e.g., invoice_number"
                                    disabled={submitting}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 6,
                                        fontSize: 14,
                                        fontFamily: 'monospace',
                                        outline: 'none',
                                    }}
                                />
                                <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#dc2626' }}>
                                    ⚠️ Field key cannot be changed after creation. Use lowercase and underscores only.
                                </p>
                            </>
                        ) : (
                            <div
                                style={{
                                    padding: '10px 14px',
                                    background: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 6,
                                    fontSize: 14,
                                    fontFamily: 'monospace',
                                    color: '#64748b',
                                }}
                            >
                                {fieldKey}
                            </div>
                        )}
                    </div>

                    {/* Label */}
                    <div style={{ marginBottom: 16 }}>
                        <label
                            htmlFor="label"
                            style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#475569' }}
                        >
                            Label <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                            id="label"
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g., Invoice Number"
                            disabled={submitting}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: '1px solid #e2e8f0',
                                borderRadius: 6,
                                fontSize: 14,
                                outline: 'none',
                            }}
                        />
                    </div>

                    {/* Character Type */}
                    <div style={{ marginBottom: 16 }}>
                        <label
                            htmlFor="characterType"
                            style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#475569' }}
                        >
                            Character Type <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <select
                            id="characterType"
                            value={characterType}
                            onChange={(e) => setCharacterType(e.target.value as FieldCharacterType)}
                            disabled={submitting}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: '1px solid #e2e8f0',
                                borderRadius: 6,
                                fontSize: 14,
                                outline: 'none',
                                background: 'white',
                            }}
                        >
                            <option value="varchar">varchar</option>
                            <option value="int">int</option>
                            <option value="decimal">decimal</option>
                            <option value="date">date</option>
                            <option value="currency">currency</option>
                        </select>
                        {showTypeChangeWarning && (
                            <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#f59e0b' }}>
                                ⚠️ Changing character type will create a new field version
                            </p>
                        )}
                    </div>

                    {/* Character Limit (only for varchar) */}
                    {characterType === 'varchar' && (
                        <div style={{ marginBottom: 16 }}>
                            <label
                                htmlFor="characterLimit"
                                style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#475569' }}
                            >
                                Character Limit (optional)
                            </label>
                            <input
                                id="characterLimit"
                                type="number"
                                min="1"
                                value={characterLimit}
                                onChange={(e) => setCharacterLimit(e.target.value)}
                                placeholder="e.g., 255"
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 6,
                                    fontSize: 14,
                                    outline: 'none',
                                }}
                            />
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div
                            style={{
                                marginBottom: 16,
                                padding: 12,
                                background: '#fee2e2',
                                border: '1px solid #fecaca',
                                borderRadius: 6,
                                color: '#991b1b',
                                fontSize: 13,
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={submitting}
                            style={{
                                padding: '10px 20px',
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                color: '#64748b',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: submitting ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!isFormValid() || submitting}
                            style={{
                                padding: '10px 20px',
                                borderRadius: 6,
                                border: 'none',
                                background: !isFormValid() || submitting ? '#94a3b8' : '#3b82f6',
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: !isFormValid() || submitting ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {submitting ? 'Saving...' : mode === 'create' ? 'Create Field' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
