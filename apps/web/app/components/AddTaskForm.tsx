'use client';

import { useState } from 'react';
import { useCategories } from '../hooks/useCategories';
import { useDurationSettings } from '../hooks/useDurationSettings';
import { useEligibleParents } from '../hooks/useEligibleParents';
import { DURATION_PRESETS } from '../lib/constants';

type AddTaskFormProps = {
  onAdd: (title: string, category?: string, durationMin?: number, description?: string, parentId?: string) => Promise<boolean>;
  userId: string | null;
};

export default function AddTaskForm({ onAdd, userId }: AddTaskFormProps) {
  const { minDurationMin, maxDurationMin, defaultDurationMin } = useDurationSettings();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [parentId, setParentId] = useState('');
  const [durationMinInput, setDurationMinInput] = useState(String(defaultDurationMin));
  const [durationFeedback, setDurationFeedback] = useState('');
  const { getCategoryNames } = useCategories(userId);
  const categoryNames = getCategoryNames();
  const { eligibleParents } = useEligibleParents(userId);

  const handleAdd = async () => {
    const parsedDuration = parseInt(durationMinInput, 10);

    // Check if duration is valid
    if (isNaN(parsedDuration) || durationMinInput.trim() === '') {
      setDurationFeedback(`Invalid duration. Reset to default (${defaultDurationMin} minutes).`);
      setDurationMinInput(String(defaultDurationMin));
      return;
    }

    // Clamp duration before submitting
    const clampedDuration = Math.max(minDurationMin, Math.min(maxDurationMin, parsedDuration));

    // Show feedback if clamping occurred
    if (clampedDuration !== parsedDuration) {
      setDurationFeedback(`Duration must be between ${minDurationMin} and ${maxDurationMin} minutes. Adjusted to ${clampedDuration}.`);
      setDurationMinInput(String(clampedDuration));
      return;
    }

    const success = await onAdd(title.trim(), category || undefined, clampedDuration, description.trim() || undefined, parentId || undefined);
    if (success) {
      setTitle('');
      setDescription('');
      setCategory('');
      setParentId('');
      setDurationMinInput(String(defaultDurationMin));
      setDurationFeedback('');
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>
        Add New Task
      </label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) handleAdd();
          }}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 14,
            outline: 'none',
          }}
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          style={{
            padding: '10px 14px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 14,
            outline: 'none',
            minWidth: 160,
            color: parentId ? '#141414' : '#a3a3a3',
          }}
          title="Optional: Select parent task"
        >
          <option value="">No parent</option>
          {eligibleParents.map((parent) => (
            <option key={parent.id} value={parent.id}>{parent.title}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: '10px 14px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 14,
            outline: 'none',
            minWidth: 140,
            color: category ? '#141414' : '#a3a3a3',
          }}
        >
          <option value="">No category</option>
          {categoryNames.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}

        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            value={durationMinInput}
            onChange={(e) => {
              // Allow free typing, including empty string
              setDurationMinInput(e.target.value);

              // Clear feedback if value becomes valid and in range
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= minDurationMin && val <= maxDurationMin) {
                setDurationFeedback('');
              }
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && e.target.value.trim() !== '') {
                // Clamp to min/max bounds on blur
                const clamped = Math.max(minDurationMin, Math.min(maxDurationMin, val));
                if (clamped !== val) {
                  setDurationFeedback(`Duration must be between ${minDurationMin} and ${maxDurationMin} minutes. Adjusted to ${clamped}.`);
                  setDurationMinInput(String(clamped));
                } else {
                  setDurationFeedback('');
                }
              } else if (e.target.value.trim() === '') {
                // Reset to default if empty
                setDurationFeedback(`Invalid duration. Reset to default (${defaultDurationMin} minutes).`);
                setDurationMinInput(String(defaultDurationMin));
              }
            }}
            min={minDurationMin}
            max={maxDurationMin}
            style={{
              width: 70,
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              outline: 'none',
              textAlign: 'center',
            }}
            title={`Duration (${minDurationMin}-${maxDurationMin} min)`}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>min</span>
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
                padding: '6px 10px',
                borderRadius: 4,
                border: parseInt(durationMinInput, 10) === preset ? '1px solid #F43F5E' : '1px solid #e5e5e5',
                background: parseInt(durationMinInput, 10) === preset ? '#eff6ff' : '#fafafa',
                color: parseInt(durationMinInput, 10) === preset ? '#E11D48' : '#525252',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {preset}m
            </button>
          ))}
        </div>
        <button
          onClick={handleAdd}
          disabled={!title.trim()}
          style={{
            padding: '10px 20px',
            background: title.trim() ? '#F43F5E' : '#d4d4d4',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: title.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Add Task
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Add description (optional)..."
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
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
      {durationFeedback && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          background: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: 6,
          fontSize: 13,
          color: '#92400e'
        }}>
          {durationFeedback}
        </div>
      )}
    </div>
  );
}
