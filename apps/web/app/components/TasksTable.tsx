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
          const parent = await apiFetchJson<Todo>(`/todos/${relationshipModal.todo.id}/parent`, { method: 'GET' });
          setModalData(parent);
        } else {
          const children = await apiFetchJson<Todo[]>(`/todos/${relationshipModal.todo.id}/children`, { method: 'GET' });
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
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 48,
        textAlign: 'center',
        color: '#94a3b8',
      }}>
        No tasks found. Add your first task above!
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
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
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 40 }}>
                Pin
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 40 }}>
                Done
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Task
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 100 }}>
                Relationship
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 100 }}>
                Status
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 80 }}>
                Duration
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 140 }}>
                Schedule
              </th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 200 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {todos.map((t) => (
              <tr
                key={t.id}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'background 0.15s, box-shadow 0.15s, transform 0.15s',
                  background: t.isPinned ? '#fffbeb' : t.done ? '#f8fafc' : 'white',
                  borderLeft: t.isPinned ? '3px solid #f59e0b' : t.done ? '3px solid #cbd5e1' : '3px solid transparent',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = t.isPinned ? '#fff7ed' : t.done ? '#f1f5f9' : '#f8fafc';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = t.isPinned ? '#fffbeb' : t.done ? '#f8fafc' : 'white';
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
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 16,
                      color: t.isPinned ? '#f59e0b' : '#cbd5e1',
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
                            border: '1px solid #3b82f6',
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
                            border: '1px solid #e2e8f0',
                            outline: 'none',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{
                          marginTop: 2,
                          fontSize: 10,
                          color: editingDescription.length > 450 ? '#f59e0b' : '#94a3b8',
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
                            border: '1px solid #e2e8f0',
                            outline: 'none',
                            color: '#64748b',
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
                                border: '1px solid #e2e8f0',
                                outline: 'none',
                                textAlign: 'center',
                              }}
                              title={`Duration (${minDurationMin}-${maxDurationMin} min)`}
                            />
                            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>min</span>
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
                            color: 'white',
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
                            border: '1px solid #e2e8f0',
                            background: 'white',
                            color: '#64748b',
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
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: t.done ? '#94a3b8' : '#1e293b',
                            textDecoration: t.done ? 'line-through' : 'none',
                          }}
                          onMouseOver={(e) => {
                            if (!t.done) {
                              e.currentTarget.style.color = '#3b82f6';
                            }
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.color = t.done ? '#94a3b8' : '#1e293b';
                          }}
                        >
                          {t.title}
                        </Link>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: '#94a3b8',
                          background: '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}>
                          {t.id.slice(0, 8)}
                        </span>
                        {t.isPinned && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#92400e',
                            background: '#fef9c3',
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
                            background: '#d1fae5',
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
                        color: '#64748b',
                        marginBottom: 4,
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}>
                        {t.description}
                      </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#94a3b8' }}>
                        <span>Created {formatDate(t.createdAt)}</span>
                        {t.category && (
                          <>
                            <span>-</span>
                            <span style={{ color: '#3b82f6', fontWeight: 500 }}>{t.category}</span>
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
                        <span style={{ fontSize: 13, color: '#94a3b8' }}>
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
                              color: '#8b5cf6',
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
                            color: '#8b5cf6',
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
                      background: t.done ? '#d1fae5' : '#dbeafe',
                      color: t.done ? '#065f46' : '#1e40af',
                    }}
                  >
                    {t.done ? 'Done' : 'Active'}
                  </span>
                </td>
                <td style={{ padding: '16px', whiteSpace: 'nowrap', fontSize: 13, color: '#475569' }}>
                  {t.durationMin ? `${t.durationMin}m` : ''}
                </td>
                <td style={{ padding: '16px' }}>
                  {t.startAt && t.durationMin ? (
                    <div>
                      <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>
                        {formatDate(t.startAt)}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {formatTimeRange(t.startAt, t.durationMin)}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>Not scheduled</span>
                  )}
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  {editingId !== t.id && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Link
                        href={`/task/${t.id}`}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: 4,
                          border: '1px solid #e2e8f0',
                          background: 'white',
                          color: '#3b82f6',
                          cursor: 'pointer',
                          textDecoration: 'none',
                          display: 'inline-block',
                        }}
                        title="View task details"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => startEditing(t)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: 4,
                          border: '1px solid #e2e8f0',
                          background: 'white',
                          color: '#64748b',
                          cursor: 'pointer',
                        }}
                        title="Edit task"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onSchedule(t.id, t.startAt, t.durationMin)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: 4,
                          border: '1px solid #e2e8f0',
                          background: 'white',
                          color: '#3b82f6',
                          cursor: 'pointer',
                        }}
                        title={t.startAt ? 'Reschedule' : 'Schedule'}
                      >
                        {t.startAt ? 'Reschedule' : 'Schedule'}
                      </button>
                      {t.startAt && (
                        <button
                          onClick={() => onUnschedule(t.id, t.title)}
                          style={{
                            padding: '6px 10px',
                            fontSize: 12,
                            borderRadius: 4,
                            border: '1px solid #e2e8f0',
                            background: 'white',
                            color: '#f59e0b',
                            cursor: 'pointer',
                          }}
                          title="Unschedule"
                        >
                          Unschedule
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(t.id, t.title)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: 4,
                          border: '1px solid #fee2e2',
                          background: 'white',
                          color: '#dc2626',
                          cursor: 'pointer',
                        }}
                        title="Delete task"
                      >
                        Delete
                      </button>
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
              background: 'white',
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 8 }}>
                {relationshipModal.type === 'parent' ? 'Parent Task' : 'Child Tasks'}
              </h2>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                Related to: {relationshipModal.todo.title}
              </p>
            </div>

            {modalLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
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
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          display: 'block',
                          textDecoration: 'none',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#f1f5f9';
                          e.currentTarget.style.borderColor = '#cbd5e1';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = '#f8fafc';
                          e.currentTarget.style.borderColor = '#e2e8f0';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                            {parent.title}
                          </span>
                          {parent.done && (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: '#dcfce7',
                              color: '#166534',
                              fontSize: 11,
                              fontWeight: 600,
                            }}>
                              DONE
                            </span>
                          )}
                        </div>
                        {parent.description && (
                          <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
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
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        display: 'block',
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                          {child.title}
                        </span>
                        {child.done && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: '#dcfce7',
                            color: '#166534',
                            fontSize: 11,
                            fontWeight: 600,
                          }}>
                            DONE
                          </span>
                        )}
                      </div>
                      {child.description && (
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                          {child.description}
                        </div>
                      )}
                    </Link>
                  ))
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                No data found
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button
                onClick={() => setRelationshipModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  color: '#64748b',
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
