'use client';

import { useState, useCallback } from 'react';
import Layout from './components/Layout';
import LoginForm from './components/LoginForm';
import ForcePasswordChange from './components/ForcePasswordChange';
import TaskFilters from './components/TaskFilters';
import TasksTable from './components/TasksTable';
import ScheduleModal from './components/ScheduleModal';
import NotificationToast, { type Notification } from './components/NotificationToast';
import ConfirmModal from './components/ConfirmModal';
import BulkActionsBar from './components/BulkActionsBar';
import CreateTaskModal from './components/CreateTaskModal';
import { useAuth } from './hooks/useAuth';
import { useTodos, type Filter, type SortDir, type DateFilter, type Todo } from './hooks/useTodos';
import { useModal, type ScheduleModalData, type ConfirmModalData } from './hooks/useModal';
import { useScheduledEvents } from './hooks/useScheduledEvents';
import { useSettings } from './hooks/useSettings';

export default function Home() {
  // Auth state
  const auth = useAuth();

  // Filter and sort state
  const [filter, setFilter] = useState<Filter>('all');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string } | null>(null);

  // Todos state
  const todos = useTodos({
    userId: auth.me?.userId ?? null,
    filter,
    sortDir,
    dateFilter,
    customDateRange,
    onUnauthorized: () => {
      // Auth hook will handle this
    },
  });

  // Modal states
  const createModal = useModal();
  const scheduleModal = useModal<ScheduleModalData>();
  const confirmModal = useModal<ConfirmModalData>();

  // Availability data for schedule suggestions
  const scheduledEvents = useScheduledEvents(auth.me?.userId ?? null);
  const { settings } = useSettings(auth.me?.userId ?? null);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Local search state
  const [localSearch, setLocalSearch] = useState('');

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

  // Handlers
  const handleSchedule = useCallback((
    todoId: string,
    currentStartAt?: string | null,
    currentDurationMin?: number | null
  ) => {
    scheduleModal.open({ todoId, currentStartAt, currentDurationMin });
  }, [scheduleModal]);

  const handleSaveSchedule = useCallback(async (startAt: string, durationMin: number, description?: string) => {
    if (!scheduleModal.data?.todoId) {
      return { success: false };
    }
    const result = await todos.scheduleTodo(scheduleModal.data.todoId, startAt, durationMin);
    if (result.success) {
      const task = todos.todos.find(t => t.id === scheduleModal.data?.todoId);
      addNotification('success', 'Task scheduled', 'The task has been scheduled successfully.', task?.title, scheduleModal.data?.todoId);
    }
    return result;
  }, [scheduleModal.data, todos, addNotification]);

  const handleConfirmUnschedule = useCallback((todoId: string, todoTitle: string) => {
    confirmModal.open({
      title: 'Unschedule Task',
      message: 'This will remove the schedule from the task but keep the task itself. The task will remain in your task list as unscheduled.',
      taskTitle: todoTitle,
      variant: 'warning',
      onConfirm: async () => {
        confirmModal.close();
        const success = await todos.unscheduleTodo(todoId);
        if (success) {
          addNotification('success', 'Task unscheduled', 'The schedule has been removed from the task.', todoTitle, todoId);
        } else {
          addNotification('error', 'Unschedule failed', todos.error || 'Failed to remove schedule', todoTitle, todoId);
        }
      },
    });
  }, [confirmModal, todos, addNotification]);

  const handleConfirmDelete = useCallback((todoId: string, todoTitle: string) => {
    confirmModal.open({
      title: 'Delete Task',
      message: 'Are you sure you want to permanently delete this task? This action cannot be undone.',
      taskTitle: todoTitle,
      variant: 'danger',
      onConfirm: async () => {
        confirmModal.close();
        const success = await todos.deleteTodo(todoId);
        if (success) {
          addNotification('success', 'Task deleted', 'The task has been permanently deleted.', todoTitle, todoId);
        } else {
          addNotification('error', 'Delete failed', todos.error || 'Failed to delete task', todoTitle, todoId);
        }
      },
    });
  }, [confirmModal, todos, addNotification]);

  // Bulk action handlers
  const handleBulkMarkDone = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const success = await todos.bulkMarkDone(ids, true);
    if (success) {
      addNotification('success', 'Tasks completed', `${ids.length} task(s) marked as done.`);
      setSelectedIds(new Set());
    } else {
      addNotification('error', 'Bulk update failed', todos.error || 'Failed to mark tasks as done');
    }
  }, [selectedIds, todos, addNotification]);

  const handleBulkMarkNotDone = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const success = await todos.bulkMarkDone(ids, false);
    if (success) {
      addNotification('success', 'Tasks updated', `${ids.length} task(s) marked as not done.`);
      setSelectedIds(new Set());
    } else {
      addNotification('error', 'Bulk update failed', todos.error || 'Failed to update tasks');
    }
  }, [selectedIds, todos, addNotification]);

  const handleBulkChangeCategory = useCallback(async (category: string | null) => {
    const ids = Array.from(selectedIds);
    const success = await todos.bulkChangeCategory(ids, category);
    if (success) {
      addNotification('success', 'Category updated', `${ids.length} task(s) category changed.`);
      setSelectedIds(new Set());
    } else {
      addNotification('error', 'Bulk update failed', todos.error || 'Failed to change category');
    }
  }, [selectedIds, todos, addNotification]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    confirmModal.open({
      title: 'Delete Tasks',
      message: `Are you sure you want to permanently delete ${count} task(s)? This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        confirmModal.close();
        const ids = Array.from(selectedIds);
        const success = await todos.bulkDelete(ids);
        if (success) {
          addNotification('success', 'Tasks deleted', `${ids.length} task(s) permanently deleted.`);
          setSelectedIds(new Set());
        } else {
          addNotification('error', 'Bulk delete failed', todos.error || 'Failed to delete tasks');
        }
      },
    });
  }, [selectedIds, confirmModal, todos, addNotification]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleUpdateTask = useCallback(async (
    todoId: string,
    title: string,
    category?: string | null,
    durationMin?: number,
    description?: string | null
  ) => {
    const success = await todos.updateTodo(todoId, title, category, durationMin, description);
    if (success) {
      addNotification('success', 'Task saved', 'The task has been updated successfully.', title, todoId);
    }
    return success;
  }, [todos, addNotification]);

  const handleToggleTask = useCallback((todo: Todo) => {
    const originalState = todo.done;
    todos.toggleTodo(todo);
    const newState = !originalState;
    const message = newState ? 'Task marked as done' : 'Task marked as active';
    addNotification('success', message, undefined, todo.title, todo.id);
  }, [todos, addNotification]);

  const handleAddTask = useCallback(async (
    title: string,
    category?: string,
    durationMin?: number,
    description?: string
  ) => {
    const success = await todos.addTodo(title, category, durationMin, description);
    if (success) {
      addNotification('success', 'Task created', 'The task has been added successfully.', title);
    }
    return success;
  }, [todos, addNotification]);

  const handlePinTask = useCallback(async (todoId: string, isPinned: boolean) => {
    const task = todos.todos.find(t => t.id === todoId);
    const normalizedDuration = task?.durationMin ?? undefined;
    const success = await todos.updateTodo(
      todoId,
      task?.title || '',
      task?.category,
      normalizedDuration,
      task?.description,
      isPinned
    );
    if (success) {
      const message = isPinned ? 'Task pinned' : 'Task unpinned';
      addNotification('success', message, undefined, task?.title, todoId);
    }
    return success;
  }, [todos, addNotification]);

  // Don't render until initial auth check is complete
  if (auth.initialLoad) {
    return null;
  }

  // Show login form if not authenticated
  if (!auth.me) {
    return (
      <LoginForm
        onLogin={auth.login}
        onRegister={auth.register}
        onRequestReset={auth.requestPasswordReset}
        onResetPassword={auth.resetPasswordWithToken}
        error={auth.error}
        loading={auth.loading}
        onClearError={auth.clearError}
      />
    );
  }

  // Force password change if required
  if (auth.me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={auth.me.email}
        onChangePassword={auth.changePassword}
        error={auth.error}
      />
    );
  }

  // Combined error from auth or todos
  const error = auth.error || todos.error;

  const summary = todos.todos.reduce((acc, todo) => {
    acc.total += 1;
    if (todo.done) {
      acc.completed += 1;
    } else {
      acc.active += 1;
    }
    if (todo.startAt) {
      acc.scheduled += 1;
    }
    return acc;
  }, { total: 0, active: 0, completed: 0, scheduled: 0 });

  return (
    <>
      <Layout currentPage="home" userEmail={auth.me.email} userRole={auth.me.role} isAdmin={auth.me.isAdmin} onLogout={auth.logout}>
        {/* Error Messages */}
        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {/* Header Section */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
            My Tasks
          </h1>
          <p style={{ color: '#64748b', margin: 0 }}>
            Manage and organize your tasks efficiently
            {todos.loading && <span style={{ marginLeft: 8, fontSize: 13, color: '#3b82f6' }}>(Refreshing...)</span>}
          </p>
        </div>

        {/* Controls Section */}
        <div style={{
          background: 'white',
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: 24,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}>
            <button
              type="button"
              onClick={() => createModal.open()}
              style={{
                padding: '10px 18px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 10px 25px rgba(37,99,235,0.2)',
              }}
            >
              Create Task
            </button>
          </div>

          {/* Local Search */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Filter tasks by title or ID..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              style={{
                width: '100%',
                maxWidth: 400,
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>

          <TaskFilters
            filter={filter}
            sortDir={sortDir}
            dateFilter={dateFilter}
            customDateRange={customDateRange}
            onFilterChange={setFilter}
            onSortDirChange={setSortDir}
            onDateFilterChange={setDateFilter}
            onCustomDateRangeChange={setCustomDateRange}
          />
        </div>

        {/* Summary Panel */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Total tasks', value: summary.total, gradient: 'from-violet-600 to-indigo-500' },
            { label: 'Active', value: summary.active, gradient: 'from-blue-700 to-sky-500' },
            { label: 'Completed', value: summary.completed, gradient: 'from-cyan-600 to-blue-500' },
            { label: 'Scheduled', value: summary.scheduled, gradient: 'from-emerald-600 to-green-500' },
          ].map((item) => (
            <div
              key={item.label}
              className={[
                'relative overflow-hidden rounded-2xl p-5 text-white shadow-sm',
                'border border-white/10',
                'bg-gradient-to-br',
                item.gradient,
              ].join(' ')}
            >
              <div className="text-sm font-medium text-white/80">{item.label}</div>
              <div className="mt-2 text-4xl font-semibold tracking-tight">{item.value}</div>

              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10" />
            </div>
          ))}
        </div>

        {/* Tasks Table */}
        <TasksTable
          todos={(localSearch
            ? todos.todos.filter(t =>
                t.title.toLowerCase().includes(localSearch.toLowerCase()) ||
                t.id.toLowerCase().includes(localSearch.toLowerCase())
              )
            : todos.todos
          ).sort((a, b) => {
            // Pinned tasks first
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0;
          })}
          onToggle={handleToggleTask}
          onUpdate={handleUpdateTask}
          onSchedule={handleSchedule}
          onUnschedule={handleConfirmUnschedule}
          onDelete={handleConfirmDelete}
          onPin={handlePinTask}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          userId={auth.me?.userId ?? null}
        />

        {/* Bulk Actions Bar */}
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onMarkDone={handleBulkMarkDone}
          onMarkNotDone={handleBulkMarkNotDone}
          onChangeCategory={handleBulkChangeCategory}
          onDelete={handleBulkDelete}
          onClearSelection={handleClearSelection}
          userId={auth.me?.userId ?? null}
        />
      </Layout>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={createModal.isOpen}
        onClose={createModal.close}
        onCreate={handleAddTask}
        userId={auth.me?.userId ?? null}
      />

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={scheduleModal.isOpen}
        currentStartAt={scheduleModal.data?.currentStartAt}
        currentDurationMin={scheduleModal.data?.currentDurationMin}
        events={scheduledEvents}
        workingHours={settings.workingHours}
        workingDays={settings.workingDays}
        onSave={handleSaveSchedule}
        onClose={scheduleModal.close}
      />

      {/* Notification Toast */}
      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.data?.title || ''}
        message={confirmModal.data?.message || ''}
        taskTitle={confirmModal.data?.taskTitle}
        variant={confirmModal.data?.variant}
        onConfirm={confirmModal.data?.onConfirm || (() => {})}
        onCancel={confirmModal.close}
      />
    </>
  );
}
