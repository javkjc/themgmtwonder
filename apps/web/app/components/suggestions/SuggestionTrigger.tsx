'use client';

import { useEffect, useState } from 'react';

type SuggestionTriggerStatus = 'idle' | 'loading' | 'success' | 'error';

type SuggestionTriggerProps = {
  disabled?: boolean;
  onGenerate: () => Promise<number>;
};

const TOOLTIP_STORAGE_KEY = 'suggestions_tooltip_shown';

export default function SuggestionTrigger({ disabled, onGenerate }: SuggestionTriggerProps) {
  const [status, setStatus] = useState<SuggestionTriggerStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(TOOLTIP_STORAGE_KEY);
    if (!seen) {
      setShowTooltip(true);
    }
  }, []);

  const dismissTooltip = () => {
    try {
      window.localStorage.setItem(TOOLTIP_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage failures
    }
    setShowTooltip(false);
  };

  const handleGenerate = async () => {
    if (disabled || status === 'loading') return;
    setStatus('loading');
    setMessage(null);
    try {
      const count = await onGenerate();
      setStatus('success');
      setMessage(count === 1 ? '1 suggestion generated.' : `${count} suggestions generated.`);
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
      setMessage('Suggestions unavailable. Continue with manual assignment.');
    }
  };

  const label =
    status === 'loading'
      ? 'Generating...'
      : status === 'success'
        ? 'Suggestions Ready'
        : status === 'error'
          ? 'Retry Suggestions'
          : 'Get Suggestions';

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        onClick={handleGenerate}
        disabled={disabled || status === 'loading'}
        style={{
          padding: '6px 12px',
          borderRadius: 10,
          border: '1px solid #c7d2fe',
          background: disabled ? '#e2e8f0' : '#eef2ff',
          color: disabled ? '#94a3b8' : '#3730a3',
          fontSize: 12,
          fontWeight: 700,
          cursor: disabled || status === 'loading' ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
        title={disabled ? 'Suggestions disabled' : 'Generate ML suggestions'}
      >
        {label}
      </button>

      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            right: 0,
            width: 220,
            padding: '10px 12px',
            borderRadius: 10,
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: 12,
            boxShadow: '0 12px 24px rgba(15, 23, 42, 0.25)',
            zIndex: 40,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>New: ML suggestions</div>
          <div style={{ lineHeight: 1.4 }}>
            Click “Get Suggestions” to generate field matches. You can still edit everything manually.
          </div>
          <button
            onClick={dismissTooltip}
            style={{
              marginTop: 8,
              border: 'none',
              background: '#e2e8f0',
              color: '#0f172a',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Got it
          </button>
        </div>
      )}

      {message && (
        <div
          style={{
            fontSize: 11,
            color: status === 'error' ? '#b91c1c' : '#475569',
            maxWidth: 240,
            textAlign: 'right',
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
