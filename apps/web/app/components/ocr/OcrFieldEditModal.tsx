'use client';

import { useEffect, useState } from 'react';
import type { OcrField } from '../../lib/api/ocr';

type OcrFieldEditModalProps = {
  field: OcrField | null;
  isOpen: boolean;
  isSaving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (payload: { correctedValue: string; correctionReason?: string }) => Promise<void>;
};

export default function OcrFieldEditModal({
  field,
  isOpen,
  isSaving,
  error,
  onClose,
  onSave,
}: OcrFieldEditModalProps) {
  const [correctedValue, setCorrectedValue] = useState(field?.currentValue ?? '');
  const [correctionReason, setCorrectionReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [previewValue, setPreviewValue] = useState<string | null>(null);

  useEffect(() => {
    if (field) {
      setCorrectedValue(field.currentValue ?? '');
      setCorrectionReason('');
      setTouched(false);
      setPreviewValue(null);
    }
  }, [field]);

  if (!field) {
    return null;
  }

  const handleSubmit = async () => {
    if (!correctedValue.trim() || !correctionReason.trim()) {
      setTouched(true);
      return;
    }
    await onSave({
      correctedValue: correctedValue.trim(),
      correctionReason: correctionReason.trim(),
    });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 540,
          borderRadius: 16,
          background: 'var(--surface)',
          padding: 24,
          boxShadow: '0 20px 80px rgba(15,23,42,0.25)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          Edit {field.fieldName.replace(/_/g, ' ')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 13 }}>
          Confidence{' '}
          {typeof field.confidence === 'number'
            ? `${(field.confidence * 100).toFixed(0)}%`
            : 'Unknown'}
        </p>
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-primary)' }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Current value</div>
          <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
            {field.currentValue || 'None'}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Corrected value <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            rows={3}
            value={correctedValue}
            onChange={(event) => {
              setCorrectedValue(event.target.value);
              setTouched(true);
              setPreviewValue(null);
            }}
            placeholder="Enter the corrected text"
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid var(--border)',
              padding: 10,
              fontSize: 14,
              resize: 'vertical',
              marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: previewValue ? 8 : 0 }}>
            <button
              type="button"
              onClick={() => setPreviewValue(correctedValue.trim())}
              disabled={isSaving || !correctedValue}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface-secondary)',
                color: 'var(--text-muted)',
                fontWeight: 600,
                cursor: isSaving || !correctedValue ? 'not-allowed' : 'pointer',
              }}
            >
              Trim
            </button>
            <button
              type="button"
              onClick={() => setPreviewValue(correctedValue.replace(/[^\d.-]/g, ''))}
              disabled={isSaving || !correctedValue}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface-secondary)',
                color: 'var(--text-muted)',
                fontWeight: 600,
                cursor: isSaving || !correctedValue ? 'not-allowed' : 'pointer',
              }}
            >
              Normalize Currency
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(correctedValue);
                if (!isNaN(d.getTime())) {
                  setPreviewValue(d.toISOString().split('T')[0]);
                } else {
                  setPreviewValue('Invalid Date');
                }
              }}
              disabled={isSaving || !correctedValue}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface-secondary)',
                color: 'var(--text-muted)',
                fontWeight: 600,
                cursor: isSaving || !correctedValue ? 'not-allowed' : 'pointer',
              }}
            >
              Parse Date
            </button>
          </div>
          {previewValue !== null && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 12, color: '#0369a1' }}>
                <span style={{ fontWeight: 700, marginRight: 6 }}>Preview:</span>
                <code style={{ background: '#e0f2fe', padding: '2px 4px', borderRadius: 4 }}>{previewValue}</code>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setPreviewValue(null)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (previewValue !== 'Invalid Date') {
                      setCorrectedValue(previewValue);
                      setPreviewValue(null);
                    }
                  }}
                  disabled={previewValue === 'Invalid Date'}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: previewValue === 'Invalid Date' ? '#a3a3a3' : '#0284c7',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: previewValue === 'Invalid Date' ? 'not-allowed' : 'pointer',
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
          {touched && !correctedValue.trim() && (
            <p style={{ color: '#dc2626', margin: '6px 0 0', fontSize: 12 }}>Corrected value is required.</p>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Reason for correction <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            rows={2}
            value={correctionReason}
            onChange={(event) => {
              setCorrectionReason(event.target.value);
              setTouched(true);
            }}
            placeholder="Why was this field corrected?"
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid var(--border)',
              padding: 10,
              fontSize: 14,
              resize: 'vertical',
            }}
          />
          {touched && !correctionReason.trim() && (
            <p style={{ color: '#dc2626', margin: '6px 0 0', fontSize: 12 }}>Reason for correction is required.</p>
          )}
        </div>
        {error && (
          <div style={{ marginTop: 16, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || !correctedValue.trim() || !correctionReason.trim()}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#E11D48',
              color: 'white',
              fontWeight: 600,
              cursor: isSaving || !correctedValue.trim() || !correctionReason.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isSaving ? 'Saving...' : 'Save Correction'}
          </button>
        </div>
      </div>
    </div>
  );
}
