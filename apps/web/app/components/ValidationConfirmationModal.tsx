'use client';

interface ValidationConfirmationModalProps {
  isOpen: boolean;
  fieldLabel: string;
  enteredValue: string;
  validationError: string;
  suggestedCorrection?: string;
  onConfirm: () => void;
  onUseSuggestion?: () => void;
  onCancel: () => void;
}

export default function ValidationConfirmationModal({
  isOpen,
  fieldLabel,
  enteredValue,
  validationError,
  suggestedCorrection,
  onConfirm,
  onUseSuggestion,
  onCancel,
}: ValidationConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 28,
          maxWidth: 540,
          width: '90%',
          boxShadow: '0 20px 40px -12px rgba(15, 23, 42, 0.25)',
        }}
      >
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: 20,
            fontWeight: 700,
            color: '#0f172a',
          }}
        >
          Validation Warning
        </h2>

        <p
          style={{
            margin: '0 0 20px',
            fontSize: 14,
            color: '#475569',
            lineHeight: 1.6,
          }}
        >
          The value you entered for <strong>{fieldLabel}</strong> has a validation issue:
        </p>

        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 8 }}>
            <strong>Your value:</strong> {enteredValue}
          </div>
          <div style={{ fontSize: 13, color: '#b91c1c' }}>
            <strong>Issue:</strong> {validationError}
          </div>
        </div>

        {suggestedCorrection && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 13, color: '#166534', marginBottom: 4 }}>
              <strong>Suggested correction:</strong> {suggestedCorrection}
            </div>
          </div>
        )}

        <p
          style={{
            margin: '0 0 20px',
            fontSize: 13,
            color: '#64748b',
            lineHeight: 1.5,
          }}
        >
          You can save the value as-is, use the suggested correction, or cancel and edit it manually.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            Cancel
          </button>

          {suggestedCorrection && onUseSuggestion && (
            <button
              onClick={onUseSuggestion}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                color: '#166534',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Use Suggestion
            </button>
          )}

          <button
            onClick={onConfirm}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#3b82f6',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            Save As-Is
          </button>
        </div>
      </div>
    </div>
  );
}
