'use client';

import { useCallback, useState } from 'react';
import {
  markBaselineReviewed,
  confirmBaseline as confirmBaselineApi,
} from '@/app/lib/api/baselines';
import { notifySuccess, notifyError } from '@/app/lib/notifications';
import type { Notification } from '@/app/components/NotificationToast';
import type { Baseline } from '../types';

interface UseBaselineActionsProps {
  baseline: Baseline | null;
  loadBaseline: () => Promise<void>;
  setBaseline: (b: Baseline | null) => void;
  setBaselineError: (e: string | null) => void;
  libraryFields: any[];
  pendingLocalValues: Record<string, string>;
  hasDraftTables: boolean;
  targetTaskId: string | null;
  addNotification: (n: Notification) => void;
}

export function useBaselineActions({
  baseline,
  loadBaseline,
  setBaseline,
  setBaselineError,
  libraryFields,
  pendingLocalValues,
  hasDraftTables,
  targetTaskId,
  addNotification,
}: UseBaselineActionsProps) {
  const [reviewingBaseline, setReviewingBaseline] = useState(false);
  const [confirmingBaseline, setConfirmingBaseline] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleMarkReviewed = useCallback(async () => {
    if (!baseline) return;

    const pendingFields = Object.keys(pendingLocalValues);
    if (pendingFields.length > 0) {
      const fieldLabels = pendingFields.map(fieldKey => {
        const field = libraryFields.find((f: any) => f.fieldKey === fieldKey);
        return field?.label || fieldKey;
      }).join(', ');
      addNotification(notifyError(
        'Cannot mark as reviewed',
        `You have unsaved changes in: ${fieldLabels}. Please save or fix validation errors first.`,
      ));
      return;
    }

    const invalidAssignments = baseline.assignments?.filter(a =>
      a.validation && !a.validation.valid
    ) || [];

    const emptyRequiredFields = libraryFields.filter((field: any) => {
      const assignment = baseline.assignments?.find(a => a.fieldKey === field.fieldKey);
      return !assignment || !assignment.assignedValue;
    });

    if (invalidAssignments.length > 0) {
      const fieldNames = invalidAssignments.map(a => a.fieldKey).join(', ');
      addNotification(notifyError('Cannot mark as reviewed', `Please fix validation errors in: ${fieldNames}`));
      return;
    }

    if (emptyRequiredFields.length > 0) {
      const fieldNames = emptyRequiredFields.map((f: any) => f.label || f.fieldKey).join(', ');
      addNotification(notifyError('Cannot mark as reviewed', `Please assign values to all fields. Missing: ${fieldNames}`));
      return;
    }

    setReviewingBaseline(true);
    setBaselineError(null);
    try {
      await markBaselineReviewed(baseline.id);
      await loadBaseline();
      addNotification(notifySuccess('Marked as reviewed', 'Baseline moved to reviewed.'));
    } catch (err: unknown) {
      const message = (err as Error)?.message || 'Unable to mark as reviewed';
      setBaselineError(message);
      addNotification(notifyError('Review failed', message));
    } finally {
      setReviewingBaseline(false);
    }
  }, [addNotification, baseline, loadBaseline, libraryFields, pendingLocalValues, setBaselineError]);

  const handleConfirmBaseline = useCallback(async () => {
    if (!baseline) return;

    if (hasDraftTables) {
      addNotification(notifyError('Cannot confirm baseline', 'Please confirm all tables before confirming baseline'));
      setIsConfirmModalOpen(false);
      return;
    }

    const invalidAssignments = baseline.assignments?.filter(a =>
      a.validation && !a.validation.valid
    ) || [];

    const emptyRequiredFields = libraryFields.filter((field: any) => {
      const assignment = baseline.assignments?.find(a => a.fieldKey === field.fieldKey);
      return !assignment || !assignment.assignedValue;
    });

    if (invalidAssignments.length > 0) {
      const fieldNames = invalidAssignments.map(a => a.fieldKey).join(', ');
      addNotification(notifyError('Cannot confirm baseline', `Please fix validation errors in: ${fieldNames}`));
      setIsConfirmModalOpen(false);
      return;
    }

    if (emptyRequiredFields.length > 0) {
      const fieldNames = emptyRequiredFields.map((f: any) => f.label || f.fieldKey).join(', ');
      addNotification(notifyError('Cannot confirm baseline', `Please assign values to all fields. Missing: ${fieldNames}`));
      setIsConfirmModalOpen(false);
      return;
    }

    setConfirmingBaseline(true);
    setBaselineError(null);
    try {
      const updated = await confirmBaselineApi(baseline.id);
      setBaseline(updated);
      setIsConfirmModalOpen(false);
      addNotification(notifySuccess('Baseline confirmed', 'Baseline locked and ready for use.'));
      if (targetTaskId) {
        setTimeout(() => {
          window.location.href = `/task/${targetTaskId}`;
        }, 800);
      }
    } catch (err: unknown) {
      const message = (err as Error)?.message || 'Unable to confirm baseline';
      setBaselineError(message);
      addNotification(notifyError('Confirm failed', message));
    } finally {
      setConfirmingBaseline(false);
    }
  }, [addNotification, baseline, hasDraftTables, targetTaskId, libraryFields, setBaseline, setBaselineError, loadBaseline]);

  return {
    reviewingBaseline,
    confirmingBaseline,
    isConfirmModalOpen,
    setIsConfirmModalOpen,
    handleMarkReviewed,
    handleConfirmBaseline,
  };
}
