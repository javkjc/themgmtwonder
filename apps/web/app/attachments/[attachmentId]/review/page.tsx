'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import NotificationToast, { type Notification } from '@/app/components/NotificationToast';
const PdfDocumentViewer = dynamic(() => import('@/app/components/ocr/PdfDocumentViewer'), { ssr: false });
import OcrCorrectionHistoryModal from '@/app/components/ocr/OcrCorrectionHistoryModal';
import OcrFieldEditModal from '@/app/components/ocr/OcrFieldEditModal';
import OcrFieldCreateModal from '@/app/components/ocr/OcrFieldCreateModal';
import OcrFieldList from '@/app/components/ocr/OcrFieldList';
import Layout from '@/app/components/Layout';
import BaselineStatusBadge from '@/app/components/baseline/BaselineStatusBadge';

import { API_BASE_URL, apiFetchJson, isUnauthorized } from '@/app/lib/api';
import {
  createOcrCorrection,
  createManualOcrField,
  deleteOcrField,
  fetchAttachmentOcrResults,
  fetchOcrCorrectionHistory,
  type OcrCorrectionHistoryItem,
  type OcrField,
  type OcrManualFieldPayload,
  type OcrResultsWithCorrectionsResponse,
} from '@/app/lib/api/ocr';
import {
  confirmBaseline as confirmBaselineApi,
  createDraftBaseline as createDraftBaselineApi,
  fetchBaselineForAttachment,
  markBaselineReviewed,
  upsertAssignment,
  deleteAssignment,
  type Baseline,
  type Segment,
  type Assignment,
} from '@/app/lib/api/baselines';
import type { Me } from '@/app/types';

import ExtractedTextPool from '@/app/components/ocr/ExtractedTextPool';
import FieldAssignmentPanel from '@/app/components/FieldAssignmentPanel';
import CorrectionReasonModal from '@/app/components/ocr/CorrectionReasonModal';
import ValidationConfirmationModal from '@/app/components/ValidationConfirmationModal';


const DEFAULT_NOTIFICATION_TTL = 5000;

const badgeStyles: Record<string, { bg: string; color: string; border: string }> = {
  draft: { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' },
  reviewed: { bg: '#e0f2fe', color: '#075985', border: '#bae6fd' },
  confirmed: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  archived: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
};

const humanizeToken = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const UTILIZATION_REASON_LABELS: Record<string, string> = {
  authoritative_record: 'Authoritative record created',
  data_export: 'Data exported',
  human_approval: 'Human approved',
};

const STATUS_REASON_LABELS: Record<string, string> = {
  confirmed: 'Status: Confirmed output (read-only)',
  archived: 'Status: Archived output (view only)',
  reviewed: 'Status: Reviewed output (locked)',
};

export default function AttachmentOcrReviewPage() {
  const params = useParams();
  const attachmentId = useMemo<string | undefined>(() => {
    const raw = params?.attachmentId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [me, setMe] = useState<Me | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [ocrData, setOcrData] = useState<OcrResultsWithCorrectionsResponse | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [reviewingBaseline, setReviewingBaseline] = useState(false);
  const [confirmingBaseline, setConfirmingBaseline] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [pendingLocalValues, setPendingLocalValues] = useState<Record<string, string>>({});
  const [correctionPendingAction, setCorrectionPendingAction] = useState<{
    type: 'upsert' | 'delete';
    fieldKey: string;
    value?: string;
    sourceSegmentId?: string;
  } | null>(null);

  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationPendingAction, setValidationPendingAction] = useState<{
    fieldKey: string;
    fieldLabel: string;
    value: string;
    sourceSegmentId?: string;
    validationError: string;
    suggestedCorrection?: string;
  } | null>(null);

  const [isFieldBuilderOpen, setIsFieldBuilderOpen] = useState(true);
  const [shouldScrollToBuilder, setShouldScrollToBuilder] = useState(false);
  const [selectionText, setSelectionText] = useState('');
  const [createModalInitials, setCreateModalInitials] = useState<{ fieldName?: string; fieldValue?: string }>({});
  const [libraryFields, setLibraryFields] = useState<any[]>([]);
  const [highlightedSegment, setHighlightedSegment] = useState<Segment | null>(null);
  const [activeTab, setActiveTab] = useState<'document' | 'text' | 'fields'>('document');


  const addNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => [...prev, notification]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
    }, DEFAULT_NOTIFICATION_TTL);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // Ignore
    } finally {
      setMe(null);
      window.location.href = '/';
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const meJson = (await apiFetchJson('/auth/me')) as Me;
        setMe(meJson);
      } catch (e: unknown) {
        if (isUnauthorized(e)) {
          setMe(null);
        }
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const loadBaseline = useCallback(async () => {
    if (!attachmentId) return;
    setBaselineLoading(true);
    setBaselineError(null);
    try {
      let current = await fetchBaselineForAttachment(attachmentId);
      if (!current) {
        current = await createDraftBaselineApi(attachmentId);
        // Re-fetch to get segments/assignments if createDraft doesn't return them populated
        current = await fetchBaselineForAttachment(attachmentId);
      }
      setBaseline(current);
    } catch (err: unknown) {
      setBaselineError((err as Error)?.message || 'Unable to load baseline status');
    } finally {
      setBaselineLoading(false);
    }
  }, [attachmentId]);

  const handleAssignmentUpdate = useCallback(async (fieldKey: string, value: string, sourceSegmentId?: string) => {
    if (!baseline) return;
    const existing = baseline.assignments?.find(a => a.fieldKey === fieldKey);

    if (existing && baseline.status === 'reviewed') {
      setCorrectionPendingAction({ type: 'upsert', fieldKey, value, sourceSegmentId });
      setIsCorrectionModalOpen(true);
      return;
    }

    try {
      await upsertAssignment(baseline.id, { fieldKey, assignedValue: value, sourceSegmentId });
      await loadBaseline();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Assignment saved',
        message: `${fieldKey} updated`,
      });
    } catch (e: any) {
      // Check if this is a validation error that requires confirmation
      // NestJS error structure: e.body can have validation and requiresConfirmation directly
      const errorBody = e.body || {};
      const hasValidation = errorBody.validation || errorBody.requiresConfirmation;

      if (hasValidation && errorBody.validation) {
        const field = libraryFields.find(f => f.fieldKey === fieldKey);
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

      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Update failed',
        message: e.message,
      });
    }
  }, [baseline, loadBaseline, addNotification, libraryFields]);

  const handleAssignmentDelete = useCallback(async (fieldKey: string) => {
    if (!baseline) return;
    if (baseline.status === 'reviewed') {
      setCorrectionPendingAction({ type: 'delete', fieldKey });
      setIsCorrectionModalOpen(true);
      return;
    }
    try {
      await deleteAssignment(baseline.id, fieldKey);
      await loadBaseline();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Assignment cleared',
        message: `${fieldKey} cleared`,
      });
    } catch (e: any) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Delete failed',
        message: e.message,
      });
    }
  }, [addNotification, baseline, loadBaseline]);

  const handleCorrectionConfirm = useCallback(async (reason: string) => {
    if (!baseline || !correctionPendingAction) return;
    setIsCorrectionModalOpen(false);
    const { type, fieldKey, value, sourceSegmentId } = correctionPendingAction;

    try {
      if (type === 'upsert') {
        await upsertAssignment(baseline.id, { fieldKey, assignedValue: value!, sourceSegmentId, correctionReason: reason });
      } else {
        await deleteAssignment(baseline.id, fieldKey, reason);
      }
      await loadBaseline();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: type === 'upsert' ? 'Assignment updated' : 'Assignment cleared',
        message: `${fieldKey} processed`,
      });
    } catch (e: any) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Action failed',
        message: e.message,
      });
    } finally {
      setCorrectionPendingAction(null);
    }
  }, [baseline, correctionPendingAction, loadBaseline, addNotification]);

  const handleValidationConfirm = useCallback(async () => {
    if (!baseline || !validationPendingAction) return;
    setIsValidationModalOpen(false);
    const { fieldKey, value, sourceSegmentId } = validationPendingAction;

    try {
      await upsertAssignment(baseline.id, {
        fieldKey,
        assignedValue: value,
        sourceSegmentId,
        confirmInvalid: true
      });
      await loadBaseline();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Assignment saved',
        message: `${fieldKey} saved with validation warning`,
      });
    } catch (e: any) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Update failed',
        message: e.message,
      });
    } finally {
      setValidationPendingAction(null);
    }
  }, [baseline, validationPendingAction, loadBaseline, addNotification]);

  const handleValidationUseSuggestion = useCallback(async () => {
    if (!baseline || !validationPendingAction || !validationPendingAction.suggestedCorrection) return;
    setIsValidationModalOpen(false);
    const { fieldKey, sourceSegmentId, suggestedCorrection } = validationPendingAction;

    try {
      await upsertAssignment(baseline.id, {
        fieldKey,
        assignedValue: suggestedCorrection,
        sourceSegmentId
      });
      await loadBaseline();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Assignment saved',
        message: `${fieldKey} updated with suggested value`,
      });
    } catch (e: any) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Update failed',
        message: e.message,
      });
    } finally {
      setValidationPendingAction(null);
    }
  }, [baseline, validationPendingAction, loadBaseline, addNotification]);

  const handleValidationCancel = useCallback(() => {
    setIsValidationModalOpen(false);
    setValidationPendingAction(null);
  }, []);

  const builderSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      setTaskId(urlParams.get('taskId'));
    }
  }, []);

  const documentUrl = attachmentId
    ? `${API_BASE_URL}/attachments/${attachmentId}/download`
    : '';

  const fetchData = useCallback(async () => {
    if (!attachmentId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch OCR results for the PDF viewer and status information
      const data = await fetchAttachmentOcrResults(attachmentId);
      setOcrData(data);

      // Fetch Field Library
      const fields = await apiFetchJson('/fields?status=active');
      setLibraryFields(fields as any[]);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load extraction review data');
    } finally {
      setLoading(false);
    }
  }, [attachmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (authLoading || !me) return;
    loadBaseline();
  }, [authLoading, loadBaseline, me]);

  const selectedField = useMemo(() => {
    return ocrData?.parsedFields.find((field) => field.id === selectedFieldId) ?? null;
  }, [ocrData, selectedFieldId]);

  const parsedFields = ocrData?.parsedFields ?? [];
  const hasFields = parsedFields.length > 0;
  const rawExtractedText = ocrData?.rawOcr?.extractedText ?? '';
  const hasRawText = rawExtractedText.trim().length > 0;
  const fieldBuilderPanelId = 'field-builder-panel';
  const rawTextSectionId = 'raw-extracted-text-section';
  const builderSectionId = 'field-builder-section';
  const extractedFieldsSectionId = 'extracted-fields-section';

  const openFieldBuilderPanel = useCallback((scrollToBuilder = false) => {
    setIsFieldBuilderOpen(true);
    if (scrollToBuilder) {
      setShouldScrollToBuilder(true);
    }
  }, []);

  const toggleFieldBuilder = useCallback(() => {
    setIsFieldBuilderOpen((prev) => !prev);
  }, []);

  const handleEmptyStateCta = useCallback(() => {
    openFieldBuilderPanel(true);
  }, [openFieldBuilderPanel]);

  useEffect(() => {
    if (isFieldBuilderOpen && shouldScrollToBuilder) {
      builderSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      builderSectionRef.current?.focus();
      setShouldScrollToBuilder(false);
    }
  }, [isFieldBuilderOpen, shouldScrollToBuilder]);

  const rawOcrStatus = ocrData?.rawOcr?.status;
  const isStatusLocked = rawOcrStatus ? rawOcrStatus !== 'draft' : false;
  const isUtilizationLocked = Boolean(ocrData?.utilizationType);
  const isFieldBuilderReadOnly = isStatusLocked || isUtilizationLocked;
  const statusFallbackLabel = rawOcrStatus ? `Status: ${humanizeToken(rawOcrStatus)}` : 'Status unavailable';
  const readOnlyReason = isUtilizationLocked
    ? UTILIZATION_REASON_LABELS[ocrData?.utilizationType ?? ''] ?? 'Data in use'
    : isStatusLocked
      ? STATUS_REASON_LABELS[rawOcrStatus ?? ''] ?? statusFallbackLabel
      : undefined;
  const canMutateFields = !isFieldBuilderReadOnly;

  const handleRawTextMouseUp = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    setSelectionText(text);
  }, []);

  const handleUseSelectionAsValue = useCallback(() => {
    if (!selectionText || !canMutateFields) return;
    setCreateModalInitials({ fieldValue: selectionText });
    setIsCreateOpen(true);
    // Clear selection after capturing
    window.getSelection()?.removeAllRanges();
    setSelectionText('');
  }, [selectionText, canMutateFields]);

  const assignmentStats = useMemo(() => {
    const totalFields = libraryFields.length;
    const assigned = baseline?.assignments?.length || 0;
    return { assigned, empty: Math.max(0, totalFields - assigned) };
  }, [libraryFields, baseline]);

  const isLowConfidence = useMemo(() => {
    if (ocrData?.parsedFields?.length) {
      const fieldsWithConfidence = ocrData.parsedFields.filter(f => f.confidence !== null);
      if (fieldsWithConfidence.length) {
        return fieldsWithConfidence.every(f => f.confidence! < 0.6);
      }
    }
    return false;
  }, [ocrData]);

  const handleOpenEdit = useCallback(
    (field: OcrField) => {
      if (!canMutateFields) {
        return;
      }
      setEditField(field);
      setCorrectionError(null);
      setIsEditOpen(true);
    },
    [canMutateFields],
  );

  const handleSaveCorrection = useCallback(
    async (payload: { correctedValue: string; correctionReason?: string }) => {
      if (!editField) return;
      setSavingCorrection(true);
      setCorrectionError(null);
      try {
        await createOcrCorrection(editField.id, payload);
        setIsEditOpen(false);
        setEditField(null);
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Correction saved',
          message: `${editField.fieldName.replace(/_/g, ' ')} updated`,
        });
        await fetchData();
      } catch (err: unknown) {
        setCorrectionError((err as Error)?.message || 'Unable to save correction');
      } finally {
        setSavingCorrection(false);
      }
    },
    [addNotification, editField, fetchData],
  );

  const handleCreateField = useCallback(
    async (payload: OcrManualFieldPayload) => {
      if (!canMutateFields || !ocrData?.rawOcr) return;
      setCreatingField(true);
      setCreateError(null);
      try {
        await createManualOcrField(ocrData.rawOcr.id, payload);
        setIsCreateOpen(false);
        setCreateModalInitials({});
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Field added',
          message: `${payload.fieldName} added manually`,
        });
        await fetchData();
      } catch (err: unknown) {
        setCreateError((err as Error)?.message || 'Unable to add field');
      } finally {
        setCreatingField(false);
      }
    },
    [addNotification, fetchData, ocrData?.rawOcr, canMutateFields],
  );

  const handleDeleteField = useCallback(
    async (field: OcrField) => {
      if (!canMutateFields) {
        return;
      }
      const reason = window.prompt(`Are you sure you want to delete "${field.fieldName}"? Please provide a reason:`);
      if (reason === null) return; // Cancelled
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        alert('Reason is required to delete a field.');
        return;
      }

      try {
        await deleteOcrField(field.id, trimmedReason);
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Field deleted',
          message: `${field.fieldName} has been removed`,
        });
        await fetchData();
      } catch (err: unknown) {
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Delete failed',
          message: (err as Error)?.message || 'Unable to delete field',
        });
      }
    },
    [addNotification, fetchData, canMutateFields],
  );

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

  const handleHistoryClose = () => {
    setHistoryField(null);
    setHistoryEntries(null);
    setHistoryError(null);
    setHistoryLoading(false);
  };

  const handleDocumentError = useCallback((message: string) => {
    setDocumentError(message);
  }, []);

  const handleFieldSelect = useCallback((field: OcrField) => {
    setSelectedFieldId(field.id);
  }, []);

  const hasOcrOutput = Boolean(ocrData?.rawOcr);
  const targetTaskId = taskId || ocrData?.attachment?.todoId || null;

  const handleMarkReviewed = useCallback(async () => {
    if (!baseline) return;

    // Check for unsaved local values
    const pendingFields = Object.keys(pendingLocalValues);
    if (pendingFields.length > 0) {
      const fieldLabels = pendingFields.map(fieldKey => {
        const field = libraryFields.find(f => f.fieldKey === fieldKey);
        return field?.label || fieldKey;
      }).join(', ');
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Cannot mark as reviewed',
        message: `You have unsaved changes in: ${fieldLabels}. Please save or fix validation errors first.`,
      });
      return;
    }

    // Validate all assignments before allowing transition
    const invalidAssignments = baseline.assignments?.filter(a =>
      a.validation && !a.validation.valid
    ) || [];

    const emptyRequiredFields = libraryFields.filter(field => {
      const assignment = baseline.assignments?.find(a => a.fieldKey === field.fieldKey);
      return !assignment || !assignment.assignedValue;
    });

    if (invalidAssignments.length > 0) {
      const fieldNames = invalidAssignments.map(a => a.fieldKey).join(', ');
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Cannot mark as reviewed',
        message: `Please fix validation errors in: ${fieldNames}`,
      });
      return;
    }

    if (emptyRequiredFields.length > 0) {
      const fieldNames = emptyRequiredFields.map(f => f.label || f.fieldKey).join(', ');
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Cannot mark as reviewed',
        message: `Please assign values to all fields. Missing: ${fieldNames}`,
      });
      return;
    }

    setReviewingBaseline(true);
    setBaselineError(null);
    try {
      await markBaselineReviewed(baseline.id);
      await loadBaseline();
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Marked as reviewed',
        message: 'Baseline moved to reviewed.',
      });
    } catch (err: unknown) {
      const message = (err as Error)?.message || 'Unable to mark as reviewed';
      setBaselineError(message);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Review failed',
        message,
      });
    } finally {
      setReviewingBaseline(false);
    }
  }, [addNotification, baseline, loadBaseline, libraryFields, pendingLocalValues]);

  const handleConfirmBaseline = useCallback(async () => {
    if (!baseline) return;

    // Validate all assignments before allowing transition
    const invalidAssignments = baseline.assignments?.filter(a =>
      a.validation && !a.validation.valid
    ) || [];

    const emptyRequiredFields = libraryFields.filter(field => {
      const assignment = baseline.assignments?.find(a => a.fieldKey === field.fieldKey);
      return !assignment || !assignment.assignedValue;
    });

    if (invalidAssignments.length > 0) {
      const fieldNames = invalidAssignments.map(a => a.fieldKey).join(', ');
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Cannot confirm baseline',
        message: `Please fix validation errors in: ${fieldNames}`,
      });
      setIsConfirmModalOpen(false);
      return;
    }

    if (emptyRequiredFields.length > 0) {
      const fieldNames = emptyRequiredFields.map(f => f.label || f.fieldKey).join(', ');
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Cannot confirm baseline',
        message: `Please assign values to all fields. Missing: ${fieldNames}`,
      });
      setIsConfirmModalOpen(false);
      return;
    }

    setConfirmingBaseline(true);
    setBaselineError(null);
    try {
      const updated = await confirmBaselineApi(baseline.id);
      setBaseline(updated);
      setIsConfirmModalOpen(false);
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Baseline confirmed',
        message: 'Baseline locked and ready for use.',
      });
      if (targetTaskId) {
        setTimeout(() => {
          window.location.href = `/task/${targetTaskId}`;
        }, 400);
      }
    } catch (err: unknown) {
      const message = (err as Error)?.message || 'Unable to confirm baseline';
      setBaselineError(message);
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Confirm failed',
        message,
      });
    } finally {
      setConfirmingBaseline(false);
    }
  }, [addNotification, baseline, targetTaskId, libraryFields]);

  // Auth loading state
  if (authLoading) {
    return null;
  }

  // Not authenticated - redirect to login
  if (!me) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  const badgeStylesValue = baseline?.status ? (badgeStyles[baseline.status] || badgeStyles.draft) : badgeStyles.draft;
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;


  const renderPanel1 = () => {
    const attachment = ocrData?.attachment;
    const mimeType = attachment?.mimeType?.toLowerCase() ?? '';
    const fileName = attachment?.filename ?? '';
    const lowerFileName = fileName.toLowerCase();
    const isPdf = mimeType.includes('pdf') || lowerFileName.endsWith('.pdf');
    const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName);
    const isPreviewable = isPdf || isImage;
    const isExcel =
      mimeType.includes('excel') ||
      mimeType.includes('spreadsheet') ||
      lowerFileName.endsWith('.xls') ||
      lowerFileName.endsWith('.xlsx');
    const isWord =
      mimeType.includes('word') ||
      lowerFileName.endsWith('.doc') ||
      lowerFileName.endsWith('.docx');

    return (
      <div style={{ flex: '1 1 40%', minWidth: isMobile ? '100%' : 420 }}>
        <div style={{ marginBottom: 12, color: '#475569', fontSize: 13, fontWeight: 700 }}>1. Document Preview</div>
        {isPreviewable ? (
          <PdfDocumentViewer
            title={fileName || 'Attachment'}
            documentUrl={documentUrl}
            mimeType={attachment?.mimeType ?? null}
            fileName={fileName || null}
            highlightedField={
              highlightedSegment
                ? { pageNumber: highlightedSegment.pageNumber || 1, boundingBox: highlightedSegment.boundingBox }
                : (selectedField ? { pageNumber: selectedField.pageNumber, boundingBox: selectedField.boundingBox } : null)
            }
            onDocumentError={handleDocumentError}
            forcePage={highlightedSegment?.pageNumber ?? selectedField?.pageNumber ?? null}
          />
        ) : isExcel ? (
          <div style={{ height: 400, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>📊</span>
            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>
              Excel files have no preview. <a href={documentUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Download to view.</a>
            </p>
          </div>
        ) : isWord ? (
          <div style={{ height: 400, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>⚠️</span>
            <p style={{ margin: 0, fontWeight: 600, color: '#b91c1c' }}>Word documents not supported. Please convert to PDF.</p>
            <a href={documentUrl} target="_blank" rel="noreferrer" style={{ marginTop: 12, color: '#991b1b', fontWeight: 600 }}>Download file</a>
          </div>
        ) : (
          <div style={{ height: 400, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#64748b' }}>Preview not available for this file type.</p>
          </div>
        )}
        {documentError && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>
            {documentError}. <a href={documentUrl} target="_blank" rel="noreferrer" style={{ color: '#991b1b' }}>Download file</a>
          </div>
        )}
      </div>
    );
  };

  const renderPanel2 = () => (
    <div style={{ flex: '1 1 30%', minWidth: isMobile ? '100%' : 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ color: '#475569', fontSize: 13, fontWeight: 700 }}>2. Extracted Text</div>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{baseline?.segments?.length || 0} segments</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: isMobile ? 'auto' : 'calc(100vh - 350px)', paddingRight: 4 }}>
        <ExtractedTextPool
          segments={baseline?.segments || []}
          onHighlight={setHighlightedSegment}
          onDragStart={(e, s) => {
            e.dataTransfer.setData('application/json', JSON.stringify(s));
          }}
        />
      </div>
    </div>
  );

  const renderPanel3 = () => (
    <div style={{ flex: '1 1 30%', minWidth: isMobile ? '100%' : 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ color: '#475569', fontSize: 13, fontWeight: 700 }}>3. Field Assignments</div>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{assignmentStats.assigned} / {libraryFields.length} set</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: isMobile ? 'auto' : 'calc(100vh - 350px)', paddingRight: 4 }}>
        <FieldAssignmentPanel
          fields={libraryFields}
          assignments={baseline?.assignments || []}
          isReadOnly={baseline?.status === 'confirmed' || baseline?.status === 'archived' || !!baseline?.utilizationType}
          onUpdate={handleAssignmentUpdate}
          onDelete={handleAssignmentDelete}
          onLocalValuesChange={setPendingLocalValues}
        />
      </div>
    </div>
  );

  return (
    <Layout currentPage="home" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      {ocrData?.attachment && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
              Baseline Review
            </h1>
            {baseline && <BaselineStatusBadge status={baseline.status} />}
            {!baseline && baselineLoading && (
              <span style={{ fontSize: 12, color: '#64748b' }}>Loading baseline...</span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
            Reviewing extraction for: <strong>{ocrData.attachment.filename}</strong>
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {baseline?.status === 'draft' && (
              <button
                onClick={handleMarkReviewed}
                disabled={baselineLoading || reviewingBaseline}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid #bfdbfe',
                  background: baselineLoading || reviewingBaseline ? '#e2e8f0' : '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: baselineLoading || reviewingBaseline ? 'not-allowed' : 'pointer',
                }}
              >
                {reviewingBaseline ? 'Marking...' : 'Mark as Reviewed'}
              </button>
            )}
            {baseline?.status === 'reviewed' && (
              <button
                onClick={() => setIsConfirmModalOpen(true)}
                disabled={baselineLoading || confirmingBaseline}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid #4ade80',
                  background: baselineLoading || confirmingBaseline ? '#dcfce7' : '#bbf7d0',
                  color: '#166534',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: baselineLoading || confirmingBaseline ? 'not-allowed' : 'pointer',
                }}
              >
                {confirmingBaseline ? 'Confirming...' : 'Confirm Baseline'}
              </button>
            )}
            {baseline?.status === 'confirmed' && (
              <button
                disabled
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid #bbf7d0',
                  background: '#dcfce7',
                  color: '#166534',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>✓</span> Confirmed
              </button>
            )}
            {baseline?.status === 'archived' && (
              <button
                disabled
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#475569',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'not-allowed',
                }}
              >
                Archived
              </button>
            )}
          </div>
        </div>
      )}

      {taskId && (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => window.location.href = `/task/${taskId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <span>←</span> Back to Task
          </button>
        </div>
      )}

      {/* Extraction State Banner */}
      {baseline && (
        <div
          style={{
            marginBottom: 24,
            padding: '12px 16px',
            borderRadius: 12,
            background: badgeStylesValue.bg,
            border: `1px solid ${badgeStylesValue.border}`,
            color: badgeStylesValue.color,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 18 }}>
            {baseline.status === 'confirmed'
              ? '✅'
              : baseline.status === 'archived'
                ? '📁'
                : baseline.status === 'reviewed'
                  ? '🧾'
                  : '🧩'}
          </span>
          <span>
            {baseline.status === 'draft' && 'Draft baseline. Mark as reviewed before confirming.'}
            {baseline.status === 'reviewed' && 'Reviewed baseline. Confirm to lock and make it system-usable.'}
            {baseline.status === 'confirmed' && 'Confirmed baseline. The previously confirmed baseline is archived.'}
            {baseline.status === 'archived' && 'Archived baseline (view only).'}
          </span>
        </div>
      )}

      {baselineError && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 12,
            background: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>Baseline status unavailable. {baselineError}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 24,
            padding: '12px 16px',
            borderRadius: 12,
            background: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>Failed to load extraction review data. {error}</span>
        </div>
      )}

      {isLowConfidence && (
        <div
          style={{
            marginBottom: 24,
            padding: '12px 16px',
            borderRadius: 12,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontWeight: 600 }}>Low confidence extraction — please verify carefully.</span>
        </div>
      )}

      <div style={{
        marginBottom: 24,
        padding: '16px 20px',
        borderRadius: 12,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        color: '#475569',
        fontSize: 14,
        lineHeight: 1.6
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 18 }}>ℹ️</span>
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>About this review</p>
            <p style={{ margin: '4px 0 0' }}>
              This page summarizes <strong>extracted data</strong> from the document. The original file remains unchanged.
              Corrections submitted here only affect the extracted values used by the system.
            </p>
          </div>
        </div>
      </div>
      {/* Layout Panels */}
      {isMobile ? (
        <div>
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20, gap: 4 }}>
            {[
              { id: 'document', label: 'Document' },
              { id: 'text', label: 'Text' },
              { id: 'fields', label: 'Fields' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                  color: activeTab === tab.id ? '#2563eb' : '#64748b',
                  fontSize: 14,
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'document' && renderPanel1()}
          {activeTab === 'text' && renderPanel2()}
          {activeTab === 'fields' && renderPanel3()}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {renderPanel1()}
          {renderPanel2()}
          {renderPanel3()}
        </div>
      )}
      <OcrFieldEditModal
        field={editField}
        isOpen={isEditOpen}
        isSaving={savingCorrection}
        error={correctionError}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveCorrection}
      />
      {
        isCreateOpen && (
          <OcrFieldCreateModal
            isOpen={isCreateOpen}
            isSaving={creatingField}
            error={createError}
            onClose={() => {
              setIsCreateOpen(false);
              setCreateModalInitials({});
            }}
            onSave={handleCreateField}
            initialFieldName={createModalInitials.fieldName}
            initialFieldValue={createModalInitials.fieldValue}
          />
        )
      }
      <OcrCorrectionHistoryModal
        field={historyField}
        isOpen={Boolean(historyField)}
        loading={historyLoading}
        history={historyEntries}
        error={historyError}
        onClose={handleHistoryClose}
      />
      {
        isConfirmModalOpen && baseline && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: 24,
                width: 'min(520px, 92vw)',
                boxShadow: '0 20px 70px rgba(15, 23, 42, 0.15)',
                border: '1px solid #e2e8f0',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                Confirm Baseline
              </h3>
              <p style={{ marginTop: 12, marginBottom: 12, color: '#475569', lineHeight: 1.6, fontSize: 14 }}>
                This will lock the baseline and make it system-usable. Previous confirmed baseline will be archived automatically.
              </p>
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  color: '#475569',
                  fontSize: 14,
                  marginBottom: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fields Assigned:</span>
                  <strong style={{ color: '#166534' }}>{assignmentStats.assigned}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fields Empty:</span>
                  <strong style={{ color: assignmentStats.empty > 0 ? '#b91c1c' : '#475569' }}>{assignmentStats.empty}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  disabled={confirmingBaseline}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: confirmingBaseline ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBaseline}
                  disabled={confirmingBaseline}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: '1px solid #16a34a',
                    background: confirmingBaseline ? '#bbf7d0' : '#22c55e',
                    color: '#065f46',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: confirmingBaseline ? 'not-allowed' : 'pointer',
                  }}
                >
                  {confirmingBaseline ? 'Confirming...' : 'Confirm Baseline'}
                </button>
              </div>
            </div>
          </div>
        )
      }
      <CorrectionReasonModal
        isOpen={isCorrectionModalOpen}
        title={correctionPendingAction?.type === 'upsert' ? 'Confirm Overwrite' : 'Confirm Deletion'}
        message={correctionPendingAction?.type === 'upsert'
          ? `You are overwriting the assignment for ${correctionPendingAction.fieldKey}. This action requires a justification.`
          : `You are clearing the assignment for ${correctionPendingAction?.fieldKey}. This action requires a justification.`
        }
        onClose={() => {
          setIsCorrectionModalOpen(false);
          setCorrectionPendingAction(null);
        }}
        onConfirm={handleCorrectionConfirm}
      />
      <ValidationConfirmationModal
        isOpen={isValidationModalOpen}
        fieldLabel={validationPendingAction?.fieldLabel || ''}
        enteredValue={validationPendingAction?.value || ''}
        validationError={validationPendingAction?.validationError || ''}
        suggestedCorrection={validationPendingAction?.suggestedCorrection}
        onConfirm={handleValidationConfirm}
        onUseSuggestion={validationPendingAction?.suggestedCorrection ? handleValidationUseSuggestion : undefined}
        onCancel={handleValidationCancel}
      />
      <NotificationToast
        notifications={notifications}
        onDismiss={(id) => setNotifications((prev) => prev.filter((item) => item.id !== id))}
      />
    </Layout >
  );
}
