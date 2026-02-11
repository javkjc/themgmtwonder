'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Assignment, AssignmentValidation } from '@/app/lib/api/baselines';
import { Field, FieldCharacterType } from '@/app/lib/api/fields';

interface ResetLocalField {
  key: string;
  version: number;
}

interface FieldAssignmentPanelProps {
  fields: Field[];
  assignments: Assignment[];
  isReadOnly: boolean;
  onUpdate?: (fieldKey: string, value: string, sourceSegmentId?: string) => Promise<void>;
  onDelete?: (fieldKey: string) => Promise<void>;
  onLocalValuesChange?: (localValues: Record<string, string>) => void;
  resetLocalField?: ResetLocalField | null;
  readOnlyReason?: string;
  highlightFieldKey?: string | null;
}

const typeInputAttributes: Record<FieldCharacterType, { type: React.HTMLInputTypeAttribute; inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url'; step?: string; placeholder?: string }> = {
  varchar: { type: 'text' },
  int: { type: 'number', inputMode: 'numeric', step: '1' },
  decimal: { type: 'number', inputMode: 'decimal', step: '0.01' },
  currency: { type: 'text', inputMode: 'text', placeholder: 'USD' },
  date: { type: 'text', placeholder: 'YYYY-MM-DD' },
  email: { type: 'email', inputMode: 'email', placeholder: 'user@example.com' },
  phone: { type: 'tel', inputMode: 'tel', placeholder: '+1234567890' },
  url: { type: 'url', inputMode: 'url', placeholder: 'https://example.com' },
  percentage: { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: '0-100' },
  boolean: { type: 'text', placeholder: 'true/false' },
};

const typeLabels: Record<FieldCharacterType, string> = {
  varchar: 'Text',
  int: 'Number',
  decimal: 'Decimal',
  currency: 'Currency',
  date: 'Date',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  percentage: 'Percentage',
  boolean: 'Yes/No',
};

const typeExamples: Record<FieldCharacterType, string> = {
  varchar: 'Any text value',
  int: 'e.g., 0, 42, 100 (minimum: 0)',
  decimal: 'e.g., 0, 1.234, 45.46, 99.99 (minimum: 0)',
  currency: 'e.g., USD, EUR, SGD, JPY',
  date: 'e.g., 2024-12-31, 2025-01-15',
  email: 'e.g., user@example.com',
  phone: 'e.g., +1234567890, +65 9123 4567',
  url: 'e.g., https://example.com',
  percentage: 'e.g., 0, 85.5, 100 (range: 0-100)',
  boolean: 'e.g., true, false, yes, no',
};

const getStatusLabel = (assignment?: Assignment) => {
  if (!assignment || !assignment.assignedValue) {
    return { label: 'Unassigned', color: '#94a3b8' };
  }
  if (assignment.validation && !assignment.validation.valid) {
    return { label: 'Validation error', color: '#dc2626' };
  }
  return { label: 'Assigned', color: '#16a34a' };
};

const getValidationMessage = (validation?: AssignmentValidation) => {
  if (!validation) return null;
  if (!validation.valid) {
    return validation.error ?? 'Invalid value';
  }
  if (validation.suggestedCorrection) {
    return `Suggested: ${validation.suggestedCorrection}`;
  }
  return null;
};

export default function FieldAssignmentPanel({
  fields,
  assignments,
  isReadOnly,
  onUpdate,
  onDelete,
  onLocalValuesChange,
  resetLocalField,
  readOnlyReason,
  highlightFieldKey,
}: FieldAssignmentPanelProps) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const assignmentMap = useMemo(() => {
    const map: Record<string, Assignment> = {};
    assignments.forEach((assignment) => {
      map[assignment.fieldKey] = assignment;
    });
    return map;
  }, [assignments]);

  // Clear local values when assignments update from backend
  useEffect(() => {
    setLocalValues((prev) => {
      const updated = { ...prev };
      let changed = false;

      assignments.forEach((assignment) => {
        if (updated[assignment.fieldKey] !== undefined) {
          delete updated[assignment.fieldKey];
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [assignments]);

  // Notify parent when local values change
  useEffect(() => {
    onLocalValuesChange?.(localValues);
  }, [localValues, onLocalValuesChange]);

  const resetKey = resetLocalField?.key;
  const resetVersion = resetLocalField?.version;

  useEffect(() => {
    if (!resetKey) return;
    setLocalValues((prev) => {
      if (!(resetKey in prev)) return prev;
      const { [resetKey]: _, ...rest } = prev;
      return rest;
    });
  }, [resetKey, resetVersion]);

  const handleBlur = useCallback(
    async (fieldKey: string, value: string) => {
      if (isReadOnly || !onUpdate) return;
      const existing = assignmentMap[fieldKey];
      if (existing?.assignedValue === value) return;
      try {
        await onUpdate(fieldKey, value);
      } catch {
        // Handled by parent; keep UI stable for now.
      }
    },
    [assignmentMap, isReadOnly, onUpdate],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent, fieldKey: string) => {
      event.preventDefault();
      if (isReadOnly || !onUpdate) return;
      try {
        const raw = event.dataTransfer.getData('application/json');
        const data = JSON.parse(raw);
        if (data && data.text) {
          // Optimistically update local state to show value immediately
          setLocalValues((prev) => ({
            ...prev,
            [fieldKey]: data.text,
          }));
          await onUpdate(fieldKey, data.text, data.id);
        }
      } catch (error) {
        console.error('Field assignment drop failed', error);
        // Revert optimistic update on error
        setLocalValues((prev) => {
          const { [fieldKey]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [isReadOnly, onUpdate],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isReadOnly && readOnlyReason && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#475569',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>🔒</span>
          {readOnlyReason}
        </div>
      )}
      {fields.map((field) => {
        const assignment = assignmentMap[field.fieldKey];
        const hasLocalValue = localValues[field.fieldKey] !== undefined;
        const value = localValues[field.fieldKey] ?? assignment?.assignedValue ?? '';
        const status = getStatusLabel(assignment);
        const validation = assignment?.validation;
        const validationMessage = getValidationMessage(validation);
        const inputAttrs = typeInputAttributes[field.characterType] ?? typeInputAttributes.varchar;

        // Show error styling if: backend has validation error OR user has unsaved local value
        const hasValidationError = (validation && !validation.valid) || hasLocalValue;

        const isHighlighted = highlightFieldKey === field.fieldKey;

        return (
          <div
            key={field.id}
            onDragOver={handleDragOver}
            onDrop={(event) => handleDrop(event, field.fieldKey)}
            style={{
              padding: '16px',
              borderRadius: 16,
              border: isHighlighted ? '2px solid #fb923c' : hasValidationError ? '2px solid #fecaca' : '1px solid #e2e8f0',
              background: isHighlighted ? '#fff7ed' : hasValidationError ? '#fef2f2' : '#ffffff',
              transition: 'box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease',
              boxShadow: isHighlighted
                ? '0 6px 18px -4px rgba(251, 146, 60, 0.35)'
                : hasValidationError
                  ? '0 4px 10px -2px rgba(220, 38, 38, 0.15)'
                  : '0 4px 10px -2px rgba(15, 23, 42, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {hasValidationError && <span style={{ fontSize: 16 }}>⚠️</span>}
                <div style={{ fontSize: 13, fontWeight: 700, color: hasValidationError ? '#b91c1c' : '#0f172a' }}>
                  {field.label}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: '#475569',
                  borderRadius: 99,
                  padding: '2px 8px',
                  background: '#f1f5f9',
                }}
              >
                {typeLabels[field.characterType] || field.characterType}
              </span>
            </div>

            <div style={{ position: 'relative', width: '100%' }}>
              <input
                id={`field-${field.fieldKey}`}
                value={value}
                disabled={isReadOnly}
                onChange={(event) =>
                  setLocalValues((prev) => ({
                    ...prev,
                    [field.fieldKey]: event.target.value,
                  }))
                }
                onBlur={(event) => handleBlur(field.fieldKey, event.target.value)}
                autoComplete="off"
                placeholder={assignment ? '' : (inputAttrs.placeholder ?? 'Unassigned')}
                type={inputAttrs.type}
                inputMode={inputAttrs.inputMode ?? undefined}
                step={inputAttrs.step ?? undefined}
                style={{
                  width: '100%',
                  borderRadius: 10,
                  border: `1px solid ${validation && !validation.valid ? '#fecaca' : '#cbd5e1'}`,
                  padding: '10px 12px',
                  paddingRight: field.characterType === 'date' ? '42px' : '12px',
                  fontSize: 14,
                  color: isReadOnly ? '#475569' : '#0f172a',
                  background: isReadOnly ? '#f8fafc' : '#ffffff',
                  outline: 'none',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
              />
              {field.characterType === 'date' && !isReadOnly && (
                <label
                  htmlFor={`date-picker-${field.fieldKey}`}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    background: '#f1f5f9',
                    borderRadius: 6,
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#e2e8f0')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                  title="Pick a date"
                >
                  <span style={{ fontSize: 14 }}>📅</span>
                  <input
                    id={`date-picker-${field.fieldKey}`}
                    type="date"
                    disabled={isReadOnly}
                    onChange={(e) => {
                      if (e.target.value) {
                        setLocalValues((prev) => ({
                          ...prev,
                          [field.fieldKey]: e.target.value,
                        }));
                        handleBlur(field.fieldKey, e.target.value);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                    }}
                  />
                </label>
              )}
            </div>

            {/* Tooltip with example values */}
            <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
              {typeExamples[field.characterType]}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: status.color }}>{status.label}</span>
              {assignment?.sourceSegmentId && (
                <span style={{ fontSize: 11, color: '#64748b' }}>Linked to text segment</span>
              )}
            </div>

            {validationMessage && (
              <div
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  padding: validation?.valid ? '4px 8px' : '8px 10px',
                  borderRadius: 8,
                  background: validation?.valid ? '#f0fdf4' : '#fee2e2',
                  border: validation?.valid ? '1px solid #bbf7d0' : '1px solid #fecaca',
                  color: validation?.valid ? '#166534' : '#991b1b',
                  fontWeight: validation?.valid ? 500 : 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {!validation?.valid && <span style={{ fontSize: 14 }}>❌</span>}
                <span>{validationMessage}</span>
              </div>
            )}

            {assignment?.correctionReason && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: '#475569',
                  background: '#f8fafc',
                  padding: '4px 8px',
                  borderRadius: 6,
                }}
              >
                Reason: {assignment.correctionReason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
