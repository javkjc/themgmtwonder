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

  useEffect(() => {
    if (field) {
      setCorrectedValue(field.currentValue ?? '');
      setCorrectionReason('');
      setTouched(false);
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
          background: 'white',
          padding: 24,
          boxShadow: '0 20px 80px rgba(15,23,42,0.25)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          Edit {field.fieldName.replace(/_/g, ' ')}
        </h2>
        <p style={{ color: '#475569', marginTop: 8, fontSize: 13 }}>
          Confidence{' '}
          {typeof field.confidence === 'number'
            ? `${(field.confidence * 100).toFixed(0)}%`
            : 'Unknown'}
        </p>
        <div style={{ marginTop: 16, fontSize: 13, color: '#0f172a' }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Current value</div>
          <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
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
            }}
            placeholder="Enter the corrected text"
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              padding: 10,
              fontSize: 14,
              resize: 'vertical',
            }}
          />
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
              border: '1px solid #e2e8f0',
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
              border: '1px solid #e2e8f0',
              background: 'white',
              color: '#475569',
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
              background: '#2563eb',
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
