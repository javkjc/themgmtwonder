'use client';

import { useState } from 'react';
import { useCategories } from '../hooks/useCategories';

type Props = {
  selectedCount: number;
  onMarkDone: () => void;
  onMarkNotDone: () => void;
  onChangeCategory: (category: string | null) => void;
  onDelete: () => void;
  onClearSelection: () => void;
  userId: string | null;
};

export default function BulkActionsBar({
  selectedCount,
  onMarkDone,
  onMarkNotDone,
  onChangeCategory,
  onDelete,
  onClearSelection,
  userId
}: Props) {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const { getCategoryNames } = useCategories(userId);

  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#141414',
      color: 'white',
      padding: '12px 20px',
      borderRadius: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{selectedCount}</span>
        <span style={{ opacity: 0.8, fontSize: 14 }}>selected</span>
      </div>

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onMarkDone}
          style={{
            padding: '8px 12px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Done
        </button>

        <button
          onClick={onMarkNotDone}
          style={{
            padding: '8px 12px',
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Not Done
        </button>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowCategoryMenu(!showCategoryMenu)}
            style={{
              padding: '8px 12px',
              background: '#F43F5E',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Category
          </button>

          {showCategoryMenu && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 8,
              background: 'var(--surface)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: 150,
              overflow: 'hidden',
            }}>
              {getCategoryNames().map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    onChangeCategory(cat);
                    setShowCategoryMenu(false);
                  }}

                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: 'var(--surface)',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f5f5f5',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = '#fafafa'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'white'; }}
                >
                  {cat}
                </button>
              ))}
              <button
                onClick={() => {
                  onChangeCategory(null);
                  setShowCategoryMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'var(--surface)',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#fafafa'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'white'; }}
              >
                No Category
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onDelete}
          style={{
            padding: '8px 12px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />

      <button
        onClick={onClearSelection}
        style={{
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.1)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}
