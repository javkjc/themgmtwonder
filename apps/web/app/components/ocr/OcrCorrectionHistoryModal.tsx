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
          background: 'white',
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
        {loading && <p style={{ color: '#0f172a' }}>Loading history...</p>}
        {error && (
          <p style={{ color: '#dc2626', marginBottom: 8 }}>
            {error}
          </p>
        )}
        {!loading && !history?.length && (
          <p style={{ color: '#64748b' }}>No corrections recorded yet.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(history ?? field.correctionHistory)?.map((entry) => (
            <div
              key={entry.id}
              style={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                padding: 12,
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
                <span>By {entry.correctedBy}</span>
                <span>{formatDateTime(entry.createdAt)}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: '#0f172a' }}>
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
                <p style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>Reason: {entry.correctionReason}</p>
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
              border: '1px solid #e2e8f0',
              background: 'white',
              color: '#475569',
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
