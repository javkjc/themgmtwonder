'use client';

import React, { useState } from 'react';
import { Field } from '@/app/lib/api/fields';
import { Assignment } from '@/app/lib/api/baselines';

interface FieldAssignmentPanelProps {
    fields: Field[];
    assignments: Assignment[];
    isReadOnly: boolean;
    onUpdate: (fieldKey: string, value: string, sourceSegmentId?: string) => Promise<void>;
    onDelete: (fieldKey: string) => Promise<void>;
}

export default function FieldAssignmentPanel({
    fields,
    assignments,
    isReadOnly,
    onUpdate,
    onDelete,
}: FieldAssignmentPanelProps) {
    const [localValues, setLocalValues] = useState<Record<string, string>>({});

    const getAssignment = (fieldKey: string) => assignments.find((a) => a.fieldKey === fieldKey);

    const handleBlur = async (fieldKey: string, currentValue: string) => {
        const existing = getAssignment(fieldKey);
        if (existing?.assignedValue === currentValue) return;

        // Trigger update (modal for reason will be handled in parent or here)
        try {
            await onUpdate(fieldKey, currentValue);
        } catch (e) {
            // Handle error (revert local value if needed)
        }
    };

    const handleDrop = async (e: React.DragEvent, fieldKey: string) => {
        e.preventDefault();
        if (isReadOnly) return;

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.id && data.text) {
                await onUpdate(fieldKey, data.text, data.id);
            }
        } catch (err) {
            console.error('Drop failed', err);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {fields.map((field) => {
                const assignment = getAssignment(field.fieldKey);
                const value = localValues[field.fieldKey] ?? assignment?.assignedValue ?? '';

                return (
                    <div
                        key={field.id}
                        onDragOver={onDragOver}
                        onDrop={(e) => handleDrop(e, field.fieldKey)}
                        style={{
                            padding: '16px',
                            borderRadius: 16,
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <label
                                htmlFor={`field-${field.fieldKey}`}
                                style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                {field.label}
                                <span style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                                    {field.characterType}
                                </span>
                            </label>
                            {assignment && !isReadOnly && (
                                <button
                                    onClick={() => onDelete(field.fieldKey)}
                                    style={{
                                        fontSize: 11,
                                        color: '#ef4444',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                    }}
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <input
                                id={`field-${field.fieldKey}`}
                                type="text"
                                value={value}
                                disabled={isReadOnly}
                                onChange={(e) => setLocalValues({ ...localValues, [field.fieldKey]: e.target.value })}
                                onBlur={(e) => handleBlur(field.fieldKey, e.target.value)}
                                autoComplete="off"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid #cbd5e1',
                                    fontSize: 14,
                                    color: '#1e293b',
                                    background: isReadOnly ? '#f8fafc' : '#ffffff',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                            />
                            {assignment?.sourceSegmentId && (
                                <div
                                    style={{
                                        marginTop: 6,
                                        fontSize: 11,
                                        color: '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}
                                >
                                    <span title="Linked to text segment">🔗</span> Source linked
                                </div>
                            )}
                        </div>
                        {assignment?.correctionReason && (
                            <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '4px 8px', borderRadius: 6 }}>
                                Reason: {assignment.correctionReason}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
