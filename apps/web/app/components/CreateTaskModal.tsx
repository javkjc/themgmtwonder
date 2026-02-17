'use client';

import { useEffect, useState } from 'react';
import { useCategories } from '../hooks/useCategories';
import { useDurationSettings } from '../hooks/useDurationSettings';
import { useEligibleParents } from '../hooks/useEligibleParents';
import { DURATION_PRESETS } from '../lib/constants';

type CreateTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, category?: string, durationMin?: number, description?: string, parentId?: string) => Promise<boolean>;
  userId: string | null;
};

export default function CreateTaskModal({ isOpen, onClose, onCreate, userId }: CreateTaskModalProps) {
  const { minDurationMin, maxDurationMin, defaultDurationMin } = useDurationSettings();
  const { getCategoryNames } = useCategories(userId);
  const categoryNames = getCategoryNames();
  const { eligibleParents } = useEligibleParents(userId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [parentId, setParentId] = useState('');
  const [durationMinInput, setDurationMinInput] = useState(String(defaultDurationMin));
  const [durationFeedback, setDurationFeedback] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setCategory('');
      setParentId('');
      setDurationMinInput(String(defaultDurationMin));
      setDurationFeedback('');
      setError('');
    }
  }, [isOpen, defaultDurationMin]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCreate = async () => {
    setError('');

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }

    const parsedDuration = parseInt(durationMinInput, 10);
    if (isNaN(parsedDuration) || durationMinInput.trim() === '') {
      setDurationFeedback(`Invalid duration. Reset to default (${defaultDurationMin} minutes).`);
      setDurationMinInput(String(defaultDurationMin));
      return;
    }

    const clampedDuration = Math.max(minDurationMin, Math.min(maxDurationMin, parsedDuration));
    if (clampedDuration !== parsedDuration) {
      setDurationFeedback(`Duration must be between ${minDurationMin} and ${maxDurationMin} minutes. Adjusted to ${clampedDuration}.`);
      setDurationMinInput(String(clampedDuration));
      return;
    }

    setSaving(true);
    const success = await onCreate(trimmedTitle, category || undefined, clampedDuration, description.trim() || undefined, parentId || undefined);
    setSaving(false);

    if (success) {
      setTitle('');
      setDescription('');
      setCategory('');
      setParentId('');
      setDurationMinInput(String(defaultDurationMin));
      setDurationFeedback('');
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 6,
          padding: 24,
          width: '100%',
          maxWidth: 520,
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>Create Task</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Title required. Description optional.</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>
              Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
              data-testid="task-title-input"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: error ? '1px solid #ef4444' : '1px solid #e5e5e5',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Add description (optional)"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 13,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{
              marginTop: 4,
              fontSize: 11,
              color: description.length > 450 ? '#f59e0b' : '#a3a3a3',
              textAlign: 'right',
            }}>
              {description.length}/500 characters
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>Duration (minutes)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                value={durationMinInput}
                onChange={(e) => {
                  setDurationMinInput(e.target.value);
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= minDurationMin && val <= maxDurationMin) {
                    setDurationFeedback('');
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && e.target.value.trim() !== '') {
                    const clamped = Math.max(minDurationMin, Math.min(maxDurationMin, val));
                    if (clamped !== val) {
                      setDurationFeedback(`Duration must be between ${minDurationMin} and ${maxDurationMin} minutes. Adjusted to ${clamped}.`);
                      setDurationMinInput(String(clamped));
                    } else {
                      setDurationFeedback('');
                    }
                  } else if (e.target.value.trim() === '') {
                    setDurationFeedback(`Invalid duration. Reset to default (${defaultDurationMin} minutes).`);
                    setDurationMinInput(String(defaultDurationMin));
                  }
                }}
                min={minDurationMin}
                max={maxDurationMin}
                style={{
                  width: 90,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontSize: 14,
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>min</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      const clamped = Math.max(minDurationMin, Math.min(maxDurationMin, preset));
                      setDurationMinInput(String(clamped));
                      setDurationFeedback('');
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: parseInt(durationMinInput, 10) === preset ? '1px solid #F43F5E' : '1px solid #e5e5e5',
                      background: parseInt(durationMinInput, 10) === preset ? '#FFF1F2' : '#fafafa',
                      color: parseInt(durationMinInput, 10) === preset ? '#E11D48' : '#525252',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {preset}m
                  </button>
                ))}
              </div>
            </div>
            {durationFeedback && (
              <div style={{
                marginTop: 4,
                padding: '8px 10px',
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: 6,
                fontSize: 13,
                color: '#92400e',
              }}>
                {durationFeedback}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>
              Parent Task (Optional)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 14,
                outline: 'none',
                color: parentId ? '#111111' : '#a3a3a3',
              }}
            >
              <option value="">Independent task (no parent)</option>
              {eligibleParents.map((parent) => (
                <option key={parent.id} value={parent.id}>{parent.title}</option>
              ))}
            </select>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              Create this as a child of an existing task
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 14,
                outline: 'none',
                color: category ? '#111111' : '#a3a3a3',
              }}
            >
              <option value="">No category</option>
              {categoryNames.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '10px 16px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              data-testid="task-save"
              style={{
                padding: '10px 18px',
                borderRadius: 6,
                border: 'none',
                background: '#F43F5E',
                color: 'white',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
