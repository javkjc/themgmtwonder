'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createOcrCorrection,
  createManualOcrField,
  deleteOcrField,
  fetchOcrCorrectionHistory,
  type OcrField,
  type OcrCorrectionHistoryItem,
  type OcrManualFieldPayload,
  type OcrResultsWithCorrectionsResponse,
} from '@/app/lib/api/ocr';
import { notifySuccess, notifyError } from '@/app/lib/notifications';
import type { Notification } from '@/app/components/NotificationToast';

interface UseOcrFieldsProps {
  ocrData: OcrResultsWithCorrectionsResponse | null;
  canMutateFields: boolean;
  addNotification: (n: Notification) => void;
  fetchOcrAndFields: () => Promise<void>;
}

export function useOcrFields({
  ocrData,
  canMutateFields,
  addNotification,
  fetchOcrAndFields,
}: UseOcrFieldsProps) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editField, setEditField] = useState<OcrField | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const [historyField, setHistoryField] = useState<OcrField | null>(null);
  const [historyEntries, setHistoryEntries] = useState<OcrCorrectionHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creatingField, setCreatingField] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createModalInitials, setCreateModalInitials] = useState<{ fieldName?: string; fieldValue?: string }>({});

  const handleOpenEdit = useCallback((field: OcrField) => {
    if (!canMutateFields) return;
    setEditField(field);
    setCorrectionError(null);
    setIsEditOpen(true);
  }, [canMutateFields]);

  const handleSaveCorrection = useCallback(async (payload: { correctedValue: string; correctionReason?: string }) => {
    if (!editField) return;
    setSavingCorrection(true);
    setCorrectionError(null);
    try {
      await createOcrCorrection(editField.id, payload);
      setIsEditOpen(false);
      setEditField(null);
      addNotification(notifySuccess('Correction saved', `${editField.fieldName.replace(/_/g, ' ')} updated`));
      await fetchOcrAndFields();
    } catch (err: unknown) {
      setCorrectionError((err as Error)?.message || 'Unable to save correction');
    } finally {
      setSavingCorrection(false);
    }
  }, [addNotification, editField, fetchOcrAndFields]);

  const handleCreateField = useCallback(async (payload: OcrManualFieldPayload) => {
    if (!canMutateFields || !ocrData?.rawOcr) return;
    setCreatingField(true);
    setCreateError(null);
    try {
      await createManualOcrField(ocrData.rawOcr.id, payload);
      setIsCreateOpen(false);
      setCreateModalInitials({});
      addNotification(notifySuccess('Field added', `${payload.fieldName} added manually`));
      await fetchOcrAndFields();
    } catch (err: unknown) {
      setCreateError((err as Error)?.message || 'Unable to add field');
    } finally {
      setCreatingField(false);
    }
  }, [addNotification, fetchOcrAndFields, ocrData?.rawOcr, canMutateFields]);

  const handleDeleteField = useCallback(async (field: OcrField) => {
    if (!canMutateFields) return;
    const reason = window.prompt(`Are you sure you want to delete "${field.fieldName}"? Please provide a reason:`);
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      alert('Reason is required to delete a field.');
      return;
    }

    try {
      await deleteOcrField(field.id, trimmedReason);
      addNotification(notifySuccess('Field deleted', `${field.fieldName} has been removed`));
      await fetchOcrAndFields();
    } catch (err: unknown) {
      addNotification(notifyError('Delete failed', (err as Error)?.message || 'Unable to delete field'));
    }
  }, [addNotification, fetchOcrAndFields, canMutateFields]);

  const handleOpenHistory = useCallback((field: OcrField) => {
    setHistoryField(field);
  }, []);

  useEffect(() => {
    if (!historyField) return;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchOcrCorrectionHistory(historyField.id)
      .then((entries) => setHistoryEntries(entries))
      .catch((err: unknown) => {
        setHistoryError((err as Error)?.message || 'Unable to load history');
      })
      .finally(() => setHistoryLoading(false));
  }, [historyField]);

  const handleHistoryClose = useCallback(() => {
    setHistoryField(null);
    setHistoryEntries(null);
    setHistoryError(null);
    setHistoryLoading(false);
  }, []);

  const handleFieldSelect = useCallback((field: OcrField) => {
    setSelectedFieldId(field.id);
  }, []);

  const selectedField = ocrData?.parsedFields.find((field) => field.id === selectedFieldId) ?? null;

  return {
    selectedFieldId,
    selectedField,
    handleFieldSelect,
    // Edit modal
    isEditOpen,
    editField,
    savingCorrection,
    correctionError,
    handleOpenEdit,
    handleSaveCorrection,
    onEditClose: () => setIsEditOpen(false),
    // Create modal
    isCreateOpen,
    setIsCreateOpen,
    creatingField,
    createError,
    createModalInitials,
    setCreateModalInitials,
    handleCreateField,
    // Delete
    handleDeleteField,
    // History modal
    historyField,
    historyEntries,
    historyLoading,
    historyError,
    handleOpenHistory,
    handleHistoryClose,
  };
}
