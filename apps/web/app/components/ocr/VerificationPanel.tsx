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

  const allFields = useMemo(
    () => [...fieldsWithBox, ...fieldsWithoutBox],
    [fieldsWithBox, fieldsWithoutBox],
  );

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
    }
    onJumpHandled();
  }, [jumpToFieldKey, onJumpHandled]);

  const renderCard = (field: VerificationField) => {
    const tier = field.tier;
    const tierStyle = tier ? tierStyles[tier] : null;
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
        onMouseEnter={() => onHoverField(field)}
        onMouseLeave={() => onHoverField(null)}
        style={{
          border: isActive ? '1px solid #3b82f6' : '1px solid var(--border)',
          borderRadius: 8,
          background: '#ffffff',
          padding: 12,
          marginBottom: 10,
          boxShadow: isPulse ? '0 0 0 2px rgba(59,130,246,0.25)' : 'none',
          transition: 'box-shadow 0.2s ease',
          borderBottom: `3px solid ${tierStyle?.border ?? '#d1d5db'}`,
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
            disabled={!canMutateFields}
            onClick={() => onAccept(field.fieldKey)}
            style={{
              padding: '6px 8px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid #86efac',
              background: '#dcfce7',
              color: '#166534',
              cursor: canMutateFields ? 'pointer' : 'not-allowed',
            }}
          >
            Accept
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
          <span>Flag: {tierCounts.flag}</span>
          <span>Verify: {tierCounts.verify}</span>
          <span>Auto: {tierCounts.auto_confirm}</span>
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
    </div>
  );
}
