'use client';

import { useMemo } from 'react';
import type { FieldChangeLogEntry } from '../types';

interface ChangeLogPanelProps {
  entries: FieldChangeLogEntry[];
  collapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
  onHighlightField: (fieldKey: string) => void;
}

export default function ChangeLogPanel({
  entries,
  collapsed,
  onToggleCollapse,
  onHighlightField,
}: ChangeLogPanelProps) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.timestamp - a.timestamp),
    [entries],
  );

  if (collapsed) {
    return (
      <button
        onClick={() => onToggleCollapse(false)}
        title="Open change log"
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: '#ffffff',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        {'>'}
      </button>
    );
  }

  return (
    <div
      style={{
        width: 292,
        height: '100%',
        border: '1px solid var(--border)',
        background: 'var(--surface-secondary)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid #e5e5e5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <strong style={{ fontSize: 12, color: '#262626' }}>Change Log</strong>
        <button
          onClick={() => onToggleCollapse(true)}
          title="Collapse"
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          x
        </button>
      </div>
      <div style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, direction: 'rtl' }}>
        <div style={{ direction: 'ltr', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No changes yet.</div>
          ) : (
            sorted.map(entry => (
              <div key={entry.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{entry.label}</div>
                  {entry.target && (
                    <button
                      onClick={() => {
                        const fieldKey = entry.target!.fieldKey;
                        onHighlightField(fieldKey);
                        const input = document.getElementById(`field-${fieldKey}`);
                        input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      style={{
                        border: '1px solid #dbeafe',
                        background: '#eff6ff',
                        color: '#E11D48',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      Find
                    </button>
                  )}
                </div>
                {entry.detail && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{entry.detail}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {new Date(entry.timestamp).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
