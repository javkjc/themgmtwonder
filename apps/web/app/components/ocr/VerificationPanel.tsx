'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type Tier = 'auto_confirm' | 'verify' | 'flag';

type SimilarContextEntry = {
  value: string;
  confirmedAt: string;
  similarity: number;
};

export type VerificationField = {
  fieldKey: string;
  suggestedValue: string | null;
  confidenceScore: number | null;
  tier: Tier | null;
  zone: string | null;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  pageNumber: number;
  extractionMethod: string | null;
  suggestionAccepted: boolean | null;
};

type VerificationPanelProps = {
  fieldsWithBox: VerificationField[];
  fieldsWithoutBox: VerificationField[];
  similarContext: Record<string, SimilarContextEntry[]>;
  tierCounts: { flag: number; verify: number; auto_confirm: number };
  fieldLabelMap: Record<string, string>;
  canMutateFields: boolean;
  bulkConfirming: boolean;
  autoConfirmPendingCount: number;
  activeFieldKey: string | null;
  pulseFieldKey: string | null;
  jumpToFieldKey: string | null;
  actionsSlot?: ReactNode;
  onBulkConfirm: () => void;
  onAccept: (fieldKey: string) => void;
  onSave: (fieldKey: string, value: string) => void;
  onClear: (fieldKey: string) => void;
  onHoverField: (field: VerificationField | null) => void;
  onJumpHandled: () => void;
};

const tierStyles: Record<Tier, { border: string; icon: string; iconColor: string }> = {
  auto_confirm: { border: '#16a34a', icon: 'A', iconColor: '#166534' },
  verify: { border: '#d97706', icon: 'V', iconColor: '#92400e' },
  flag: { border: '#dc2626', icon: 'F', iconColor: '#991b1b' },
};

const acceptedStyle = { border: '#16a34a', icon: '✓', iconColor: '#166534' };

export default function VerificationPanel({
  fieldsWithBox,
  fieldsWithoutBox,
  similarContext,
  tierCounts,
  fieldLabelMap,
  canMutateFields,
  bulkConfirming,
  autoConfirmPendingCount,
  activeFieldKey,
  pulseFieldKey,
  jumpToFieldKey,
  actionsSlot,
  onBulkConfirm,
  onAccept,
  onSave,
  onClear,
  onHoverField,
  onJumpHandled,
}: VerificationPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [focusedFieldKey, setFocusedFieldKey] = useState<string | null>(null);

  const allFields = useMemo(
    () => [...fieldsWithBox, ...fieldsWithoutBox],
    [fieldsWithBox, fieldsWithoutBox],
  );

  const visibleTierCounts = useMemo(() => {
    const counts = { flag: 0, verify: 0, auto_confirm: 0 };
    for (const field of allFields) {
      if (field.suggestionAccepted) continue;
      if (field.tier === 'flag') counts.flag += 1;
      if (field.tier === 'verify') counts.verify += 1;
      if (field.tier === 'auto_confirm') counts.auto_confirm += 1;
    }
    return counts;
  }, [allFields]);

  useEffect(() => {
    const nextValues: Record<string, string> = {};
    for (const field of allFields) {
      nextValues[field.fieldKey] = field.suggestedValue ?? '';
    }
    setDraftValues(nextValues);
  }, [allFields]);

  useEffect(() => {
    if (!jumpToFieldKey) return;
    const target = fieldRefs.current[jumpToFieldKey];
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.focus({ preventScroll: true });
      setFocusedFieldKey(jumpToFieldKey);
      const jumpedField = allFields.find((field) => field.fieldKey === jumpToFieldKey) ?? null;
      onHoverField(jumpedField);
    }
    onJumpHandled();
  }, [allFields, jumpToFieldKey, onHoverField, onJumpHandled]);

  const focusFieldAt = (index: number) => {
    if (index < 0 || index >= allFields.length) return false;
    const field = allFields[index];
    const target = fieldRefs.current[field.fieldKey];
    if (!target) return false;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.focus({ preventScroll: true });
    setFocusedFieldKey(field.fieldKey);
    onHoverField(field);
    return true;
  };

  const focusNextField = (step: 1 | -1) => {
    if (allFields.length === 0) return false;
    if (!focusedFieldKey) {
      return focusFieldAt(step > 0 ? 0 : allFields.length - 1);
    }
    const currentIndex = allFields.findIndex((field) => field.fieldKey === focusedFieldKey);
    if (currentIndex === -1) {
      return focusFieldAt(step > 0 ? 0 : allFields.length - 1);
    }
    return focusFieldAt(currentIndex + step);
  };

  const focusNextFlagField = () => {
    const flagIndexes = allFields
      .map((field, index) => ({ field, index }))
      .filter((item) => item.field.tier === 'flag');
    if (flagIndexes.length === 0) return false;

    if (!focusedFieldKey) {
      return focusFieldAt(flagIndexes[0].index);
    }

    const currentIndex = allFields.findIndex((field) => field.fieldKey === focusedFieldKey);
    const nextFlag = flagIndexes.find((item) => item.index > currentIndex) ?? flagIndexes[0];
    return focusFieldAt(nextFlag.index);
  };

  const handleKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      const moved = focusNextField(event.shiftKey ? -1 : 1);
      if (moved) {
        event.preventDefault();
      }
      return;
    }

    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (canMutateFields && autoConfirmPendingCount > 0 && !bulkConfirming) {
        onBulkConfirm();
      }
      return;
    }

    if (!focusedFieldKey) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      if (canMutateFields) {
        onAccept(focusedFieldKey);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      focusNextField(1);
      return;
    }

    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      focusNextFlagField();
    }
  };

  const renderCard = (field: VerificationField) => {
    const tier = field.tier;
    const tierStyle = field.suggestionAccepted
      ? acceptedStyle
      : tier
        ? tierStyles[tier]
        : null;
    const isAccepted = field.suggestionAccepted === true;
    const isActive = activeFieldKey === field.fieldKey;
    const isPulse = pulseFieldKey === field.fieldKey;
    const label = fieldLabelMap[field.fieldKey] || field.fieldKey;
    const confidenceText =
      field.confidenceScore === null
        ? 'n/a'
        : `${Math.round(field.confidenceScore * 100)}%`;
    const contextRows = similarContext[field.fieldKey] ?? [];

    return (
      <div
        key={field.fieldKey}
        ref={(node) => {
          fieldRefs.current[field.fieldKey] = node;
        }}
        tabIndex={0}
        onFocus={() => {
          setFocusedFieldKey(field.fieldKey);
          onHoverField(field);
        }}
        onMouseEnter={() => onHoverField(field)}
        onMouseLeave={() => onHoverField(null)}
        style={{
          borderStyle: 'solid',
          borderTopWidth: 1,
          borderRightWidth: 1,
          borderBottomWidth: 3,
          borderLeftWidth: 1,
          borderTopColor: isActive ? '#3b82f6' : 'var(--border)',
          borderRightColor: isActive ? '#3b82f6' : 'var(--border)',
          borderLeftColor: isActive ? '#3b82f6' : 'var(--border)',
          borderBottomColor: tierStyle?.border ?? '#d1d5db',
          borderRadius: 8,
          background: '#ffffff',
          padding: 12,
          marginBottom: 10,
          boxShadow: isPulse ? '0 0 0 2px rgba(59,130,246,0.25)' : 'none',
          transition: 'box-shadow 0.2s ease',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            color: tierStyle?.iconColor ?? '#6b7280',
            border: `1px solid ${tierStyle?.border ?? '#cbd5e1'}`,
          }}
        >
          {tierStyle?.icon ?? '?'}
        </span>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
          {field.fieldKey}  |  p.{field.pageNumber}  |  conf {confidenceText}
        </div>
        <input
          type="text"
          value={draftValues[field.fieldKey] ?? ''}
          onChange={(event) =>
            setDraftValues((prev) => ({ ...prev, [field.fieldKey]: event.target.value }))
          }
          style={{
            width: '100%',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            padding: '8px 10px',
            marginBottom: 8,
            fontSize: 13,
          }}
          readOnly={!canMutateFields}
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: contextRows.length ? 8 : 0 }}>
          <button
            type="button"
            disabled={!canMutateFields}
            onClick={() => onSave(field.fieldKey, draftValues[field.fieldKey] ?? '')}
            style={{
              padding: '6px 8px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: '#ffffff',
              cursor: canMutateFields ? 'pointer' : 'not-allowed',
            }}
          >
            Save
          </button>
          <button
            type="button"
            disabled={!canMutateFields}
            onClick={() => onClear(field.fieldKey)}
            style={{
              padding: '6px 8px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #fca5a5',
              background: '#fef2f2',
              color: '#991b1b',
              cursor: canMutateFields ? 'pointer' : 'not-allowed',
            }}
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!canMutateFields || isAccepted}
            onClick={() => onAccept(field.fieldKey)}
            style={{
              padding: '6px 8px',
              fontSize: 11,
              borderRadius: 6,
              border: isAccepted ? '1px solid #86efac' : '1px solid #86efac',
              background: isAccepted ? '#ecfdf3' : '#dcfce7',
              color: '#166534',
              cursor: canMutateFields && !isAccepted ? 'pointer' : 'not-allowed',
              opacity: isAccepted ? 0.8 : 1,
            }}
          >
            {isAccepted ? 'Accepted' : 'Accept'}
          </button>
        </div>
        {contextRows.length > 0 && (
          <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 6 }}>
            {contextRows.map((item, index) => (
              <div key={`${field.fieldKey}-${index}`} style={{ fontSize: 11, color: '#6b7280' }}>
                {item.value} ({Math.round(item.similarity * 100)}%, {item.confirmedAt})
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onKeyDownCapture={handleKeyboard}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: '#f8fafc',
      }}
    >
      <div
        style={{
          borderBottom: '1px solid #e5e7eb',
          padding: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#374151', fontWeight: 700 }}>
          <span>Flag: {visibleTierCounts.flag}</span>
          <span>Verify: {visibleTierCounts.verify}</span>
          <span>Auto: {visibleTierCounts.auto_confirm}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actionsSlot}
          <button
            type="button"
            onClick={onBulkConfirm}
            disabled={!canMutateFields || autoConfirmPendingCount === 0 || bulkConfirming}
            style={{
              padding: '7px 10px',
              borderRadius: 6,
              border: '1px solid #16a34a',
              background: '#dcfce7',
              color: '#166534',
              fontSize: 11,
              fontWeight: 700,
              cursor:
                !canMutateFields || autoConfirmPendingCount === 0 || bulkConfirming
                  ? 'not-allowed'
                  : 'pointer',
              opacity:
                !canMutateFields || autoConfirmPendingCount === 0 || bulkConfirming
                  ? 0.6
                  : 1,
            }}
          >
            {bulkConfirming
              ? 'Confirming...'
              : 'Confirm All High-Confidence'}
          </button>
        </div>
      </div>

      <div ref={containerRef} style={{ overflowY: 'auto', padding: 12, minHeight: 0 }}>
        {fieldsWithBox.map(renderCard)}
        {fieldsWithoutBox.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div
              style={{
                borderTop: '1px dashed #cbd5e1',
                marginBottom: 8,
                paddingTop: 8,
                fontSize: 11,
                color: '#64748b',
                fontWeight: 700,
              }}
            >
              No Spatial Coordinates
            </div>
            {fieldsWithoutBox.map(renderCard)}
          </div>
        )}
      </div>
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          padding: '8px 12px',
          fontSize: 11,
          color: '#4b5563',
          background: '#f1f5f9',
        }}
      >
        Tab next · Enter accept · Esc skip · F next flag · Shift+Enter confirm all
      </div>
    </div>
  );
}
