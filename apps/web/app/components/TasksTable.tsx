'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { type Todo } from '../hooks/useTodos';
import { useCategories } from '../hooks/useCategories';
import { useDurationSettings } from '../hooks/useDurationSettings';
import { formatDate, formatTimeRange } from '../lib/dateTime';
import { apiFetchJson } from '../lib/api';

type TasksTableProps = {
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onUpdate: (todoId: string, title: string, category?: string | null, durationMin?: number, description?: string | null) => void;
  onSchedule: (todoId: string, currentStartAt?: string | null, currentDurationMin?: number | null) => void;
  onUnschedule: (todoId: string, todoTitle: string) => void;
  onDelete: (todoId: string, todoTitle: string) => void;
  onPin: (todoId: string, isPinned: boolean) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  userId: string | null;
};

export default function TasksTable({
  todos,
  onToggle,
  onUpdate,
  onSchedule,
  onUnschedule,
  onDelete,
  onPin,
  selectedIds = new Set(),
  onSelectionChange,
  userId
}: TasksTableProps) {
  const { minDurationMin, maxDurationMin, defaultDurationMin } = useDurationSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [editingDurationMin, setEditingDurationMin] = useState<string>(String(defaultDurationMin));
  const [savedTodoId, setSavedTodoId] = useState<string | null>(null);
  const [relationshipModal, setRelationshipModal] = useState<{ todo: Todo; type: 'parent' | 'child' } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<Todo | Todo[] | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const { getCategoryNames } = useCategories(userId);
  const categoryNames = getCategoryNames();

  // Fetch relationship data when modal opens
  useEffect(() => {
    if (!relationshipModal) {
      setModalData(null);
      return;
    }

    const fetchRelationshipData = async () => {
      setModalLoading(true);
      try {
        if (relationshipModal.type === 'parent') {
          const parent = await apiFetchJson(`/todos/${relationshipModal.todo.id}/parent`, { method: 'GET' });
          setModalData(parent);
        } else {
          const children = await apiFetchJson(`/todos/${relationshipModal.todo.id}/children`, { method: 'GET' });
          setModalData(children);
        }
      } catch (error) {
        console.error('Failed to fetch relationship data:', error);
        setModalData(null);
      } finally {
        setModalLoading(false);
      }
    };

    fetchRelationshipData();
  }, [relationshipModal]);

  useEffect(() => {
    if (!openActionsId) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`[data-actions-id="${openActionsId}"]`)) return;
      setOpenActionsId(null); setDropdownPos(null);
      setDropdownPos(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openActionsId]);

  const toggleSelection = (todoId: string) => {
    if (!onSelectionChange) return;
    const newSet = new Set(selectedIds);
    if (newSet.has(todoId)) {
      newSet.delete(todoId);
    } else {
      newSet.add(todoId);
    }
    onSelectionChange(newSet);
  };

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (selectedIds.size === todos.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(todos.map(t => t.id)));
    }
  };

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
    setEditingDescription(todo.description || '');
    setEditingCategory(todo.category || '');
    setEditingDurationMin(String(todo.durationMin || defaultDurationMin));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle('');
    setEditingDescription('');
    setEditingCategory('');
    setEditingDurationMin(String(defaultDurationMin));
  };

  const saveEditing = (todoId: string, isScheduled: boolean) => {
    // Parse and clamp duration before submitting
    const parsed = parseInt(editingDurationMin, 10);
    const clampedDuration = isNaN(parsed)
      ? defaultDurationMin
      : Math.max(minDurationMin, Math.min(maxDurationMin, parsed));
    const category = editingCategory || null;
    const description = editingDescription.trim() || null;
    onUpdate(todoId, editingTitle, category, clampedDuration, description);

    // Show inline success feedback
    setSavedTodoId(todoId);
    setTimeout(() => setSavedTodoId(null), 2000);

    cancelEditing();
  };

  if (todos.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        padding: 48,
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        No tasks found. Add your first task above!
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 12,
      border: '1px solid var(--border)',
    }}>
      <div style={{ overflowX: 'auto', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border)' }}>
              {onSelectionChange && (
                <th style={{ padding: '12px 16px', textAlign: 'center', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === todos.length && todos.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </th>
              )}
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', width: 40 }}>
                Pin
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', width: 40 }}>
                Done
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Task
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', width: 100 }}>
                Relationship
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', width: 100 }}>
                Status
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', width: 80 }}>
                Duration
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', width: 140 }}>
                Schedule
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', width: 200 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {todos.map((t) => (
              <tr
                key={t.id}
                data-testid={`task-row-${t.id}`}
                style={{
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.15s, box-shadow 0.15s, transform 0.15s',
                  background: t.isPinned
                    ? 'rgba(244, 63, 94, 0.12)'
                    : t.done
                      ? 'var(--surface-secondary)'
                      : 'var(--surface)',
                  borderLeft: t.isPinned
                    ? '3px solid var(--accent)'
                    : t.done
                      ? '3px solid var(--border-strong)'
                      : '3px solid transparent',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = t.isPinned
                    ? 'rgba(244, 63, 94, 0.2)'
                    : t.done
                      ? 'var(--surface-hover)'
                      : 'var(--surface-secondary)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = t.isPinned
                    ? 'rgba(244, 63, 94, 0.12)'
                    : t.done
                      ? 'var(--surface-secondary)'
                      : 'var(--surface)';
                }}
              >
                {onSelectionChange && (
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelection(t.id)}
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />
                  </td>
                )}
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <button
                    onClick={() => onPin(t.id, !t.isPinned)}
                    data-testid={`task-pin-${t.id}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 16,
                      color: t.isPinned ? 'var(--accent)' : 'var(--border-strong)',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                    }}
                    title={t.isPinned ? 'Unpin task' : 'Pin task'}
                  >
                    {t.isPinned ? (
                      <svg
                        aria-hidden="true"
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M12 21.75s7.5-4.125 7.5-11.25a7.5 7.5 0 10-15 0c0 7.125 7.5 11.25 7.5 11.25zm0-14.25a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z"
                        />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
                        <path d="M19.5 9.75c0 7.125-7.5 11.25-7.5 11.25S4.5 16.875 4.5 9.75a7.5 7.5 0 1115 0z" />
                      </svg>
                    )}
                  </button>
                </td>
                <td style={{ padding: '16px' }}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => onToggle(t)}
                    data-testid={`task-toggle-${t.id}`}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </td>
                <td style={{ padding: '16px' }}>
                  {editingId === t.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              saveEditing(t.id, !!t.startAt);
                            }
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          placeholder="Task title"
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            fontSize: 14,
                            borderRadius: 4,
                            border: '1px solid var(--accent)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                          }}
                          autoFocus
                        />
                      </div>
                      <div>
                        <textarea
                          value={editingDescription}
                          onChange={(e) => setEditingDescription(e.target.value)}
                          maxLength={500}
                          rows={2}
                          placeholder="Description (optional)..."
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: 13,
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{
                          marginTop: 2,
                          fontSize: 10,
                          color: editingDescription.length > 450 ? 'var(--accent-warning)' : 'var(--text-muted)',
                          textAlign: 'right',
                        }}>
                          {editingDescription.length}/500
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            fontSize: 13,
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            outline: 'none',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <option value="">No category</option>
                          {getCategoryNames().map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        {!t.startAt && (
                          <>
                            <input
                              type="number"
                              value={editingDurationMin}
                              onChange={(e) => setEditingDurationMin(e.target.value)}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (isNaN(val) || e.target.value === '') {
                                  setEditingDurationMin(String(defaultDurationMin));
                                } else {
                                  const clamped = Math.max(minDurationMin, Math.min(maxDurationMin, val));
                                  setEditingDurationMin(String(clamped));
                                }
                              }}
                              min={minDurationMin}
                              max={maxDurationMin}
                              style={{
                                width: 60,
                                padding: '6px 8px',
                                fontSize: 12,
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                textAlign: 'center',
                              }}
                              title={`Duration (${minDurationMin}-${maxDurationMin} min)`}
                            />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>min</span>
                          </>
                        )}
                        <button
                          onClick={() => saveEditing(t.id, !!t.startAt)}
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            borderRadius: 4,
                            border: 'none',
                            background: '#10b981',
                            color: '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Link
                          href={`/task/${t.id}`}
                          data-testid={`task-open-${t.id}`}
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                            textDecoration: t.done ? 'line-through' : 'none',
                          }}
                          onMouseOver={(e) => {
                            if (!t.done) {
                              e.currentTarget.style.color = 'var(--accent)';
                            }
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.color = t.done ? 'var(--text-muted)' : 'var(--text-primary)';
                          }}
                        >
                          {t.title}
                        </Link>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          background: 'var(--surface-hover)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}>
                          {t.id.slice(0, 8)}
                        </span>
                        {t.isPinned && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--accent-strong)',
                            background: 'rgba(244, 63, 94, 0.2)',
                            padding: '2px 8px',
                            borderRadius: 9999,
                            textTransform: 'uppercase',
                            letterSpacing: 0.3,
                          }}>
                            Pinned
                          </span>
                        )}
                        {savedTodoId === t.id && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#10b981',
                            background: 'rgba(34, 197, 94, 0.2)',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}>
                            Saved
                          </span>
                        )}
                      </div>
                      {t.description && (
                      <div style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginBottom: 4,
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}>
                        {t.description}
                      </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Created {formatDate(t.createdAt)}</span>
                        {t.category && (
                          <>
                            <span>-</span>
                            <span style={{ color: '#F43F5E', fontWeight: 500 }}>{t.category}</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </td>
                <td style={{ padding: '16px' }}>
                  {(() => {
                    const hasChildren = (t.childCount ?? 0) > 0;
                    const hasParent = !!t.parentId;

                    if (!hasChildren && !hasParent) {
                      return (
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          Independent
                        </span>
                      );
                    }

                    if (hasParent && hasChildren) {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span
                            onClick={() => setRelationshipModal({ todo: t, type: 'parent' })}
                            style={{
                              fontSize: 13,
                              color: '#F43F5E',
                              fontWeight: 500,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            Child
                          </span>
                          <span
                            onClick={() => setRelationshipModal({ todo: t, type: 'child' })}
                            style={{
                              fontSize: 13,
                              color: '#10b981',
                              fontWeight: 500,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            Parent ({t.childCount})
                          </span>
                        </div>
                      );
                    }

                    if (hasParent) {
                      return (
                        <span
                          onClick={() => setRelationshipModal({ todo: t, type: 'parent' })}
                          style={{
                            fontSize: 13,
                            color: '#F43F5E',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Child
                        </span>
                      );
                    }

                    if (hasChildren) {
                      return (
                        <span
                          onClick={() => setRelationshipModal({ todo: t, type: 'child' })}
                          style={{
                            fontSize: 13,
                            color: '#10b981',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Parent ({t.childCount})
                        </span>
                      );
                    }
                  })()}
                </td>
                <td style={{ padding: '16px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 12,
                      background: t.done ? 'rgba(34, 197, 94, 0.2)' : 'rgba(244, 63, 94, 0.16)',
                      color: t.done ? '#16a34a' : 'var(--accent-strong)',
                    }}
                  >
                    {t.done ? 'Done' : 'Active'}
                  </span>
                </td>
                <td style={{ padding: '16px', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {t.durationMin ? `${t.durationMin}m` : ''}
                </td>
                <td style={{ padding: '16px' }}>
                  {t.startAt && t.durationMin ? (
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {formatDate(t.startAt)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {formatTimeRange(t.startAt, t.durationMin)}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Not scheduled</span>
                  )}
                </td>
                <td style={{ padding: '16px', textAlign: 'right', position: 'relative', whiteSpace: 'nowrap' }}>
                  {editingId !== t.id && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }} data-actions-id={t.id}>
                      <button
                        onClick={(e) => {
                          if (openActionsId === t.id) {
                            setOpenActionsId(null);
                            setDropdownPos(null);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setDropdownPos({
                              top: rect.bottom + 4,
                              right: window.innerWidth - rect.right,
                            });
                            setOpenActionsId(t.id);
                          }
                        }}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: 8,
                          border: '1px solid var(--accent)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                        }}
                        title="Actions"
                      >
                        <span style={{ paddingRight: 6 }}>Actions</span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 22,
                            height: 20,
                            borderLeft: '1px solid var(--accent)',
                            color: 'var(--accent)',
                          }}
                        >
                          ▾
                        </span>
                      </button>
                      {openActionsId === t.id && dropdownPos && (
                        <div
                          style={{
                            position: 'fixed',
                            top: dropdownPos.top,
                            right: dropdownPos.right,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            minWidth: 180,
                            boxShadow: '0 16px 32px rgba(0,0,0,0.18)',
                            padding: '6px 0',
                            zIndex: 9999,
                          }}
                        >
                          <Link
                            href={`/task/${t.id}`}
                            style={{
                              padding: '8px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textDecoration: 'none',
                              color: 'var(--text-primary)',
                              fontSize: 12,
                              borderRadius: 8,
                              background: 'transparent',
                              margin: '2px 6px',
                            }}
                            onClick={() => setOpenActionsId(null)}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            View task
                          </Link>
                          <button
                            onClick={() => {
                              setOpenActionsId(null); setDropdownPos(null);
                              startEditing(t);
                            }}
                            style={{
                              width: '100%',
                              textAlign: 'center',
                              padding: '8px 14px',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text-primary)',
                              fontSize: 12,
                              cursor: 'pointer',
                              borderRadius: 8,
                              margin: '2px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setOpenActionsId(null); setDropdownPos(null);
                              onSchedule(t.id, t.startAt, t.durationMin);
                            }}
                            data-testid={`task-schedule-${t.id}`}
                            style={{
                              width: '100%',
                              textAlign: 'center',
                              padding: '8px 14px',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text-primary)',
                              fontSize: 12,
                              cursor: 'pointer',
                              borderRadius: 8,
                              margin: '2px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {t.startAt ? 'Reschedule' : 'Schedule'}
                          </button>
                          {t.startAt && (
                            <button
                              onClick={() => {
                                setOpenActionsId(null); setDropdownPos(null);
                                onUnschedule(t.id, t.title);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'center',
                                padding: '8px 14px',
                                border: 'none',
                                background: 'transparent',
                                color: '#f59e0b',
                                fontSize: 12,
                                cursor: 'pointer',
                                borderRadius: 8,
                                margin: '2px 6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)'; }}
                              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              Unschedule
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setOpenActionsId(null); setDropdownPos(null);
                              onDelete(t.id, t.title);
                            }}
                            data-testid={`task-delete-${t.id}`}
                            style={{
                              width: '100%',
                              textAlign: 'center',
                              padding: '8px 14px',
                              border: 'none',
                              background: 'transparent',
                              color: '#dc2626',
                              fontSize: 12,
                              cursor: 'pointer',
                              borderRadius: 8,
                              margin: '2px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Relationship Modal */}
      {relationshipModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setRelationshipModal(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 8 }}>
                {relationshipModal.type === 'parent' ? 'Parent Task' : 'Child Tasks'}
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                Related to: {relationshipModal.todo.title}
              </p>
            </div>

            {modalLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Loading...
              </div>
            ) : modalData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {relationshipModal.type === 'parent' ? (
                  // Display parent task
                  (() => {
                    const parent = modalData as Todo;
                    return (
                      <Link
                        href={`/task/${parent.id}`}
                        style={{
                          padding: '16px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-secondary)',
                          display: 'block',
                          textDecoration: 'none',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'var(--surface-hover)';
                          e.currentTarget.style.borderColor = 'var(--border-strong)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'var(--surface-secondary)';
                          e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                            {parent.title}
                          </span>
                          {parent.done && (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(34, 197, 94, 0.2)',
                              color: '#16a34a',
                              fontSize: 11,
                              fontWeight: 600,
                            }}>
                              DONE
                            </span>
                          )}
                        </div>
                        {parent.description && (
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                            {parent.description}
                          </div>
                        )}
                      </Link>
                    );
                  })()
                ) : (
                  // Display child tasks
                  (modalData as Todo[]).map((child) => (
                    <Link
                      key={child.id}
                      href={`/task/${child.id}`}
                      style={{
                        padding: '16px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--surface-secondary)',
                        display: 'block',
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'var(--surface-hover)';
                        e.currentTarget.style.borderColor = 'var(--border-strong)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'var(--surface-secondary)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {child.title}
                        </span>
                        {child.done && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(34, 197, 94, 0.2)',
                            color: '#16a34a',
                            fontSize: 11,
                            fontWeight: 600,
                          }}>
                            DONE
                          </span>
                        )}
                      </div>
                      {child.description && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                          {child.description}
                        </div>
                      )}
                    </Link>
                  ))
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                No data found
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button
                onClick={() => setRelationshipModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
