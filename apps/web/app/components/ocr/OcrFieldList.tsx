'use client';

import type { OcrField } from '../../lib/api/ocr';

type OcrFieldListProps = {
  fields: OcrField[];
  onEdit: (field: OcrField) => void;
  onViewHistory: (field: OcrField) => void;
  onSelect?: (field: OcrField) => void;
  onDelete?: (field: OcrField) => void;
  selectedFieldId?: string | null;
  utilizationType?: string | null;
};

const getReadOnlyTooltip = (type: string | null | undefined) => {
  if (!type) return '';
  if (type === 'authoritative_record') return 'Authoritative record created';
  if (type === 'data_export') return 'Data exported';
  if (type === 'workflow_approval') return 'Workflow approved';
  return 'Data in use';
};


const confidenceLevel = (confidence: number) => {
  if (confidence >= 0.8) return { label: 'High', color: '#16a34a' };
  if (confidence >= 0.6) return { label: 'Medium', color: '#ca8a04' };
  return { label: 'Low', color: '#dc2626' };
};

const humanReadableName = (name: string) => {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function OcrFieldList({
  fields,
  onEdit,
  onViewHistory,
  onSelect,
  onDelete,
  selectedFieldId,
  utilizationType,
}: OcrFieldListProps) {

  const isReadOnly = !!utilizationType;

  const sortedFields = [...fields].sort((a, b) => a.fieldName.localeCompare(b.fieldName));

  if (sortedFields.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          borderRadius: 12,
          border: '1px dashed #cbd5f5',
          textAlign: 'center',
          color: '#94a3b8',
        }}
      >
        No fields extracted.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sortedFields.map((field) => {
        const hasConfidence = field.confidence !== null && field.confidence !== undefined;
        const normalizedConfidence = hasConfidence ? Math.min(Math.max(field.confidence!, 0), 1) : 0;
        const conf = hasConfidence ? confidenceLevel(normalizedConfidence) : null;
        const percent = hasConfidence ? Math.round(normalizedConfidence * 100) : null;
        // Priority: currentValue > originalValue > fallback
        const displayValue = field.currentValue?.trim() || field.originalValue?.trim() || '';
        const isSelected = selectedFieldId === field.id;

        return (
          <div
            key={field.id}
            onMouseEnter={() => onSelect?.(field)}
            style={{
              borderRadius: 12,
              border: `1px solid ${isSelected ? '#2563eb' : '#e2e8f0'}`,
              padding: 20, // Increased padding for better hierarchy
              background: isSelected ? '#f0f9ff' : '#ffffff',
              cursor: onSelect ? 'pointer' : 'default',
              boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.2s ease',
            }}
            onClick={() => onSelect?.(field)}
          >
            {/* Header: Field Name and Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{humanReadableName(field.fieldName)}</div>

                {/* Provenance Badge */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.025em',
                  background: field.confidence === 1 && !field.originalValue ? '#f0f9ff' : '#f8fafc',
                  color: field.confidence === 1 && !field.originalValue ? '#0369a1' : '#64748b',
                  border: `1px solid ${field.confidence === 1 && !field.originalValue ? '#bae6fd' : '#e2e8f0'}`,
                  textTransform: 'uppercase'
                }}>
                  {field.confidence === 1 && !field.originalValue ? (
                    <>
                      <span style={{ fontSize: 12 }}>✍️</span> Manually Added
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 12 }}>🤖</span> Extracted via: OCR
                    </>
                  )}
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                  Confidence:{' '}
                  {conf ? (
                    <span style={{ color: conf.color, fontWeight: 600 }}>
                      {percent}% ({conf.label})
                    </span>
                  ) : (
                    <span style={{ color: '#cbd5e1', fontWeight: 600 }}>—</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isReadOnly ? (
                  <span
                    title={getReadOnlyTooltip(utilizationType)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: '#f1f5f9',
                      color: '#64748b',
                      fontSize: 11,
                      fontWeight: 700,
                      border: '1px solid #e2e8f0',
                      cursor: 'help',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span style={{ fontSize: 13 }}>🔒</span> Read-only (data in use)
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(field);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid #2563eb',
                        background: 'white',
                        color: '#2563eb',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      Edit
                    </button>
                    {field.confidence === 1 && !field.originalValue && onDelete && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(field);
                        }}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: '1px solid #ef4444',
                          background: 'white',
                          color: '#ef4444',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}

                {field.isCorrected && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewHistory(field);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: '#475569',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    History
                  </button>
                )}
              </div>
            </div>

            {/* Values Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Current Value (Prominent) */}
              <div style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: field.isCorrected ? '#eff6ff' : '#f8fafc',
                border: `1px solid ${field.isCorrected ? '#bfdbfe' : '#e2e8f0'}`,
                position: 'relative'
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: field.isCorrected ? '#2563eb' : '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>Current Value</span>
                  {field.isCorrected && (
                    <span style={{
                      background: '#dbeafe',
                      color: '#1d4ed8',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 9
                    }}>
                      CORRECTED
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#0f172a',
                  wordBreak: 'break-word',
                  lineHeight: 1.5
                }}>
                  {displayValue || <span style={{ color: '#cbd5e1', fontWeight: 400 }}>— No value available</span>}
                </div>
              </div>

              {/* Original Value (Muted, Strikethrough if corrected) */}
              <div style={{ padding: '0 4px' }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 4
                }}>
                  Original Extraction
                </div>
                <div style={{
                  fontSize: 14,
                  color: '#64748b',
                  textDecoration: field.isCorrected ? 'line-through' : 'none',
                  opacity: field.isCorrected ? 0.6 : 1,
                  wordBreak: 'break-word',
                  fontStyle: 'italic',
                  lineHeight: 1.4
                }}>
                  {field.originalValue?.trim() || <span style={{ color: '#cbd5e1' }}>— No original data</span>}
                </div>
              </div>

              {field.isCorrected && field.latestCorrectionAt && (
                <div style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <span style={{ fontSize: 14 }}>🕒</span>
                  Last corrected: {new Date(field.latestCorrectionAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
