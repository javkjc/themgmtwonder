'use client';

import { useCallback, useState } from 'react';
import { upsertAssignment, deleteAssignment, generateSuggestions } from '@/app/lib/api/baselines';
import { notifySuccess, notifyError } from '@/app/lib/notifications';
import type { Notification } from '@/app/components/NotificationToast';
import type {
  Baseline,
  AssignPayload,
  DeleteAssignmentPayload,
  ResetLocalField,
  CorrectionPendingAction,
  ValidationPendingAction,
  FieldChangeLogEntry,
} from '../types';

interface UseFieldAssignmentsProps {
  baseline: Baseline | null;
  loadBaseline: () => Promise<void>;
  libraryFields: any[];
  fieldLabelMap: Record<string, string>;
  addNotification: (n: Notification) => void;
}

export function useFieldAssignments({
  baseline,
  loadBaseline,
  libraryFields,
  fieldLabelMap,
  addNotification,
}: UseFieldAssignmentsProps) {
  const [pendingLocalValues, setPendingLocalValues] = useState<Record<string, string>>({});
  const [resetLocalField, setResetLocalField] = useState<ResetLocalField | null>(null);

  // Correction modal state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionPendingAction, setCorrectionPendingAction] = useState<CorrectionPendingAction>(null);

  // Validation modal state
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationPendingAction, setValidationPendingAction] = useState<ValidationPendingAction>(null);

  // Field change log
  const [fieldChangeLog, setFieldChangeLog] = useState<FieldChangeLogEntry[]>([]);
  const [fieldChangeLogCollapsed, setFieldChangeLogCollapsed] = useState(true);
  const [fieldChangeLogLoaded, setFieldChangeLogLoaded] = useState(false);
  const [highlightFieldKey, setHighlightFieldKey] = useState<string | null>(null);

  const addFieldChangeLogEntry = useCallback((entry: { label: string; detail?: string; target?: { fieldKey: string } }) => {
    const record = { id: `${Date.now()}-${Math.random()}`, timestamp: Date.now(), ...entry };
    console.log('[ChangeLog][Field]', record);
    setFieldChangeLog((prev) => [record, ...prev]);
  }, []);

  const handleAssignmentUpdate = useCallback(async (fieldKey: string, value: string, sourceSegmentId?: string, metadata?: Partial<AssignPayload>) => {
    if (!baseline) return;
    const existing = baseline.assignments?.find(a => a.fieldKey === fieldKey);

    if (existing && baseline.status === 'reviewed') {
      setCorrectionPendingAction({ type: 'upsert', fieldKey, value, sourceSegmentId });
      setIsCorrectionModalOpen(true);
      return;
    }

    try {
      await upsertAssignment(baseline.id, { fieldKey, assignedValue: value, sourceSegmentId, ...metadata });
      await loadBaseline();
      const oldValue = existing?.assignedValue ?? '';
      const newValue = value ?? '';
      if (oldValue !== newValue) {
        const label = fieldLabelMap[fieldKey] || fieldKey;
        addFieldChangeLogEntry({
          label: `Field "${label}" updated`,
          detail: `"${oldValue}" -> "${newValue}"`,
          target: { fieldKey },
        });
      }
      addNotification(notifySuccess('Assignment saved', `${fieldKey} updated`));
    } catch (e: any) {
      const errorBody = e.body || {};
      const hasValidation = errorBody.validation || errorBody.requiresConfirmation;

      if (hasValidation && errorBody.validation) {
        const field = libraryFields.find((f: any) => f.fieldKey === fieldKey);
        setValidationPendingAction({
          fieldKey,
          fieldLabel: field?.label || fieldKey,
          value,
          sourceSegmentId,
          validationError: errorBody.validation.error || 'Invalid value',
          suggestedCorrection: errorBody.validation.suggestedCorrection,
        });
        setIsValidationModalOpen(true);
        return;
      }

      addNotification(notifyError('Update failed', e.message));
    }
  }, [baseline, loadBaseline, addNotification, libraryFields, fieldLabelMap, addFieldChangeLogEntry]);

  const handleAssignmentDelete = useCallback(async (fieldKey: string, metadata?: DeleteAssignmentPayload) => {
    if (!baseline) return;
    const existing = baseline.assignments?.find(a => a.fieldKey === fieldKey);
    if (baseline.status === 'reviewed') {
      setCorrectionPendingAction({ type: 'delete', fieldKey });
      setIsCorrectionModalOpen(true);
      return;
    }
    try {
      await deleteAssignment(baseline.id, fieldKey, metadata);
      await loadBaseline();
      const oldValue = existing?.assignedValue ?? '';
      const label = fieldLabelMap[fieldKey] || fieldKey;
      addFieldChangeLogEntry({
        label: `Field "${label}" cleared`,
        detail: oldValue ? `"${oldValue}" removed` : undefined,
        target: { fieldKey },
      });
      addNotification(notifySuccess('Assignment cleared', `${fieldKey} cleared`));
    } catch (e: any) {
      addNotification(notifyError('Delete failed', e.message));
    }
  }, [addNotification, baseline, loadBaseline, fieldLabelMap, addFieldChangeLogEntry]);

  const handleAccept = useCallback(async (fieldKey: string) => {
    if (!baseline) return;
    const existing = baseline.assignments?.find(a => a.fieldKey === fieldKey);
    if (!existing || existing.assignedValue === null) return;
    try {
      await upsertAssignment(baseline.id, {
        fieldKey,
        assignedValue: existing.assignedValue,
        sourceSegmentId: existing.sourceSegmentId || undefined,
        suggestionAccepted: true,
        modelVersionId: existing.modelVersionId ?? undefined,
      });
      await loadBaseline();
      addNotification(notifySuccess('Suggestion accepted', `${fieldLabelMap[fieldKey] || fieldKey} verified`));
    } catch (e: any) {
      addNotification(notifyError('Accept failed', e.message));
    }
  }, [baseline, loadBaseline, addNotification, fieldLabelMap]);

  const handleCorrectionConfirm = useCallback(async (reason: string) => {
    if (!baseline || !correctionPendingAction) return;
    setIsCorrectionModalOpen(false);
    const { type, fieldKey, value, sourceSegmentId } = correctionPendingAction;
    const existing = baseline.assignments?.find(a => a.fieldKey === fieldKey);

    try {
      if (type === 'upsert') {
        await upsertAssignment(baseline.id, { fieldKey, assignedValue: value!, sourceSegmentId, correctionReason: reason });
      } else {
        await deleteAssignment(baseline.id, fieldKey, reason);
      }
      await loadBaseline();
      const label = fieldLabelMap[fieldKey] || fieldKey;
      const oldValue = existing?.assignedValue ?? '';
      if (type === 'upsert') {
        const newValue = value ?? '';
        if (oldValue !== newValue) {
          addFieldChangeLogEntry({
            label: `Field "${label}" updated`,
            detail: `"${oldValue}" -> "${newValue}"`,
            target: { fieldKey },
          });
        }
      } else {
        addFieldChangeLogEntry({
          label: `Field "${label}" cleared`,
          detail: oldValue ? `"${oldValue}" removed` : undefined,
          target: { fieldKey },
        });
      }
      addNotification(notifySuccess(
        type === 'upsert' ? 'Assignment updated' : 'Assignment cleared',
        `${fieldKey} processed`,
      ));
    } catch (e: any) {
      addNotification(notifyError('Action failed', e.message));
    } finally {
      setCorrectionPendingAction(null);
    }
  }, [baseline, correctionPendingAction, loadBaseline, addNotification, fieldLabelMap, addFieldChangeLogEntry]);

  const handleCorrectionCancel = useCallback(() => {
    if (correctionPendingAction) {
      setResetLocalField({ key: correctionPendingAction.fieldKey, version: Date.now() });
    }
    setIsCorrectionModalOpen(false);
    setCorrectionPendingAction(null);
  }, [correctionPendingAction]);

  const handleValidationConfirm = useCallback(async () => {
    if (!baseline || !validationPendingAction) return;
    setIsValidationModalOpen(false);
    const { fieldKey, value, sourceSegmentId } = validationPendingAction;
    const existing = baseline.assignments?.find(a => a.fieldKey === fieldKey);

    try {
      await upsertAssignment(baseline.id, { fieldKey, assignedValue: value, sourceSegmentId, confirmInvalid: true });
      await loadBaseline();
      const oldValue = existing?.assignedValue ?? '';
      const newValue = value ?? '';
      if (oldValue !== newValue) {
        const label = fieldLabelMap[fieldKey] || fieldKey;
        addFieldChangeLogEntry({
          label: `Field "${label}" updated`,
          detail: `"${oldValue}" -> "${newValue}"`,
          target: { fieldKey },
        });
      }
      addNotification(notifySuccess('Assignment saved', `${fieldKey} saved with validation warning`));
    } catch (e: any) {
      addNotification(notifyError('Update failed', e.message));
    } finally {
      setValidationPendingAction(null);
    }
  }, [baseline, validationPendingAction, loadBaseline, addNotification, fieldLabelMap, addFieldChangeLogEntry]);

  const handleValidationUseSuggestion = useCallback(async () => {
    if (!baseline || !validationPendingAction || !validationPendingAction.suggestedCorrection) return;
    setIsValidationModalOpen(false);
    const { fieldKey, sourceSegmentId, suggestedCorrection } = validationPendingAction;
    const existing = baseline.assignments?.find(a => a.fieldKey === fieldKey);

    try {
      await upsertAssignment(baseline.id, { fieldKey, assignedValue: suggestedCorrection, sourceSegmentId });
      await loadBaseline();
      const oldValue = existing?.assignedValue ?? '';
      if (oldValue !== suggestedCorrection) {
        const label = fieldLabelMap[fieldKey] || fieldKey;
        addFieldChangeLogEntry({
          label: `Field "${label}" updated`,
          detail: `"${oldValue}" -> "${suggestedCorrection}"`,
          target: { fieldKey },
        });
      }
      addNotification(notifySuccess('Assignment saved', `${fieldKey} updated with suggested value`));
    } catch (e: any) {
      addNotification(notifyError('Update failed', e.message));
    } finally {
      setValidationPendingAction(null);
    }
  }, [baseline, validationPendingAction, loadBaseline, addNotification, fieldLabelMap, addFieldChangeLogEntry]);

  const handleValidationCancel = useCallback(() => {
    if (validationPendingAction) {
      setResetLocalField({ key: validationPendingAction.fieldKey, version: Date.now() });
    }
    setIsValidationModalOpen(false);
    setValidationPendingAction(null);
  }, [validationPendingAction]);

  const handleGenerateSuggestions = useCallback(async () => {
    if (!baseline?.id) {
      throw new Error('Baseline unavailable');
    }
    const result = await generateSuggestions(baseline.id);
    const count = result?.suggestionCount ?? result?.suggestedAssignments?.length ?? 0;
    if (count === 0) {
      await loadBaseline();
      addNotification(notifyError('No suggestions generated', 'Suggestions unavailable. Continue with manual assignment.'));
      throw new Error('No suggestions generated');
    }
    addNotification(notifySuccess('Suggestions generated', `${count} field suggestions generated.`));
    await loadBaseline();
    return count;
  }, [baseline?.id, addNotification, loadBaseline]);

  return {
    // Local values
    pendingLocalValues,
    setPendingLocalValues,
    resetLocalField,
    // Field assignment handlers
    handleAssignmentUpdate,
    handleAssignmentDelete,
    handleAccept,
    handleGenerateSuggestions,
    // Correction modal
    isCorrectionModalOpen,
    correctionPendingAction,
    handleCorrectionConfirm,
    handleCorrectionCancel,
    // Validation modal
    isValidationModalOpen,
    validationPendingAction,
    handleValidationConfirm,
    handleValidationUseSuggestion,
    handleValidationCancel,
    // Change log
    fieldChangeLog,
    setFieldChangeLog,
    fieldChangeLogCollapsed,
    setFieldChangeLogCollapsed,
    fieldChangeLogLoaded,
    setFieldChangeLogLoaded,
    highlightFieldKey,
    setHighlightFieldKey,
    addFieldChangeLogEntry,
  };
}
