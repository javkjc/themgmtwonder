'use client';

import type { OcrField } from '../../lib/api/ocr';

type OcrFieldListProps = {
  fields: OcrField[];
  onEdit: (field: OcrField) => void;
  onViewHistory: (field: OcrField) => void;
  onSelect?: (field: OcrField) => void;
  onDelete?: (field: OcrField) => void;
  selectedFieldId?: string | null;
  isReadOnly?: boolean;
  readOnlyReason?: string;
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

const formatFieldType = (type: string | null | undefined) => {
  if (!type) {
    return '';
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export default function OcrFieldList({
  fields,
  onEdit,
  onViewHistory,
  onSelect,
  onDelete,
  selectedFieldId,
  isReadOnly,
  readOnlyReason,
}: OcrFieldListProps) {

  const readOnlyTitle = readOnlyReason ?? 'Read-only (data in use)';
  const isReadOnlyMode = Boolean(isReadOnly);

  const sortedFields = [...fields].sort((a, b) => a.fieldName.localeCompare(b.fieldName));

  if (sortedFields.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          borderRadius: 12,
          border: '1px dashed #cbd5f5',
          textAlign: 'center',
          color: 'var(--text-muted)',
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
              border: `1px solid ${isSelected ? '#E11D48' : '#e5e5e5'}`,
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
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{humanReadableName(field.fieldName)}</div>

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
                  background: field.confidence === 1 && !field.originalValue ? '#f0f9ff' : '#fafafa',
                  color: field.confidence === 1 && !field.originalValue ? '#0369a1' : '#737373',
                  border: `1px solid ${field.confidence === 1 && !field.originalValue ? '#bae6fd' : '#e5e5e5'}`,
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

                {field.fieldType && field.confidence === 1 && !field.originalValue && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                    Type: {formatFieldType(field.fieldType)}
                  </div>
                )}

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Confidence:{' '}
                  {conf ? (
                    <span style={{ color: conf.color, fontWeight: 600 }}>
                      {percent}% ({conf.label})
                    </span>
                  ) : (
                    <span style={{ color: '#d4d4d4', fontWeight: 600 }}>—</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isReadOnlyMode ? (
                  <span
                    title={readOnlyTitle}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: '#f5f5f5',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 700,
                      border: '1px solid var(--border)',
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
                        border: '1px solid #E11D48',
                        background: 'var(--surface)',
                        color: '#E11D48',
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
                          background: 'var(--surface)',
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
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-secondary)',
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
                background: field.isCorrected ? '#eff6ff' : '#fafafa',
                border: `1px solid ${field.isCorrected ? '#bfdbfe' : '#e5e5e5'}`,
                position: 'relative'
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: field.isCorrected ? '#E11D48' : '#737373',
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
                      color: '#BE123C',
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
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                  lineHeight: 1.5
                }}>
                  {displayValue || <span style={{ color: '#d4d4d4', fontWeight: 400 }}>— No value available</span>}
                </div>
              </div>

              {/* Original Value (Muted, Strikethrough if corrected) */}
              <div style={{ padding: '0 4px' }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 4
                }}>
                  Original Extraction
                </div>
                <div style={{
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  textDecoration: field.isCorrected ? 'line-through' : 'none',
                  opacity: field.isCorrected ? 0.6 : 1,
                  wordBreak: 'break-word',
                  fontStyle: 'italic',
                  lineHeight: 1.4
                }}>
                  {field.originalValue?.trim() || <span style={{ color: '#d4d4d4' }}>— No original data</span>}
                </div>
              </div>

              {field.isCorrected && field.latestCorrectionAt && (
                <div style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: 'var(--text-muted)',
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
