'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Assignment, AssignmentValidation, Segment } from '@/app/types';
import { Field, FieldCharacterType } from '@/app/lib/api/fields';
import SuggestedFieldInput from '@/app/components/suggestions/SuggestedFieldInput';
import SuggestionActionModal from '@/app/components/suggestions/SuggestionActionModal';
import { AssignPayload, DeleteAssignmentPayload } from '../lib/api/baselines';

interface ResetLocalField {
  key: string;
  version: number;
}

interface FieldAssignmentPanelProps {
  fields: Field[];
  assignments: Assignment[];
  isReadOnly: boolean;
  onUpdate?: (fieldKey: string, value: string, sourceSegmentId?: string, metadata?: Partial<AssignPayload>) => Promise<void>;
  onDelete?: (fieldKey: string, metadata?: DeleteAssignmentPayload) => Promise<void>;
  onAccept?: (fieldKey: string) => Promise<void>;
  onLocalValuesChange?: (localValues: Record<string, string>) => void;
  resetLocalField?: ResetLocalField | null;
  readOnlyReason?: string;
  highlightFieldKey?: string | null;
  segments?: Segment[];
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
    return { label: 'Unassigned', color: 'var(--text-muted)' };
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
  onAccept,
  onLocalValuesChange,
  resetLocalField,
  readOnlyReason,
  highlightFieldKey,
  segments = [],
}: FieldAssignmentPanelProps) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [showOnlySuggested, setShowOnlySuggested] = useState(false);

  // Suggestion Action Modal State
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  const [suggestPendingAction, setSuggestPendingAction] = useState<{
    type: 'modify' | 'clear';
    fieldKey: string;
    fieldLabel: string;
    value?: string;
    originalValue?: string;
  } | null>(null);

  const assignmentMap = useMemo(() => {
    const map: Record<string, Assignment> = {};
    assignments.forEach((assignment) => {
      map[assignment.fieldKey] = assignment;
    });
    return map;
  }, [assignments]);

  const suggestedCount = useMemo(() => {
    return fields.filter(f => assignmentMap[f.fieldKey]?.suggestionConfidence !== null && assignmentMap[f.fieldKey]?.suggestionConfidence !== undefined).length;
  }, [fields, assignmentMap]);

  const filteredFields = useMemo(() => {
    if (!showOnlySuggested) return fields;
    return fields.filter(f => assignmentMap[f.fieldKey]?.suggestionConfidence !== null && assignmentMap[f.fieldKey]?.suggestionConfidence !== undefined);
  }, [fields, assignmentMap, showOnlySuggested]);

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

      // If it's a suggestion that hasn't been accepted/modified yet, trigger reason modal on change
      const isInitialSuggestion = existing?.suggestionAccepted === null && existing?.suggestionConfidence !== null;
      if (isInitialSuggestion && existing?.assignedValue !== value) {
        const field = fields.find(f => f.fieldKey === fieldKey);
        setSuggestPendingAction({
          type: 'modify',
          fieldKey,
          fieldLabel: field?.label || fieldKey,
          value,
          originalValue: existing?.assignedValue || '',
        });
        setIsSuggestModalOpen(true);
        return;
      }

      try {
        await onUpdate(fieldKey, value);
      } catch {
        // Handled by parent; keep UI stable for now.
      }
    },
    [assignmentMap, isReadOnly, onUpdate, fields],
  );

  const handleAccept = useCallback(
    async (fieldKey: string) => {
      if (isReadOnly || !onAccept) return;
      await onAccept(fieldKey);
    },
    [isReadOnly, onAccept],
  );

  const handleClearTrigger = useCallback(
    (fieldKey: string) => {
      if (isReadOnly || !onDelete) return;
      const existing = assignmentMap[fieldKey];
      const isSuggestion = existing?.suggestionConfidence !== null;

      if (isSuggestion) {
        const field = fields.find(f => f.fieldKey === fieldKey);
        setSuggestPendingAction({
          type: 'clear',
          fieldKey,
          fieldLabel: field?.label || fieldKey,
          originalValue: existing?.assignedValue || '',
        });
        setIsSuggestModalOpen(true);
      } else {
        onDelete(fieldKey);
      }
    },
    [isReadOnly, onDelete, assignmentMap, fields],
  );

  const handleSuggestModalConfirm = useCallback(
    async (reason: string) => {
      if (!suggestPendingAction) return;
      const { type, fieldKey, value, originalValue } = suggestPendingAction;
      setIsSuggestModalOpen(false);

      try {
        if (type === 'modify') {
          if (onUpdate) {
            await onUpdate(fieldKey, value!, undefined, {
              suggestionAccepted: false,
              correctedFrom: originalValue,
              correctionReason: reason,
            });
          }
        } else if (type === 'clear') {
          if (onDelete) {
            const existing = assignmentMap[fieldKey];
            await onDelete(fieldKey, {
              reason,
              suggestionRejected: true,
              suggestionConfidence: existing?.suggestionConfidence || undefined,
              modelVersionId: existing?.modelVersionId || undefined,
            });
          }
        }
      } catch {
        // Error handled by parent toast
        if (type === 'modify') {
          setLocalValues((prev) => {
            const { [fieldKey]: _, ...rest } = prev;
            return rest;
          });
        }
      } finally {
        setSuggestPendingAction(null);
      }
    },
    [suggestPendingAction, onUpdate, onDelete, assignmentMap],
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
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
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

      {'documentTypeId' in fields && (fields as any).documentTypeId === null && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>ℹ️</span>
          No document type detected. Showing all available fields. Set up document type templates in Admin → Document Types to enable auto-scoping.
        </div>
      )}

      {suggestedCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: 'var(--surface-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            ✨ {suggestedCount} of {fields.length} fields auto-suggested
          </div>
          <button
            onClick={() => setShowOnlySuggested(!showOnlySuggested)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: showOnlySuggested ? '1px solid #E11D48' : '1px solid var(--border)',
              background: showOnlySuggested ? '#E11D48' : 'var(--surface)',
              color: showOnlySuggested ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            {showOnlySuggested ? 'Show All Fields' : 'Show Suggested Only'}
          </button>
        </div>
      )}

      {filteredFields.map((field) => {
        const assignment = assignmentMap[field.fieldKey];
        const hasLocalValue = localValues[field.fieldKey] !== undefined;
        const value = localValues[field.fieldKey] ?? assignment?.normalizedValue ?? assignment?.assignedValue ?? '';
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
              border: isHighlighted ? '2px solid #fb923c' : hasValidationError ? '2px solid #fecaca' : '1px solid var(--border)',
              background: isHighlighted ? 'var(--surface-secondary)' : hasValidationError ? 'var(--surface-secondary)' : 'var(--surface)',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {hasValidationError && <span style={{ fontSize: 16 }}>⚠️</span>}
                <div style={{ fontSize: 13, fontWeight: 700, color: hasValidationError ? '#b91c1c' : 'var(--text-primary)' }}>
                  {field.label}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: 'var(--text-secondary)',
                  borderRadius: 99,
                  padding: '2px 8px',
                  background: 'var(--surface-secondary)',
                }}
              >
                {typeLabels[field.characterType] || field.characterType}
              </span>
            </div>

            <div style={{ position: 'relative', width: '100%' }}>
              <SuggestedFieldInput
                assignment={assignment || ({ fieldKey: field.fieldKey } as Assignment)}
                segments={segments}
                value={value}
                isReadOnly={isReadOnly}
                placeholder={assignment ? '' : (inputAttrs.placeholder ?? 'Unassigned')}
                type={inputAttrs.type}
                inputMode={inputAttrs.inputMode ?? undefined}
                step={inputAttrs.step ?? undefined}
                onChange={(newValue) =>
                  setLocalValues((prev) => ({
                    ...prev,
                    [field.fieldKey]: newValue,
                  }))
                }
                onBlur={(newValue) => handleBlur(field.fieldKey, newValue)}
                onAccept={() => handleAccept(field.fieldKey)}
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
                    background: 'var(--surface-secondary)',
                    borderRadius: 6,
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-secondary)')}
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
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {typeExamples[field.characterType]}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: status.color }}>{status.label}</span>
                {!isReadOnly && value && (
                  <button
                    onClick={() => handleClearTrigger(field.fieldKey)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: 4,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#a3a3a3')}
                  >
                    Clear
                  </button>
                )}
              </div>
              {assignment?.sourceSegmentId && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Linked to text segment</span>
              )}
            </div>

            {validationMessage && (
              <div
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  padding: validation?.valid ? '4px 8px' : '8px 10px',
                  borderRadius: 8,
                  background: 'var(--surface-secondary)',
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
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-secondary)',
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
      <SuggestionActionModal
        isOpen={isSuggestModalOpen}
        onClose={() => {
          if (suggestPendingAction?.type === 'modify' && suggestPendingAction.fieldKey) {
            setLocalValues((prev) => {
              const { [suggestPendingAction!.fieldKey]: _, ...rest } = prev;
              return rest;
            });
          }
          setIsSuggestModalOpen(false);
          setSuggestPendingAction(null);
        }}
        onConfirm={handleSuggestModalConfirm}
        title={suggestPendingAction?.type === 'modify' ? 'Modify Suggestion' : 'Clear Suggestion'}
        message={
          suggestPendingAction?.type === 'modify'
            ? `You are changing the suggested value for "${suggestPendingAction?.fieldLabel}".`
            : `You are clearing the suggested value for "${suggestPendingAction?.fieldLabel}".`
        }
        description={
          suggestPendingAction?.type === 'modify'
            ? `Original: "${suggestPendingAction?.originalValue}"`
            : undefined
        }
        confirmLabel={suggestPendingAction?.type === 'modify' ? 'Update Field' : 'Clear Field'}
      />
    </div>
  );
}
