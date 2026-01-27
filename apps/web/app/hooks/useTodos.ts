'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetchJson, isUnauthorized, isNetworkError } from '../lib/api';

export type Todo = {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  done: boolean;
  createdAt: string;
  updatedAt?: string;
  startAt?: string | null;
  durationMin?: number | null;
  category?: string | null;
  stageKey?: string | null;
  unscheduledAt?: string | null;
  isPinned?: boolean;
};

export type Filter = 'all' | 'active' | 'done';
export type SortDir = 'asc' | 'desc';
export type DateFilter = 'all' | 'today' | 'this_week' | 'custom';

export type TodosState = {
  todos: Todo[];
  loading: boolean;
  error: string | null;
};

type UseTodosOptions = {
  userId: string | null;
  filter?: Filter;
  sortDir?: SortDir;
  dateFilter?: DateFilter;
  customDateRange?: { start: string; end: string } | null;
  onUnauthorized?: () => void;
};

export type TodosActions = {
  refresh: () => Promise<void>;
  addTodo: (title: string, category?: string, durationMin?: number, description?: string) => Promise<boolean>;
  toggleTodo: (todo: Todo) => Promise<boolean>;
  updateTodo: (todoId: string, title: string, category?: string | null, durationMin?: number, description?: string | null, isPinned?: boolean) => Promise<boolean>;
  deleteTodo: (todoId: string) => Promise<boolean>;
  scheduleTodo: (todoId: string, startAt: string, durationMin: number) => Promise<{ success: boolean; conflictError?: boolean }>;
  unscheduleTodo: (todoId: string) => Promise<boolean>;
  bulkMarkDone: (ids: string[], done: boolean) => Promise<boolean>;
  bulkChangeCategory: (ids: string[], category: string | null) => Promise<boolean>;
  bulkDelete: (ids: string[]) => Promise<boolean>;
  clearError: () => void;
};

// Notify other pages about todo updates
function notifyTodoUpdate(action: string) {
  localStorage.setItem('todoUpdate', JSON.stringify({ timestamp: Date.now(), action }));
}

export function useTodos(options: UseTodosOptions): TodosState & TodosActions {
  const { userId, filter = 'all', sortDir = 'desc', dateFilter = 'all', customDateRange, onUnauthorized } = options;

  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleError = useCallback((e: any, defaultMessage: string): boolean => {
    if (isUnauthorized(e)) {
      onUnauthorized?.();
      setError('Session expired. Please login again.');
      return true;
    }
    if (isNetworkError(e)) {
      setError('API not reachable. Is the API container running?');
      return true;
    }
    setError(e?.message || defaultMessage);
    return false;
  }, [onUnauthorized]);

  const refresh = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      // Build query string
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('sortDir', sortDir);

      if (filter === 'active') {
        params.set('done', 'false');
      } else if (filter === 'done') {
        params.set('done', 'true');
      }

      // Date filter logic
      if (dateFilter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        params.set('createdAfter', today.toISOString());
      } else if (dateFilter === 'this_week') {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        params.set('createdAfter', startOfWeek.toISOString());
      } else if (dateFilter === 'custom' && customDateRange) {
        if (customDateRange.start) {
          const startDate = new Date(customDateRange.start);
          startDate.setHours(0, 0, 0, 0);
          params.set('createdAfter', startDate.toISOString());
        }
        if (customDateRange.end) {
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          params.set('createdBefore', endDate.toISOString());
        }
      }

      const qs = `/todos?${params.toString()}`;
      const todosJson = await apiFetchJson(qs);
      setTodos(Array.isArray(todosJson) ? todosJson : []);
    } catch (e: any) {
      handleError(e, 'Failed to fetch todos');
    } finally {
      setLoading(false);
    }
  }, [userId, filter, sortDir, dateFilter, customDateRange, handleError]);

  const addTodo = useCallback(async (title: string, category?: string, durationMin?: number, description?: string): Promise<boolean> => {
    if (!userId) {
      setError('Please login first.');
      return false;
    }

    const t = title.trim();
    if (!t) return false;

    setError(null);
    try {
      await apiFetchJson('/todos', {
        method: 'POST',
        body: JSON.stringify({
          title: t,
          category: category || undefined,
          durationMin: durationMin || undefined,
          description: description || undefined,
        }),
      });
      await refresh();
      notifyTodoUpdate('create');
      return true;
    } catch (e: any) {
      handleError(e, 'Create failed');
      return false;
    }
  }, [userId, refresh, handleError]);

  const toggleTodo = useCallback(async (todo: Todo): Promise<boolean> => {
    setError(null);
    try {
      await apiFetchJson(`/todos/${todo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: !todo.done }),
      });
      await refresh();
      notifyTodoUpdate('update');
      return true;
    } catch (e: any) {
      handleError(e, 'Update failed');
      return false;
    }
  }, [refresh, handleError]);

  const updateTodo = useCallback(async (todoId: string, title: string, category?: string | null, durationMin?: number, description?: string | null, isPinned?: boolean): Promise<boolean> => {
    const t = title.trim();
    if (!t) {
      setError('Title cannot be empty.');
      return false;
    }

    setError(null);
    try {
      const body: any = {
        title: t,
        // Explicitly send null when category is empty string or null to clear category
        // Send the category value when it's a non-empty string
        category: category === '' || category === null ? null : category
      };

      // Only include durationMin if provided (for unscheduled tasks)
      if (durationMin !== undefined) {
        body.durationMin = durationMin;
      }

      // Include description if provided
      if (description !== undefined) {
        body.description = description === '' ? null : description;
      }

      // Include isPinned if provided
      if (isPinned !== undefined) {
        body.isPinned = isPinned;
      }

      await apiFetchJson(`/todos/${todoId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await refresh();
      notifyTodoUpdate('update');
      return true;
    } catch (e: any) {
      handleError(e, 'Update failed');
      return false;
    }
  }, [refresh, handleError]);

  const deleteTodo = useCallback(async (todoId: string): Promise<boolean> => {
    setError(null);
    try {
      await apiFetchJson(`/todos/${todoId}`, { method: 'DELETE' });
      await refresh();
      notifyTodoUpdate('delete');
      return true;
    } catch (e: any) {
      handleError(e, 'Delete failed');
      return false;
    }
  }, [refresh, handleError]);

  const scheduleTodo = useCallback(async (
    todoId: string,
    startAt: string,
    durationMin: number
  ): Promise<{ success: boolean; conflictError?: boolean }> => {
    setError(null);
    try {
      await apiFetchJson(`/todos/${todoId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({
          startAt,
          durationMin,
        }),
      });
      await refresh();
      notifyTodoUpdate('schedule');
      return { success: true };
    } catch (e: any) {
      if (e?.status === 409) {
        return { success: false, conflictError: true };
      }
      handleError(e, 'Failed to schedule');
      return { success: false };
    }
  }, [refresh, handleError]);

  const unscheduleTodo = useCallback(async (todoId: string): Promise<boolean> => {
    setError(null);
    try {
      await apiFetchJson(`/todos/${todoId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({
          startAt: null,
        }),
      });
      await refresh();
      notifyTodoUpdate('unschedule');
      return true;
    } catch (e: any) {
      handleError(e, 'Failed to unschedule');
      return false;
    }
  }, [refresh, handleError]);

  const bulkMarkDone = useCallback(async (ids: string[], done: boolean): Promise<boolean> => {
    if (ids.length === 0) return false;
    setError(null);
    try {
      await apiFetchJson('/todos/bulk/done', {
        method: 'POST',
        body: JSON.stringify({ ids, done }),
      });
      await refresh();
      notifyTodoUpdate('bulk-update');
      return true;
    } catch (e: any) {
      handleError(e, 'Bulk update failed');
      return false;
    }
  }, [refresh, handleError]);

  const bulkChangeCategory = useCallback(async (ids: string[], category: string | null): Promise<boolean> => {
    if (ids.length === 0) return false;
    setError(null);
    try {
      await apiFetchJson('/todos/bulk/category', {
        method: 'POST',
        body: JSON.stringify({ ids, category }),
      });
      await refresh();
      notifyTodoUpdate('bulk-update');
      return true;
    } catch (e: any) {
      handleError(e, 'Bulk category update failed');
      return false;
    }
  }, [refresh, handleError]);

  const bulkDelete = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false;
    setError(null);
    try {
      await apiFetchJson('/todos/bulk/delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      await refresh();
      notifyTodoUpdate('bulk-delete');
      return true;
    } catch (e: any) {
      handleError(e, 'Bulk delete failed');
      return false;
    }
  }, [refresh, handleError]);

  // Fetch todos when userId, filter, sortDir, or date filter changes
  useEffect(() => {
    if (userId) {
      refresh();
    } else {
      setTodos([]);
    }
  }, [userId, filter, sortDir, dateFilter, customDateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for updates from other pages
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'todoUpdate' && userId) {
        refresh();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [userId, refresh]);

  return {
    todos,
    loading,
    error,
    refresh,
    addTodo,
    toggleTodo,
    updateTodo,
    deleteTodo,
    scheduleTodo,
    unscheduleTodo,
    bulkMarkDone,
    bulkChangeCategory,
    bulkDelete,
    clearError,
  };
}
