'use client';

import { useState, useCallback } from 'react';

export type UseModalReturn<T = undefined> = {
  isOpen: boolean;
  data: T | null;
  open: (data?: T) => void;
  close: () => void;
  toggle: () => void;
};

/**
 * Generic hook for managing modal state
 * @template T - The type of data associated with the modal
 */
export function useModal<T = undefined>(initialOpen = false): UseModalReturn<T> {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState<T | null>(null);

  const open = useCallback((modalData?: T) => {
    setData(modalData ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
  };
}

// Specific modal state type for schedule modal
export type ScheduleModalData = {
  todoId: string;
  currentStartAt?: string | null;
  currentDurationMin?: number | null;
};

// Specific modal state type for confirm modal
export type ConfirmModalData = {
  title: string;
  message: string;
  taskTitle?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
};
