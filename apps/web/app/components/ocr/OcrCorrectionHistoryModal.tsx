'use client';

import { formatDateTime } from '../../lib/dateTime';
import type { OcrCorrectionHistoryItem, OcrField } from '../../lib/api/ocr';

type OcrCorrectionHistoryModalProps = {
  field: OcrField | null;
  isOpen: boolean;
  loading: boolean;
  history: OcrCorrectionHistoryItem[] | null;
  error?: string | null;
  onClose: () => void;
};

export default function OcrCorrectionHistoryModal({
  field,
  isOpen,
  loading,
  history,
  error,
  onClose,
}: OcrCorrectionHistoryModalProps) {
  if (!field || !isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 16,
          background: 'var(--surface)',
          padding: 24,
          boxShadow: '0 20px 80px rgba(15,23,42,0.25)',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            History for {field.fieldName.replace(/_/g, ' ')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
        {loading && <p style={{ color: 'var(--text-primary)' }}>Loading history...</p>}
        {error && (
          <p style={{ color: '#dc2626', marginBottom: 8 }}>
            {error}
          </p>
        )}
        {!loading && !history?.length && (
          <p style={{ color: 'var(--text-muted)' }}>No corrections recorded yet.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(history ?? field.correctionHistory)?.map((entry) => (
            <div
              key={entry.id}
              style={{
                borderRadius: 12,
                border: '1px solid var(--border)',
                padding: 12,
                background: 'var(--surface-secondary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                <span>By {entry.correctedBy}</span>
                <span>{formatDateTime(entry.createdAt)}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-primary)' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>From:</span>{' '}
                  <span style={{ color: '#dc2626' }}>{entry.originalValue || 'Empty'}</span>
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>To:</span>{' '}
                  <span style={{ color: '#15803d' }}>{entry.correctedValue}</span>
                </div>
              </div>
              {entry.correctionReason && (
                <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>Reason: {entry.correctionReason}</p>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
