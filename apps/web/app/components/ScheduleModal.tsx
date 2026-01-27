'use client';

import { useState, useEffect, useMemo } from 'react';
import { toDateTimeLocal, getNextRounded30Min } from '../lib/dateTime';
import { useDurationSettings } from '../hooks/useDurationSettings';
import { findAvailableSlots, type TimeSlot } from '../hooks/useAvailability';

type CalendarEvent = {
  start: Date;
  end: Date;
  [key: string]: any;
};

type ScheduleModalProps = {
  isOpen: boolean;
  currentStartAt?: string | null;
  currentDurationMin?: number | null;
  currentDescription?: string | null;
  taskId?: string | null;
  events?: CalendarEvent[];
  workingHours?: { start: string; end: string };
  workingDays?: number[];
  onSave: (startAt: string, durationMin: number, description?: string) => Promise<{ success: boolean; conflictError?: boolean }>;
  onClose: () => void;
};

export default function ScheduleModal({
  isOpen,
  currentStartAt,
  currentDurationMin,
  currentDescription = null,
  taskId = null,
  events = [],
  workingHours,
  workingDays,
  onSave,
  onClose,
}: ScheduleModalProps) {
  const { minDurationMin, maxDurationMin, defaultDurationMin } = useDurationSettings();
  const [startAt, setStartAt] = useState('');
  const [durationMin, setDurationMin] = useState(String(defaultDurationMin));
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Compute suggested available slots (only for unscheduled tasks)
  const suggestedSlots = useMemo<TimeSlot[]>(() => {
    if (!isOpen || currentStartAt) return []; // Only show for unscheduled tasks
    const duration = parseInt(durationMin, 10) || defaultDurationMin;
    const wh = workingHours || { start: '09:00', end: '17:00' };
    const wd = workingDays || [1, 2, 3, 4, 5];
    // Anchor suggestions to the date from the Start Time input
    const anchorDate = startAt ? new Date(startAt) : new Date();
    return findAvailableSlots({
      events,
      date: anchorDate,
      durationMin: duration,
      workingHours: wh,
      workingDays: wd,
      maxSuggestions: 5,
    });
  }, [isOpen, currentStartAt, startAt, durationMin, defaultDurationMin, events, workingHours, workingDays]);

  const handleSlotClick = (slot: TimeSlot) => {
    setStartAt(toDateTimeLocal(slot.start.toISOString()));
  };

  // Initialize form values when modal opens
  useEffect(() => {
    if (isOpen) {
      if (currentStartAt) {
        setStartAt(toDateTimeLocal(currentStartAt));
      } else {
        setStartAt(getNextRounded30Min());
      }
      setDurationMin(currentDurationMin ? String(currentDurationMin) : String(defaultDurationMin));
      setDescription(currentDescription || '');
      setError(null);
    }
  }, [isOpen, currentStartAt, currentDurationMin, currentDescription, defaultDurationMin]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSave = async () => {
    const duration = parseInt(durationMin, 10);

    if (!startAt) {
      setError('Please select a start time.');
      return;
    }
    if (isNaN(duration) || duration < minDurationMin) {
      setError(`Duration must be at least ${minDurationMin} minutes.`);
      return;
    }
    if (duration > maxDurationMin) {
      setError(`Duration cannot exceed ${maxDurationMin} minutes (24 hours).`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const isoStartAt = new Date(startAt).toISOString();
      const result = await onSave(isoStartAt, duration, description.trim() || undefined);

      if (result.success) {
        onClose();
      } else if (result.conflictError) {
        setError('This time slot overlaps with an existing event. Please choose a different time.');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          padding: 24,
          borderRadius: 12,
          maxWidth: 450,
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Schedule Task</h2>

        {suggestedSlots.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 13, color: '#475569' }}>
              Suggested Available Times:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestedSlots.map((slot, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSlotClick(slot)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#334155',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e0f2fe';
                    e.currentTarget.style.borderColor = '#0070f3';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Start Time:
            </label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 4,
                border: error ? '1px solid #dc3545' : '1px solid #ccc',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Duration (minutes):
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              onBlur={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && e.target.value.trim() !== '') {
                  const clamped = Math.max(minDurationMin, Math.min(maxDurationMin, val));
                  if (clamped !== val) {
                    setDurationMin(String(clamped));
                  }
                } else if (e.target.value.trim() === '') {
                  setDurationMin(String(defaultDurationMin));
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 4,
                border: error ? '1px solid #dc3545' : '1px solid #ccc',
                fontSize: 14,
              }}
            />
          </div>

          {taskId && (
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Description:
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Add description (optional)..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  fontSize: 14,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{
                marginTop: 4,
                fontSize: 11,
                color: description.length > 450 ? '#f59e0b' : '#94a3b8',
                textAlign: 'right',
              }}>
                {description.length}/500 characters
              </div>
            </div>
          )}

          {error && (
            <div style={{ color: '#dc3545', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px',
                borderRadius: 4,
                border: '1px solid #ccc',
                background: 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !startAt || !durationMin}
              style={{
                padding: '8px 16px',
                borderRadius: 4,
                border: 'none',
                background: '#0070f3',
                color: 'white',
                cursor: saving || !startAt || !durationMin ? 'not-allowed' : 'pointer',
                opacity: saving || !startAt || !durationMin ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
