'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CSRF_HEADER_NAME,
  apiFetchJson,
  getCsrfToken,
  isUnauthorized,
} from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/dateTime';
import { useCategories } from '../../hooks/useCategories';
import { useDurationSettings } from '../../hooks/useDurationSettings';
import { useScheduledEvents } from '../../hooks/useScheduledEvents';
import { useSettings } from '../../hooks/useSettings';
import ScheduleModal from '../../components/ScheduleModal';
import NotificationToast, { type Notification } from '../../components/NotificationToast';
import type { Todo } from '../../hooks/useTodos';
import type { Me } from '../../types';
import { TASK_STAGE_KEYS, DEFAULT_TASK_STAGE_KEY } from '../../lib/constants';
import type { TaskStageKey } from '../../lib/constants';
import Layout from '../../components/Layout';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

type Attachment = {
  id: string;
  todoId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  stageKeyAtCreation?: TaskStageKey | null;
};

type AuditEntry = {
  id: string;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
};

type Remark = {
  id: string;
  todoId: string;
  userId: string;
  content: string;
  createdAt: string;
  stageKeyAtCreation?: TaskStageKey | null;
  authorEmail?: string | null;
};

const STAGE_LABELS: Record<TaskStageKey, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

const STAGE_BADGE_STYLES: Record<TaskStageKey, { backgroundColor: string; color: string }> = {
  backlog: { backgroundColor: '#eef2ff', color: '#312e81' },
  in_progress: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  blocked: { backgroundColor: '#fef3c7', color: '#92400e' },
  done: { backgroundColor: '#dcfce7', color: '#166534' },
};

const STAGE_BADGE_BASE_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const renderStageBadge = (stageKey?: TaskStageKey | null) => {
  if (!stageKey) return null;
  return (
    <span
      style={{
        ...STAGE_BADGE_BASE_STYLE,
        ...STAGE_BADGE_STYLES[stageKey],
      }}
    >
      {STAGE_LABELS[stageKey]}
    </span>
  );
};

export default function TaskDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const { minDurationMin, maxDurationMin, defaultDurationMin } = useDurationSettings();

  // Auth state
  const [me, setMe] = useState<Me | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Task state
  const [task, setTask] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<TaskStageKey>(DEFAULT_TASK_STAGE_KEY);
  const [stageSaving, setStageSaving] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [editDurationMinInput, setEditDurationMinInput] = useState<string>(String(defaultDurationMin));
  const [durationFeedback, setDurationFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentsLimit, setAttachmentsLimit] = useState(10);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  // Remarks
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [remarksLimit, setRemarksLimit] = useState(10);
  const [remarksOffset, setRemarksOffset] = useState(0);
  const [remarksHasMore, setRemarksHasMore] = useState(false);
  const [newRemarkContent, setNewRemarkContent] = useState('');
  const [addingRemark, setAddingRemark] = useState(false);

  // Categories
  const { getCategoryColor, getCategoryNames } = useCategories(me?.userId ?? null);

  // Availability data for schedule suggestions
  const scheduledEvents = useScheduledEvents(me?.userId ?? null);
  const { settings } = useSettings(me?.userId ?? null);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    type: 'success' | 'error' | 'info',
    title: string,
    message?: string,
    taskTitle?: string,
    taskId?: string
  ) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, title, message, taskTitle, taskId }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const meJson = (await apiFetchJson('/auth/me')) as Me;
        setMe(meJson);
      } catch (e: any) {
        if (isUnauthorized(e)) {
          setMe(null);
          router.push('/');
        }
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch task details
  const fetchTask = useCallback(async () => {
    if (!me) return;

    setLoading(true);
    setError(null);

    try {
      const taskData = await apiFetchJson(`/todos/${taskId}`);
      if (taskData.error) {
        setError('Task not found');
        setTask(null);
      } else {
        setTask(taskData);
        setEditTitle(taskData.title);
        setEditDescription(taskData.description || '');
        setEditCategory(taskData.category || null);
        setSelectedStage((taskData.stageKey ?? DEFAULT_TASK_STAGE_KEY) as TaskStageKey);
        setEditDurationMinInput(String(taskData.durationMin || defaultDurationMin));
      }
    } catch (e: any) {
      if (isUnauthorized(e)) {
        router.push('/');
      } else {
        setError(e?.message || 'Failed to load task');
      }
    } finally {
      setLoading(false);
    }
  }, [me, taskId, router]);

  // Fetch attachments
  const fetchAttachments = useCallback(async () => {
    if (!me || !taskId) return;

    try {
      const data = await apiFetchJson(`/attachments/todo/${taskId}`);
      setAttachments(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, [me, taskId]);

  // Fetch history from audit logs
  const fetchHistory = useCallback(async (limit: number = 10, offset: number = 0, append: boolean = false) => {
    if (!me || !taskId) return;

    try {
      const data = await apiFetchJson(`/audit/resource/${taskId}?type=todo&limit=${limit}&offset=${offset}`);
      const items = Array.isArray(data) ? data : [];
      if (append) {
        setHistory(prev => [...prev, ...items]);
      } else {
        setHistory(items);
      }
      // If we got fewer than limit, there's no more
      setHistoryHasMore(items.length === limit);
    } catch {
      // ignore
    }
  }, [me, taskId]);

  useEffect(() => {
    if (me && taskId) {
      fetchTask();
      fetchAttachments();
      fetchHistory(historyLimit, 0, false);
      fetchRemarks(remarksLimit, 0, false);
    }
  }, [me, taskId, fetchTask, fetchAttachments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch history when limit changes
  useEffect(() => {
    if (me && taskId) {
      setHistoryOffset(0);
      fetchHistory(historyLimit, 0, false);
    }
  }, [historyLimit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save task changes
  const handleSave = async () => {
    if (!task) return;

    setSaving(true);
    try {
      const body: any = {
        title: editTitle,
        description: editDescription || null,
        category: editCategory,
      };

      // Include durationMin when duration input is shown/edited
      let normalizedDuration: number;

      const parsedDuration = parseInt(editDurationMinInput, 10);

      if (isNaN(parsedDuration) || editDurationMinInput.trim() === '') {
        normalizedDuration = defaultDurationMin;
        setDurationFeedback(`Invalid duration. Reset to default (${defaultDurationMin} minutes).`);
        setEditDurationMinInput(String(defaultDurationMin));
      } else {
        const clamped = Math.max(minDurationMin, Math.min(maxDurationMin, parsedDuration));

        if (clamped !== parsedDuration) {
          setDurationFeedback(
            `Duration must be between ${minDurationMin} and ${maxDurationMin} minutes. Adjusted to ${clamped}.`
          );
          setEditDurationMinInput(String(clamped));
        } else {
          setDurationFeedback('');
        }

        normalizedDuration = clamped;
      }

      body.durationMin = normalizedDuration;


      await apiFetchJson(`/todos/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await fetchTask();
      fetchHistory(historyLimit, 0, false);
      setIsEditing(false);
      setDurationFeedback('');
      addNotification('success', 'Task saved', 'The task has been updated successfully.', editTitle, task.id);
    } catch (e: any) {
      addNotification('error', 'Save failed', e?.message || 'Failed to save changes', editTitle, task.id);
    } finally {
      setSaving(false);
    }
  };

  // Notify other pages (calendar/task list) about updates
  const notifyUpdate = (action: string) => {
    localStorage.setItem('todoUpdate', JSON.stringify({ timestamp: Date.now(), action }));
  };

  const handleStageChange = async () => {
    if (!task) return;
    const currentStage = (task.stageKey ?? DEFAULT_TASK_STAGE_KEY) as TaskStageKey;
    if (selectedStage === currentStage) return;

    if (
      !confirm(
        `Change stage from ${STAGE_LABELS[currentStage]} to ${STAGE_LABELS[selectedStage]}?`
      )
    ) {
      return;
    }

    setStageSaving(true);
    try {
      await apiFetchJson(`/todos/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stageKey: selectedStage }),
      });
      await fetchTask();
      fetchHistory(historyLimit, 0, false);
      notifyUpdate('stage');
      addNotification(
        'success',
        'Stage updated',
        `${task.title} is now ${STAGE_LABELS[selectedStage]}.`,
        task.title,
        task.id,
      );
    } catch (e: any) {
      addNotification(
        'error',
        'Stage change failed',
        e?.message || 'Could not change stage',
        task.title,
        task.id,
      );
    } finally {
      setStageSaving(false);
    }
  };

  // Schedule task (via ScheduleModal onSave)
  const handleSchedule = async (startAt: string, durationMin: number, description?: string): Promise<{ success: boolean; conflictError?: boolean }> => {
    if (!task) return { success: false };

    try {
      const body: any = { startAt, durationMin };

      // If description is provided, also update task description
      if (description !== undefined) {
        // First update task details
        await apiFetchJson(`/todos/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ description: description || null }),
        });
      }

      // Then schedule
      await apiFetchJson(`/todos/${task.id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await fetchTask();
      fetchHistory(historyLimit, 0, false);
      notifyUpdate('schedule');
      addNotification('success', 'Task scheduled', 'The task has been scheduled successfully.', task.title, task.id);
      return { success: true };
    } catch (e: any) {
      if (e?.status === 409) {
        return { success: false, conflictError: true };
      }
      addNotification('error', 'Schedule failed', e?.message || 'Failed to schedule task', task.title, task.id);
      return { success: false };
    }
  };

  // Unschedule task
  const handleUnschedule = async () => {
    if (!task) return;

    try {
      await apiFetchJson(`/todos/${task.id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({
          startAt: null,
        }),
      });
      await fetchTask();
      fetchHistory(historyLimit, 0, false);
      notifyUpdate('unschedule');
      addNotification('success', 'Task unscheduled', 'The schedule has been removed from the task.', task.title, task.id);
    } catch (e: any) {
      addNotification('error', 'Unschedule failed', e?.message || 'Failed to unschedule task', task.title, task.id);
    }
  };

  // Toggle done status
  const handleToggleDone = async () => {
    if (!task) return;

    try {
      await apiFetchJson(`/todos/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: !task.done }),
      });
      await fetchTask();
      fetchHistory(historyLimit, 0, false);
      const message = task.done ? 'Task marked as active' : 'Task marked as done';
      addNotification('success', message, undefined, task.title, task.id);
    } catch (e: any) {
      addNotification('error', 'Update failed', e?.message || 'Failed to update task', task.title, task.id);
    }
  };

  // Delete task
  const handleDelete = async () => {
    if (!task || !confirm('Delete this task? This cannot be undone.')) return;

    try {
      await apiFetchJson(`/todos/${task.id}`, { method: 'DELETE' });
      addNotification('success', 'Task deleted', 'The task has been permanently deleted.', task.title, task.id);
      router.push('/');
    } catch (e: any) {
      addNotification('error', 'Delete failed', e?.message || 'Failed to delete task', task.title, task.id);
    }
  };

  // Upload attachment - file selection handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size: 20MB = 20 * 1024 * 1024 bytes
      const maxSize = 20 * 1024 * 1024;
      if (file.size > maxSize) {
        addNotification('error', 'File too large', `The file exceeds the maximum size of 20MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`, task?.title, task?.id);
        // Clear the input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      setSelectedFile(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Check file size: 20MB = 20 * 1024 * 1024 bytes
      const maxSize = 20 * 1024 * 1024;
      if (file.size > maxSize) {
        addNotification('error', 'File too large', `The file exceeds the maximum size of 20MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`, task?.title, task?.id);
        return;
      }
      setSelectedFile(file);
    }
  };

  // Upload file to server
  const handleUploadClick = async () => {
    if (!selectedFile || !task) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }

      const response = await fetch(`${API_BASE_URL}/attachments/todo/${task.id}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Upload failed');
      }

      await fetchAttachments();
      fetchHistory(historyLimit, 0, false);
      addNotification('success', 'File uploaded', 'The attachment has been uploaded successfully.', task.title, task.id);

      // Reset file selection and input on success
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (e: any) {
      addNotification('error', 'Upload failed', e?.message || 'Failed to upload file', task.title, task.id);

      // Reset file selection and input on error to allow immediate retry
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setUploading(false);
    }
  };

  // Delete attachment
  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Delete this attachment?')) return;

    try {
      await apiFetchJson(`/attachments/${attachmentId}`, { method: 'DELETE' });
      await fetchAttachments();
      fetchHistory(historyLimit, 0, false);
      addNotification('success', 'Attachment deleted', 'The attachment has been deleted.', task?.title, task?.id);
    } catch (e: any) {
      addNotification('error', 'Delete failed', e?.message || 'Failed to delete attachment', task?.title, task?.id);
    }
  };

  // Download attachment
  const handleDownload = (attachment: Attachment) => {
    window.open(`${API_BASE_URL}/attachments/${attachment.id}/download`, '_blank');
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Fetch remarks
  const fetchRemarks = async (limit: number, offset: number, append = false) => {
    if (!taskId) return;

    try {
      const data = await apiFetchJson(`/remarks/todo/${taskId}?limit=${limit}&offset=${offset}`);
      if (append) {
        setRemarks(prev => [...prev, ...data.items]);
      } else {
        setRemarks(data.items);
      }
      setRemarksHasMore(data.hasMore);
      setRemarksOffset(offset);
    } catch (e: any) {
      // Silent fail for remarks
    }
  };

  // Add remark
  const handleAddRemark = async () => {
    if (!task || !newRemarkContent.trim()) return;

    setAddingRemark(true);
    try {
      await apiFetchJson(`/remarks/todo/${task.id}`, {
        method: 'POST',
        body: JSON.stringify({ content: newRemarkContent.trim() }),
      });
      setNewRemarkContent('');
      await fetchRemarks(remarksLimit, 0, false);
      addNotification('success', 'Remark added', 'Your remark has been added.', task.title, task.id);
    } catch (e: any) {
      addNotification('error', 'Failed to add remark', e?.message || 'Could not add remark', task.title, task.id);
    } finally {
      setAddingRemark(false);
    }
  };

  // Delete remark
  const handleDeleteRemark = async (remarkId: string) => {
    if (!confirm('Delete this remark?')) return;

    try {
      await apiFetchJson(`/remarks/${remarkId}`, { method: 'DELETE' });
      await fetchRemarks(remarksLimit, 0, false);
      addNotification('success', 'Remark deleted', 'The remark has been deleted.', task?.title, task?.id);
    } catch (e: any) {
      addNotification('error', 'Delete failed', e?.message || 'Failed to delete remark', task?.title, task?.id);
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // ignore
    } finally {
      setMe(null);
      router.push('/');
    }
  };

  const currentStageKey = (task?.stageKey ?? DEFAULT_TASK_STAGE_KEY) as TaskStageKey;

  if (authLoading) {
    return null;
  }

  if (!me) {
    return null;
  }

  return (
    <Layout currentPage="home" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0',
          background: 'none',
          border: 'none',
          color: '#64748b',
          fontSize: 14,
          cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        <span>&#8592;</span> Back
      </button>

      {loading ? (
        <div style={{ color: '#64748b' }}>Loading...</div>
      ) : error ? (
        <div style={{ color: '#dc2626' }}>{error}</div>
      ) : task ? (
        <div style={{ width: '100%' }}>
          {/* Task Header */}
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: 24,
          }}>
            {isEditing ? (
              <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                    Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      fontSize: 16,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                    Category
                  </label>
                  <select
                    value={editCategory || ''}
                    onChange={(e) => setEditCategory(e.target.value || null)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      fontSize: 14,
                      boxSizing: 'border-box',
                      background: 'white',
                    }}
                  >
                    <option value="">No category</option>
                    {getCategoryNames().map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                {task && !task.startAt && (
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={editDurationMinInput}
                      onChange={(e) => {
                        // Allow free typing, including empty string
                        setEditDurationMinInput(e.target.value);

                        // Clear feedback if value becomes valid and in range
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
                            setEditDurationMinInput(String(clamped));
                          } else {
                            setDurationFeedback('');
                          }
                        } else if (e.target.value.trim() === '') {
                          setDurationFeedback(`Invalid duration. Reset to default (${defaultDurationMin} minutes).`);
                          setEditDurationMinInput(String(defaultDurationMin));
                        }
                      }}
                      min={minDurationMin}
                      max={maxDurationMin}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: 14,
                        boxSizing: 'border-box',
                      }}
                      title={`Duration (${minDurationMin}-${maxDurationMin} min)`}
                    />
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
                )}
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                    Description
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    maxLength={500}
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      fontSize: 14,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Add a description..."
                  />
                  <div style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: editDescription.length > 450 ? '#f59e0b' : '#94a3b8',
                    textAlign: 'right',
                  }}>
                    {editDescription.length}/500 characters
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#3b82f6',
                      color: 'white',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditTitle(task.title);
                      setEditDescription(task.description || '');
                      setEditCategory(task.category || null);
                      setEditDurationMinInput(String(task.durationMin || defaultDurationMin));
                      setDurationFeedback('');
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        background: task.done ? '#dcfce7' : '#fef3c7',
                        color: task.done ? '#166534' : '#92400e',
                        fontSize: 13,
                        fontWeight: 500,
                      }}>
                        {task.done ? 'Completed' : 'Active'}
                      </span>
                      <h1 style={{
                        fontSize: 24,
                        fontWeight: 600,
                        margin: 0,
                        textDecoration: task.done ? 'line-through' : 'none',
                        color: task.done ? '#94a3b8' : '#1e293b',
                      }}>
                        {task.title}
                      </h1>
                    </div>
                    {task.category && (
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 12,
                        background: getCategoryColor(task.category),
                        color: 'white',
                        fontSize: 12,
                        fontWeight: 500,
                      }}>
                        {task.category}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => setIsEditing(true)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Edit
                    </button>
                    {task.startAt ? (
                      <button
                        onClick={handleUnschedule}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid #e2e8f0',
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Unschedule
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowScheduleModal(true)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#8b5cf6',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Schedule
                      </button>
                    )}
                    <button
                      onClick={handleToggleDone}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: task.done ? '#f59e0b' : '#10b981',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      {task.done ? 'Mark Incomplete' : 'Mark Complete'}
                    </button>
                    <button
                      onClick={handleDelete}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: '#dc2626',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {renderStageBadge(currentStageKey)}
                      <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
                        {STAGE_LABELS[currentStageKey]}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      Stage changes are manual and informational.
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <label htmlFor="stage-selector" style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>
                      Stage
                    </label>
                    <select
                      id="stage-selector"
                      value={selectedStage}
                      onChange={(e) => setSelectedStage(e.target.value as TaskStageKey)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: 13,
                        background: 'white',
                        minWidth: 160,
                      }}
                    >
                      {TASK_STAGE_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {STAGE_LABELS[key]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleStageChange}
                      disabled={
                        stageSaving ||
                        !task ||
                        selectedStage === currentStageKey
                      }
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background:
                          stageSaving || !task || selectedStage === currentStageKey
                            ? '#94a3b8'
                            : '#2563eb',
                        color: 'white',
                        cursor:
                          stageSaving || !task || selectedStage === currentStageKey
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: 13,
                      }}
                    >
                      {stageSaving ? 'Saving...' : 'Update stage'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* LEFT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Task Details */}
              <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 16 }}>Details</h2>

                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span style={{ width: 100, color: '#64748b', fontSize: 14 }}>Created:</span>
                    <span style={{ fontSize: 14 }}>{formatDateTime(task.createdAt)}</span>
                  </div>

                  {task.updatedAt && (
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span style={{ width: 100, color: '#64748b', fontSize: 14 }}>Updated:</span>
                      <span style={{ fontSize: 14 }}>{formatDateTime(task.updatedAt)}</span>
                    </div>
                  )}

                  {task.durationMin && (
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span style={{ width: 100, color: '#64748b', fontSize: 14 }}>Duration:</span>
                      <span style={{ fontSize: 14 }}>{task.durationMin} minutes</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <span style={{ width: 100, color: '#64748b', fontSize: 14 }}>Description:</span>
                    <span
                      style={{
                        fontSize: 14,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        color: task.description ? '#1e293b' : '#94a3b8',
                      }}
                    >
                      {task.description ? task.description : 'No description'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attachments */}
              <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 16 }}>
                    Attachments ({attachments.length})
                  </h2>

                  {/* Drag & Drop Upload Area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    style={{
                      border: `2px dashed ${isDraggingOver ? '#3b82f6' : '#cbd5e1'}`,
                      borderRadius: 8,
                      padding: 32,
                      textAlign: 'center',
                      background: isDraggingOver ? '#eff6ff' : '#f8fafc',
                      transition: 'all 0.2s ease',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ marginBottom: 12, fontSize: 40 }}>📎</div>
                    <div style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>
                      {selectedFile ? (
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>
                          {selectedFile.name}
                        </span>
                      ) : (
                        <>
                          Drag & drop your file here, or{' '}
                          <label style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}>
                            browse
                            <input
                              ref={fileInputRef}
                              type="file"
                              onChange={handleFileSelect}
                              disabled={uploading}
                              style={{ display: 'none' }}
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                      Supported formats: PDF, Images, ZIP, DOC, XLS, TXT
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      Maximum size: 20MB
                    </div>
                  </div>

                  {/* Upload Button */}
                  <button
                    onClick={handleUploadClick}
                    disabled={!selectedFile || uploading}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: (!selectedFile || uploading) ? '#cbd5e1' : '#3b82f6',
                      color: 'white',
                      cursor: (!selectedFile || uploading) ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                      transition: 'background 0.2s ease',
                    }}
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>

                {attachments.length === 0 ? (
                  <p style={{ color: '#94a3b8', margin: 0, fontSize: 14 }}>
                    No attachments yet
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {attachments.slice(0, attachmentsLimit).map((attachment) => {
                        const stageBadge = renderStageBadge(attachment.stageKeyAtCreation);
                        return (
                          <div
                            key={attachment.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 12,
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 40,
                              height: 40,
                              borderRadius: 8,
                              background: '#f1f5f9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                            }}>
                              {attachment.mimeType.startsWith('image/') ? '🖼' :
                               attachment.mimeType.includes('pdf') ? '📄' :
                               attachment.mimeType.includes('zip') ? '📦' : '📎'}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 500 }}>{attachment.filename}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>
                                {attachment.mimeType} - {formatFileSize(attachment.size)} - {formatDateTime(attachment.createdAt)}
                              </div>
                              {stageBadge && (
                                <div style={{ marginTop: 6 }}>
                                  {stageBadge}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => handleDownload(attachment)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                cursor: 'pointer',
                                fontSize: 12,
                              }}
                            >
                              Download
                            </button>
                            <button
                              onClick={() => handleDeleteAttachment(attachment.id)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: 'none',
                                background: '#fee2e2',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: 12,
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>Show:</span>
                      <select
                        value={attachmentsLimit}
                        onChange={(e) => setAttachmentsLimit(Number(e.target.value))}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid #e2e8f0',
                          fontSize: 13,
                          background: 'white',
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Remarks */}
              <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 16 }}>
                  Remarks ({remarks.length})
                </h2>

                {/* Add Remark Form */}
                <div style={{ marginBottom: 16 }}>
                  <textarea
                    value={newRemarkContent}
                    onChange={(e) => setNewRemarkContent(e.target.value)}
                    maxLength={150}
                    rows={2}
                    placeholder="Add a remark..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      fontSize: 14,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{
                      fontSize: 12,
                      color: newRemarkContent.length > 130 ? '#f59e0b' : '#94a3b8',
                    }}>
                      {newRemarkContent.length}/150 characters
                    </div>
                    <button
                      onClick={handleAddRemark}
                      disabled={addingRemark || !newRemarkContent.trim()}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        border: 'none',
                        background: (!newRemarkContent.trim() || addingRemark) ? '#cbd5e1' : '#3b82f6',
                        color: 'white',
                        cursor: (!newRemarkContent.trim() || addingRemark) ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                      }}
                    >
                      {addingRemark ? 'Adding...' : 'Add Remark'}
                    </button>
                  </div>
                </div>

                {/* Remarks List */}
                {remarks.length === 0 ? (
                  <p style={{ color: '#94a3b8', margin: 0, fontSize: 14 }}>
                    No remarks yet
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gap: 12,
                      maxHeight: '320px',
                      overflowY: 'auto',
                      paddingRight: 4,
                    }}
                  >
                    {remarks.map((remark) => {
                      const stageBadge = renderStageBadge(remark.stageKeyAtCreation);
                      return (
                        <div
                        key={remark.id}
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          minWidth: 0,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {formatDateTime(remark.createdAt)}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              Written by {remark.authorEmail || remark.userId}
                            </div>
                            {stageBadge && (
                              <div style={{ marginTop: 6 }}>
                                {stageBadge}
                              </div>
                            )}
                          </div>
                          {remark.userId === me.userId && (
                            <button
                              onClick={() => handleDeleteRemark(remark.id)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: 'none',
                                background: '#fee2e2',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: 11,
                                flexShrink: 0,
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <p style={{
                          margin: 0,
                          fontSize: 14,
                          color: '#1e293b',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}>
                          {remark.content}
                        </p>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Load More */}
                {remarksHasMore && (
                  <button
                    onClick={() => fetchRemarks(remarksLimit, remarksOffset + remarksLimit, true)}
                    style={{
                      marginTop: 16,
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: 13,
                      width: '100%',
                    }}
                  >
                    Load More
                  </button>
                )}
              </div>

              {/* History Timeline */}
              <div style={{
                background: 'white',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                    History
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>Show:</span>
                    <select
                      value={historyLimit}
                      onChange={(e) => setHistoryLimit(Number(e.target.value))}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid #e2e8f0',
                        fontSize: 13,
                        background: 'white',
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                {history.length === 0 ? (
                  <p style={{ color: '#94a3b8', margin: 0, fontSize: 14 }}>
                    No history recorded
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {history.map((entry) => {
                      const actionMap: Record<string, { label: string; color: string; icon: string }> = {
                        'todo.create': { label: 'Created', color: '#10b981', icon: '✨' },
                        'todo.update': { label: 'Updated', color: '#3b82f6', icon: '✏️' },
                        'todo.schedule': { label: 'Scheduled', color: '#8b5cf6', icon: '📅' },
                        'todo.unschedule': { label: 'Unscheduled', color: '#f97316', icon: '📤' },
                        'todo.delete': { label: 'Deleted', color: '#dc2626', icon: '🗑️' },
                        'todo.bulk_update': { label: 'Bulk updated', color: '#3b82f6', icon: '📝' },
                      };
                      const actionInfo = actionMap[entry.action] || { label: entry.action, color: '#64748b', icon: '📋' };
                      const descChange = (entry as any)?.details?.changes?.description;
                      const formatDesc = (val: any) => {
                        if (val === null || val === undefined || val === '') return 'None';
                        const text = String(val);
                        return text.length > 120 ? `${text.slice(0, 117)}...` : text;
                      };

                      return (
                        <div
                          key={entry.id}
                          style={{
                            display: 'flex',
                            gap: 12,
                            padding: 12,
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: '#f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {actionInfo.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{
                                fontWeight: 500,
                                fontSize: 14,
                                color: actionInfo.color,
                              }}>
                                {actionInfo.label}
                              </span>
                              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                {formatDateTime(entry.createdAt)}
                              </span>
                            </div>
                            {entry.details && Object.keys(entry.details).length > 0 && (
                              <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>
                                {entry.details.title && <span>Title: {entry.details.title}</span>}
                                {entry.details.startAt && <span> • At: {formatDateTime(entry.details.startAt)}</span>}
                                {entry.details.durationMin && <span> • {entry.details.durationMin} min</span>}
                                {entry.details.category && <span> • Category: {entry.details.category}</span>}
                                {entry.details.done !== undefined && <span> • Done: {entry.details.done ? 'Yes' : 'No'}</span>}
                                {descChange && (
                                  <span> • Description: {formatDesc(descChange.from)} → {formatDesc(descChange.to)}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {historyHasMore && (
                      <button
                        onClick={() => {
                          const newOffset = historyOffset + historyLimit;
                          setHistoryOffset(newOffset);
                          fetchHistory(historyLimit, newOffset, true);
                        }}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 6,
                          border: '1px solid #e2e8f0',
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#3b82f6',
                          textAlign: 'center',
                          marginTop: 8,
                        }}
                      >
                        Load More
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={showScheduleModal}
        currentStartAt={task?.startAt || null}
        currentDurationMin={task?.durationMin || null}
        currentDescription={task?.description || null}
        taskId={task?.id || null}
        events={scheduledEvents}
        workingHours={settings.workingHours}
        workingDays={settings.workingDays}
        onSave={handleSchedule}
        onClose={() => setShowScheduleModal(false)}
      />

      {/* Notification Toast */}
      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </Layout>
  );
}
