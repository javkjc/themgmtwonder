'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import NotificationToast, { type Notification } from '@/app/components/NotificationToast';
import OcrCorrectionHistoryModal from '@/app/components/ocr/OcrCorrectionHistoryModal';
import OcrFieldEditModal from '@/app/components/ocr/OcrFieldEditModal';
import OcrFieldCreateModal from '@/app/components/ocr/OcrFieldCreateModal';
import Layout from '@/app/components/Layout';
import BaselineStatusBadge from '@/app/components/baseline/BaselineStatusBadge';
import { API_BASE_URL, apiFetchJson } from '@/app/lib/api';
import type { AssignPayload, DeleteAssignmentPayload, Segment } from '@/app/lib/api/baselines';
import { reclassifyAttachment } from '@/app/lib/api/baselines';
import ExtractedTextPool from '@/app/components/ocr/ExtractedTextPool';
import FieldAssignmentPanel from '@/app/components/FieldAssignmentPanel';
import SuggestionTrigger from '@/app/components/suggestions/SuggestionTrigger';
import CorrectionReasonModal from '@/app/components/ocr/CorrectionReasonModal';
import ValidationConfirmationModal from '@/app/components/ValidationConfirmationModal';
import ConfirmationModal from '@/app/components/ConfirmationModal';
import TableCreationModal from '@/app/components/tables/TableCreationModal';
import TableEditorPanel from '@/app/components/tables/TableEditorPanel';
import TableSuggestionPreviewModal from '@/app/components/suggestions/TableSuggestionPreviewModal';
import TableListPanel from '@/app/components/tables/TableListPanel';
import { type VerificationField } from '@/app/components/ocr/VerificationPanel';

import { useReviewPageData } from './hooks/useReviewPageData';
import { useFieldAssignments } from './hooks/useFieldAssignments';
import { useOcrFields } from './hooks/useOcrFields';
import { useTableManagement } from './hooks/useTableManagement';
import { useBaselineActions } from './hooks/useBaselineActions';
import { DocumentPreviewPanel } from './components';
import { ChangeLogPanel } from './components';

const PdfDocumentViewer = dynamic(() => import('@/app/components/ocr/PdfDocumentViewer'), { ssr: false });
const DEFAULT_NOTIFICATION_TTL = 5000;

const badgeStyles: Record<string, { bg: string; color: string; border: string }> = {
  draft: { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' },
  reviewed: { bg: '#e0f2fe', color: '#075985', border: '#bae6fd' },
  confirmed: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  archived: { bg: '#f5f5f5', color: 'var(--text-secondary)', border: '#e5e5e5' },
};

const humanizeToken = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const UTILIZATION_REASON_LABELS: Record<string, string> = {
  record_created: 'Authoritative record created',
  workflow_committed: 'Workflow committed',
  data_exported: 'Data exported',
};

const STATUS_REASON_LABELS: Record<string, string> = {
  confirmed: 'Status: Confirmed output (read-only)',
  archived: 'Status: Archived output (view only)',
  reviewed: 'Status: Reviewed output (locked)',
};

type AssignmentTier = 'auto_confirm' | 'verify' | 'flag';

const tierBadgeStyles: Record<AssignmentTier, { bg: string; color: string; border: string; label: string }> = {
  auto_confirm: { bg: '#dcfce7', color: '#166534', border: '#86efac', label: 'Auto Confirm' },
  verify: { bg: '#fef9c3', color: '#854d0e', border: '#fde047', label: 'Verify' },
  flag: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'Flag' },
};

type ReviewManifest = {
  baselineId: string;
  attachmentId: string;
  pageCount: number;
  fields: VerificationField[];
  similarContext: Record<string, Array<{ value: string; confirmedAt: string; similarity: number }>>;
  tierCounts: { flag: number; verify: number; auto_confirm: number };
};

type RetryStatusPayload = {
  status: 'none' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'RECONCILIATION_FAILED' | 'UI_TIMEOUT';
  finalValues?: Record<string, string> | null;
  failingFieldKeys?: string[];
  errorCode?: 'RECONCILIATION_FAILED' | null;
};

type SuggestionGenerationPayload = {
  suggestedAssignments: Array<{
    fieldKey: string;
    assignedValue: string;
    validationOverride?: string | null;
  }>;
  modelVersionId: string | null;
  suggestionCount: number;
  status?: 'preliminary';
  retryJobId?: string;
  failingFieldKeys?: string[];
};

export default function AttachmentOcrReviewPage() {
  const params = useParams();
  const attachmentId = useMemo<string | undefined>(() => {
    const raw = params?.attachmentId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  // ---------- Notifications ----------
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const addNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => [...prev, notification]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
    }, DEFAULT_NOTIFICATION_TTL);
  }, []);

  // ---------- Data loading ----------
  const data = useReviewPageData(attachmentId);
  const {
    me, authLoading, logout,
    ocrData,
    baseline, setBaseline, baselineLoading, baselineError, setBaselineError, loadBaseline,
    loading, error,
    libraryFields, fieldLabelMap,
    tableSuggestions, setTableSuggestions, loadSuggestions,
    taskId, targetTaskId,
    fetchOcrAndFields,
  } = data;

  // ---------- UI state ----------
  const [highlightedSegment, setHighlightedSegment] = useState<Segment | null>(null);
  const [activeTab, setActiveTab] = useState<'document' | 'text' | 'fields'>('document');
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [reviewManifest, setReviewManifest] = useState<ReviewManifest | null>(null);
  const [activeVerificationFieldKey, setActiveVerificationFieldKey] = useState<string | null>(null);
  const [pulseFieldKey, setPulseFieldKey] = useState<string | null>(null);
  const [jumpToFieldKey, setJumpToFieldKey] = useState<string | null>(null);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [mathRetryJobId, setMathRetryJobId] = useState<string | null>(null);
  const [mathRetryStatus, setMathRetryStatus] = useState<RetryStatusPayload['status'] | null>(null);
  const [mathRetryFailingFieldKeys, setMathRetryFailingFieldKeys] = useState<string[]>([]);
  const [pollTrigger, setPollTrigger] = useState(0);
  const [reclassifying, setReclassifying] = useState(false);
  const [dismissedFieldKeys, setDismissedFieldKeys] = useState<Set<string>>(new Set());

  // Load dismissed fields from localStorage when baseline loads
  useEffect(() => {
    if (!baseline?.id) return;
    const stored = localStorage.getItem(`dismissed-fields:${baseline.id}`);
    if (stored) {
      try { setDismissedFieldKeys(new Set(JSON.parse(stored))); } catch { /* ignore */ }
    }
  }, [baseline?.id]);

  const handleDismissField = useCallback((fieldKey: string) => {
    setDismissedFieldKeys(prev => {
      const next = new Set(prev);
      next.add(fieldKey);
      if (baseline?.id) localStorage.setItem(`dismissed-fields:${baseline.id}`, JSON.stringify([...next]));
      return next;
    });
  }, [baseline?.id]);

  const handleRestoreField = useCallback((fieldKey: string) => {
    setDismissedFieldKeys(prev => {
      const next = new Set(prev);
      next.delete(fieldKey);
      if (baseline?.id) localStorage.setItem(`dismissed-fields:${baseline.id}`, JSON.stringify([...next]));
      return next;
    });
  }, [baseline?.id]);

  // ---------- Field assignments ----------
  const fields = useFieldAssignments({
    baseline, loadBaseline, libraryFields, fieldLabelMap, addNotification,
  });

  const handleTrackedAssignmentUpdate = useCallback(
    async (
      fieldKey: string,
      value: string,
      sourceSegmentId?: string,
      metadata?: (Partial<AssignPayload> & {
        suggestionAccepted?: boolean | null;
        modelVersionId?: string | null;
      }),
    ) => {
      const existing = baseline?.assignments?.find((item) => item.fieldKey === fieldKey);
      const existingModelVersionId = existing?.modelVersionId ?? null;
      const existingSuggestionAccepted = existing?.suggestionAccepted ?? null;
      const hasSuggestionContext =
        existingModelVersionId !== null ||
        existingSuggestionAccepted !== null ||
        (existing?.suggestionConfidence !== null && existing?.suggestionConfidence !== undefined);

      const resolvedMetadata: (Partial<AssignPayload> & {
        suggestionAccepted?: boolean | null;
        modelVersionId?: string | null;
      }) = { ...(metadata ?? {}) };

      if (metadata?.suggestionAccepted === true || metadata?.suggestionAccepted === false) {
        if (resolvedMetadata.modelVersionId === undefined) {
          resolvedMetadata.modelVersionId = existingModelVersionId;
        }
      } else if (metadata?.suggestionAccepted === null) {
        resolvedMetadata.modelVersionId = null;
      } else if (hasSuggestionContext) {
        resolvedMetadata.suggestionAccepted = false;
        resolvedMetadata.modelVersionId = existingModelVersionId;
      } else {
        resolvedMetadata.suggestionAccepted = null;
        resolvedMetadata.modelVersionId = null;
      }

      await fields.handleAssignmentUpdate(
        fieldKey,
        value,
        sourceSegmentId,
        resolvedMetadata as Partial<AssignPayload>,
      );
    },
    [baseline?.assignments, fields],
  );

  const handleTrackedAssignmentDelete = useCallback(
    async (fieldKey: string, metadata?: DeleteAssignmentPayload) => {
      if (!metadata?.suggestionRejected) {
        await fields.handleAssignmentDelete(fieldKey, metadata);
        return;
      }

      const existing = baseline?.assignments?.find((item) => item.fieldKey === fieldKey);
      await fields.handleAssignmentDelete(fieldKey, {
        ...metadata,
        modelVersionId: metadata.modelVersionId ?? existing?.modelVersionId ?? undefined,
      });
    },
    [baseline?.assignments, fields],
  );

  const handleGenerateSuggestionsWithRetry = useCallback(async () => {
    if (!baseline?.id) {
      throw new Error('Baseline unavailable');
    }

    const result = await apiFetchJson(
      `/baselines/${baseline.id}/suggestions/generate`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ) as SuggestionGenerationPayload;

    const count = result?.suggestionCount ?? result?.suggestedAssignments?.length ?? 0;
    if (count === 0) {
      await loadBaseline();
      addNotification({
        id: `suggestions-none-${Date.now()}`,
        type: 'error',
        title: 'No suggestions generated',
        message: 'Suggestions unavailable. Continue with manual assignment.',
      });
      throw new Error('No suggestions generated');
    }

    const failingFieldKeys = Array.from(
      new Set(
        result?.failingFieldKeys?.length
          ? result.failingFieldKeys
          : (result?.suggestedAssignments ?? [])
              .filter((item) => item.validationOverride === 'math_reconciliation_failed')
              .map((item) => item.fieldKey),
      ),
    );

    if (result?.retryJobId) {
      setMathRetryJobId(result.retryJobId);
      setMathRetryStatus('PENDING');
      setMathRetryFailingFieldKeys(failingFieldKeys);
    } else {
      setMathRetryJobId(null);
      setMathRetryStatus(null);
      setMathRetryFailingFieldKeys([]);
    }

    addNotification({
      id: `suggestions-ok-${Date.now()}`,
      type: 'success',
      title: 'Suggestions generated',
      message: `${count} field suggestions generated.`,
    });

    await loadBaseline();
    return count;
  }, [addNotification, baseline?.id, loadBaseline]);

  // ---------- Field change log (audit history) ----------
  useEffect(() => {
    if (!baseline?.id) return;
    let isMounted = true;
    const loadHistory = async () => {
      try {
        const history = await apiFetchJson(
          `/audit/resource/${baseline.id}?type=baseline_field&limit=200&offset=0`,
          { method: 'GET' },
        );
        if (!isMounted || !Array.isArray(history)) return;
        const entries = history.map((item: any) => {
          const details = item.details || {};
          const action = item.action || '';
          const fieldKey = details.fieldKey || '';
          const labelName = fieldLabelMap[fieldKey] || fieldKey || 'Field';
          let label = labelName ? `Field "${labelName}" updated` : 'Field updated';
          let detail = '';
          const target = fieldKey ? { fieldKey } : undefined;

          if (action === 'baseline.assignment.delete') {
            label = labelName ? `Field "${labelName}" cleared` : 'Field cleared';
            detail = details.correctionReason ? `Reason: ${details.correctionReason}` : '';
          } else if (action === 'baseline.assignment.upsert') {
            detail = details.correctedFrom ? `"${details.correctedFrom}" -> updated` : '';
          }
          if (item.userEmail) {
            detail = detail ? `${detail}  -  ${item.userEmail}` : `${item.userEmail}`;
          }
          return {
            id: item.id || `${Date.now()}-${Math.random()}`,
            timestamp: new Date(item.createdAt || Date.now()).getTime(),
            label,
            detail: detail || undefined,
            target,
          };
        });
        fields.setFieldChangeLog(entries);
        fields.setFieldChangeLogLoaded(true);
      } catch {
        const stored = localStorage.getItem(`field-change-log:${baseline.id}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) fields.setFieldChangeLog(parsed);
          } catch { /* Ignore invalid storage */ }
        }
        fields.setFieldChangeLogLoaded(true);
      }
    };
    loadHistory();
    return () => { isMounted = false; };
  }, [baseline?.id, fieldLabelMap]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!baseline?.id || !fields.fieldChangeLogLoaded) return;
    localStorage.setItem(`field-change-log:${baseline.id}`, JSON.stringify(fields.fieldChangeLog));
  }, [fields.fieldChangeLog, baseline?.id, fields.fieldChangeLogLoaded]);

  // ---------- OCR fields ----------
  const isBaselineLocked = baseline?.status === 'confirmed' || baseline?.status === 'archived';
  const isUtilizationLocked = Boolean(baseline?.utilizationType);
  const isFieldBuilderReadOnly = isBaselineLocked || isUtilizationLocked;
  const canMutateFields = !isFieldBuilderReadOnly;

  const assignmentTierRows = useMemo(() => {
    const rawAssignments = (baseline?.assignments ?? []) as Array<any>;
    return rawAssignments
      .map((assignment) => {
        const confidenceScore =
          typeof assignment.confidenceScore === 'number'
            ? assignment.confidenceScore
            : null;
        const tier: AssignmentTier | null =
          assignment.tier ??
          (confidenceScore === null
            ? null
            : confidenceScore >= 0.9
              ? 'auto_confirm'
              : confidenceScore >= 0.7
                ? 'verify'
                : 'flag');

        if (!tier || confidenceScore === null) {
          return null;
        }

        return {
          fieldKey: assignment.fieldKey as string,
          label: fieldLabelMap[assignment.fieldKey] || assignment.fieldKey,
          confidenceScore,
          tier,
          suggestionAccepted: assignment.suggestionAccepted as boolean | null | undefined,
        };
      })
      .filter(Boolean) as Array<{
      fieldKey: string;
      label: string;
      confidenceScore: number;
      tier: AssignmentTier;
      suggestionAccepted?: boolean | null;
    }>;
  }, [baseline?.assignments, fieldLabelMap]);

  const autoConfirmFields = useMemo(
    () => assignmentTierRows.filter((item) => item.tier === 'auto_confirm'),
    [assignmentTierRows],
  );

  const autoConfirmPendingCount = useMemo(
    () => autoConfirmFields.filter((item) => item.suggestionAccepted === null || item.suggestionAccepted === undefined).length,
    [autoConfirmFields],
  );

  const handleReclassify = useCallback(async () => {
    if (!attachmentId || reclassifying) return;
    setReclassifying(true);
    try {
      const result = await reclassifyAttachment(attachmentId);
      if (result.documentTypeId) {
        addNotification({
          type: 'success',
          message: `Classified as "${result.documentTypeName}" (${Math.round(result.confidence * 100)}% confidence). Reloading fields...`,
          ttl: DEFAULT_NOTIFICATION_TTL,
        });
        // Reload OCR data + fields so the new documentTypeId takes effect
        await fetchOcrAndFields();
      } else {
        addNotification({
          type: 'warning',
          message: 'Could not classify this document. Try assigning a document type manually.',
          ttl: DEFAULT_NOTIFICATION_TTL,
        });
      }
    } catch (e: any) {
      addNotification({ type: 'error', message: e?.message || 'Classification failed', ttl: DEFAULT_NOTIFICATION_TTL });
    } finally {
      setReclassifying(false);
    }
  }, [attachmentId, reclassifying, addNotification, fetchOcrAndFields]);

  const handleBulkConfirmSuggestions = useCallback(async () => {
    if (!baseline?.id || !canMutateFields || bulkConfirming) return;
    setBulkConfirming(true);
    try {
      const result = await apiFetchJson(
        `/baselines/${baseline.id}/suggestions/bulk-confirm`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      setReviewManifest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fields: prev.fields.map((field) =>
            field.tier === 'auto_confirm' && field.suggestionAccepted === null
              ? { ...field, suggestionAccepted: true }
              : field,
          ),
        };
      });
      await loadBaseline();
      addNotification({
        id: `bulk-confirm-${Date.now()}`,
        type: 'success',
        title: 'High-confidence fields confirmed',
        message: `${result?.count ?? 0} suggestion(s) confirmed.`,
      });
    } catch (e: any) {
      addNotification({
        id: `bulk-confirm-error-${Date.now()}`,
        type: 'error',
        title: 'Bulk confirm failed',
        message: e?.message || 'Failed to confirm high-confidence fields.',
      });
    } finally {
      setBulkConfirming(false);
    }
  }, [addNotification, baseline?.id, bulkConfirming, canMutateFields, loadBaseline]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key !== 'Enter') return;
      if (!baseline?.id || !canMutateFields || autoConfirmFields.length === 0) return;
      event.preventDefault();
      void handleBulkConfirmSuggestions();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [autoConfirmFields.length, baseline?.id, canMutateFields, handleBulkConfirmSuggestions]);

  useEffect(() => {
    if (!baseline?.id) {
      setReviewManifest(null);
      return;
    }
    let cancelled = false;
    const loadManifest = async () => {
      try {
        const manifest = await apiFetchJson(
          `/baselines/${baseline.id}/review-manifest`,
          { method: 'GET' },
        ) as ReviewManifest;
        if (!cancelled) {
          setReviewManifest(manifest);
        }
      } catch {
        if (!cancelled) {
          setReviewManifest(null);
        }
      }
    };
    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, [baseline?.id]);

  useEffect(() => {
    if (!baseline?.assignments) return;
    setReviewManifest((prev) => {
      if (!prev) return prev;
      const assignmentByField = new Map(
        baseline.assignments!.map((assignment) => [assignment.fieldKey, assignment]),
      );
      return {
        ...prev,
        fields: prev.fields.map((field) => {
          const assignment = assignmentByField.get(field.fieldKey);
          if (!assignment) return field;
          return {
            ...field,
            suggestedValue: assignment.assignedValue ?? null,
            suggestionAccepted: assignment.suggestionAccepted ?? null,
          };
        }),
      };
    });
  }, [baseline?.assignments]);

  const ocr = useOcrFields({
    ocrData, canMutateFields, addNotification, fetchOcrAndFields,
  });

  // ---------- Table management ----------
  const tables = useTableManagement({
    baseline, attachmentId, addNotification, loadBaseline, loadSuggestions, setTableSuggestions,
  });

  // ---------- Baseline actions ----------
  const hasDraftTables = baseline?.tables?.some((t) => t.status === 'draft') ?? false;

  const baselineActions = useBaselineActions({
    baseline, loadBaseline, setBaseline, setBaselineError,
    libraryFields, pendingLocalValues: fields.pendingLocalValues,
    hasDraftTables, targetTaskId, addNotification,
  });

  // ---------- Derived ----------
  const documentUrl = attachmentId ? `${API_BASE_URL}/attachments/${attachmentId}/download` : '';
  const badgeStylesValue = baseline?.status ? (badgeStyles[baseline.status] || badgeStyles.draft) : badgeStyles.draft;
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;

  const statusFallbackLabel = baseline?.status ? `Status: ${humanizeToken(baseline.status)}` : 'Status unavailable';
  const readOnlyReason = isUtilizationLocked
    ? UTILIZATION_REASON_LABELS[baseline?.utilizationType ?? ''] ?? 'Data in use'
    : isBaselineLocked
      ? STATUS_REASON_LABELS[baseline?.status ?? ''] ?? statusFallbackLabel
      : undefined;

  const assignmentStats = useMemo(() => {
    const totalFields = libraryFields.length;
    const assigned = libraryFields.filter((field) =>
      baseline?.assignments?.some((a) => a.fieldKey === field.fieldKey && a.assignedValue !== null)
    ).length;
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

  const spatialOrderedFields = useMemo(() => {
    const manifestFields = reviewManifest?.fields ?? [];
    const manifestByKey = new Map(
      manifestFields.map((field) => [field.fieldKey, field] as const),
    );
    const assignments = (baseline?.assignments ?? []) as Array<any>;
    const assignmentByKey = new Map(
      assignments.map((assignment) => [assignment.fieldKey, assignment] as const),
    );

    const deriveTier = (
      confidenceScore: number | null,
    ): AssignmentTier | null => {
      if (confidenceScore === null || Number.isNaN(confidenceScore)) return null;
      if (confidenceScore >= 0.9) return 'auto_confirm';
      if (confidenceScore >= 0.7) return 'verify';
      return 'flag';
    };

    const merged = libraryFields.map((libraryField: any) => {
      const fieldKey = libraryField.fieldKey as string;
      const manifestField = manifestByKey.get(fieldKey);
      const assignment = assignmentByKey.get(fieldKey);

      if (manifestField) {
        return {
          ...manifestField,
          suggestedValue:
            assignment?.assignedValue ?? manifestField.suggestedValue ?? null,
          suggestionAccepted:
            assignment?.suggestionAccepted ?? manifestField.suggestionAccepted ?? null,
        };
      }

      const confidenceScore =
        typeof assignment?.confidenceScore === 'number'
          ? assignment.confidenceScore
          : null;

      return {
        fieldKey,
        suggestedValue: assignment?.assignedValue ?? null,
        confidenceScore,
        tier: (assignment?.tier ?? deriveTier(confidenceScore)) as AssignmentTier | null,
        zone: assignment?.zone ?? null,
        boundingBox: assignment?.boundingBox ?? null,
        pageNumber: 1,
        extractionMethod: assignment?.extractionMethod ?? null,
        suggestionAccepted: assignment?.suggestionAccepted ?? null,
      } as VerificationField;
    });

    // Preserve any manifest-only fields not present in the current library list.
    for (const manifestField of manifestFields) {
      if (!merged.some((field) => field.fieldKey === manifestField.fieldKey)) {
        merged.push(manifestField);
      }
    }

    return merged.sort((a, b) => {
      if (a.boundingBox && b.boundingBox) {
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        return a.boundingBox.y - b.boundingBox.y;
      }
      if (a.boundingBox && !b.boundingBox) return -1;
      if (!a.boundingBox && b.boundingBox) return 1;
      return a.fieldKey.localeCompare(b.fieldKey);
    });
  }, [baseline?.assignments, libraryFields, reviewManifest?.fields]);

  const fieldsWithBoundingBox = useMemo(
    () => spatialOrderedFields.filter((field) => field.boundingBox !== null),
    [spatialOrderedFields],
  );

  const fieldsWithoutBoundingBox = useMemo(
    () => spatialOrderedFields.filter((field) => field.boundingBox === null),
    [spatialOrderedFields],
  );

  const activeVerificationField = useMemo(
    () =>
      reviewManifest?.fields.find(
        (field) =>
          field.fieldKey === activeVerificationFieldKey && field.boundingBox !== null,
      ) ?? null,
    [activeVerificationFieldKey, reviewManifest?.fields],
  );

  const mathRetryFailureSet = useMemo(
    () => new Set(mathRetryFailingFieldKeys),
    [mathRetryFailingFieldKeys],
  );

  const handleVerificationHover = useCallback((field: VerificationField | null) => {
    setActiveVerificationFieldKey(field?.fieldKey ?? null);
  }, []);

  const triggerFieldPulse = useCallback((fieldKey: string) => {
    setActiveVerificationFieldKey(fieldKey);
    setJumpToFieldKey(fieldKey);
    setPulseFieldKey(fieldKey);
    setTimeout(() => {
      setPulseFieldKey((prev) => (prev === fieldKey ? null : prev));
    }, 1200);
  }, []);

  useEffect(() => {
    if (!attachmentId || !mathRetryJobId) {
      return;
    }

    let active = true;
    let stopped = false;

    const pollRetryStatus = async () => {
      if (!active || stopped) return;

      try {
        const payload = await apiFetchJson(
          `/attachments/${attachmentId}/retry-status`,
          { method: 'GET' },
        ) as RetryStatusPayload;

        if (!active || stopped) return;

        if (payload.status === 'none') {
          setMathRetryJobId(null);
          setMathRetryStatus(null);
          setMathRetryFailingFieldKeys([]);
          stopped = true;
          return;
        }

        setMathRetryStatus(payload.status);
        if (Array.isArray(payload.failingFieldKeys) && payload.failingFieldKeys.length > 0) {
          setMathRetryFailingFieldKeys(payload.failingFieldKeys);
        }

        if (payload.status === 'COMPLETED') {
          const finalValues = payload.finalValues ?? {};
          if (finalValues && Object.keys(finalValues).length > 0) {
            setBaseline((prev) => {
              if (!prev) return prev;
              const assignments = (prev.assignments ?? []).map((assignment: any) =>
                Object.prototype.hasOwnProperty.call(finalValues, assignment.fieldKey)
                  ? { ...assignment, assignedValue: finalValues[assignment.fieldKey] }
                  : assignment,
              );
              return { ...prev, assignments };
            });

            setReviewManifest((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                fields: prev.fields.map((field) =>
                  Object.prototype.hasOwnProperty.call(finalValues, field.fieldKey)
                    ? { ...field, suggestedValue: finalValues[field.fieldKey] }
                    : field,
                ),
              };
            });
          }

          setMathRetryJobId(null);
          setMathRetryStatus(null);
          stopped = true;
          return;
        }

        if (payload.status === 'RECONCILIATION_FAILED') {
          stopped = true;
          return;
        }
      } catch {
        // Ignore polling errors, next interval tick will retry.
      }
    };

    void pollRetryStatus();
    const timer = setInterval(() => {
      void pollRetryStatus();
    }, 3000);
    const timeoutId = setTimeout(() => {
      stopped = true;
      // Do NOT clear mathRetryJobId — preserve it for manual re-poll
      setMathRetryStatus('UI_TIMEOUT');
      setMathRetryFailingFieldKeys([]);
    }, 30_000);

    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(timeoutId);
    };
  }, [attachmentId, mathRetryJobId, pollTrigger, setBaseline]);

  const handleVerificationSave = useCallback(async (fieldKey: string, value: string) => {
    await handleTrackedAssignmentUpdate(fieldKey, value);
    setReviewManifest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: prev.fields.map((field) =>
          field.fieldKey === fieldKey ? { ...field, suggestedValue: value } : field,
        ),
      };
    });
  }, [handleTrackedAssignmentUpdate]);

  const handleVerificationClear = useCallback(async (fieldKey: string) => {
    const existing = baseline?.assignments?.find((item) => item.fieldKey === fieldKey);
    const hasSuggestionContext =
      (existing?.modelVersionId !== null &&
        existing?.modelVersionId !== undefined) ||
      (existing?.suggestionAccepted !== null &&
        existing?.suggestionAccepted !== undefined) ||
      (existing?.suggestionConfidence !== null &&
        existing?.suggestionConfidence !== undefined);

    if (hasSuggestionContext) {
      await handleTrackedAssignmentDelete(fieldKey, {
        suggestionRejected: true,
        modelVersionId: existing?.modelVersionId ?? undefined,
        suggestionConfidence: existing?.suggestionConfidence ?? undefined,
      });
    } else {
      await handleTrackedAssignmentDelete(fieldKey);
    }

    setReviewManifest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: prev.fields.map((field) =>
          field.fieldKey === fieldKey
            ? {
              ...field,
              suggestedValue: null,
              suggestionAccepted: hasSuggestionContext ? false : null,
            }
            : field,
        ),
      };
    });
  }, [baseline?.assignments, handleTrackedAssignmentDelete]);

  const handleVerificationAccept = useCallback(async (fieldKey: string) => {
    const manifestField = reviewManifest?.fields.find(f => f.fieldKey === fieldKey);
    const fallbackValue = manifestField?.suggestedValue ?? undefined;
    await fields.handleAccept(fieldKey, fallbackValue);
    setReviewManifest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: prev.fields.map((field) =>
          field.fieldKey === fieldKey
            ? { ...field, suggestionAccepted: true }
            : field,
        ),
      };
    });
  }, [fields, reviewManifest?.fields]);

  // ---------- Guards ----------
  if (authLoading) return null;
  if (!me) {
    if (typeof window !== 'undefined') window.location.href = '/';
    return null;
  }

  // ---------- Panel renderers ----------
  const renderPanel2 = () => (
    <div style={{ flex: '1 1 30%', minWidth: isMobile ? '100%' : 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>2. Extracted Text</div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{baseline?.segments?.length || 0} segments</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: isMobile ? 'auto' : 'calc(100vh - 350px)', paddingRight: 4 }}>
        <ExtractedTextPool
          segments={baseline?.segments || []}
          onHighlight={setHighlightedSegment}
          onDragStart={(e: React.DragEvent, s: any) => { e.dataTransfer.setData('application/json', JSON.stringify(s)); }}
          selectedIds={tables.selectedSegmentIds}
          onToggleSelection={tables.handleToggleSegmentSelection}
          onSelectAll={tables.handleSelectAllSegments}
        />
      </div>
    </div>
  );

  const renderPanel3 = () => (
    <div style={{ flex: '1 1 30%', minWidth: isMobile ? '100%' : 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => tables.setSidebarTab('fields')} style={{ background: 'none', border: 'none', borderBottom: tables.sidebarTab === 'fields' ? '2px solid #E11D48' : '2px solid transparent', color: tables.sidebarTab === 'fields' ? '#E11D48' : '#737373', fontWeight: tables.sidebarTab === 'fields' ? 700 : 500, cursor: 'pointer', fontSize: 13, padding: '0 4px 6px' }}>
            Fields ({assignmentStats.assigned}/{libraryFields.length})
          </button>
          <button onClick={() => tables.setSidebarTab('tables')} style={{ background: 'none', border: 'none', borderBottom: tables.sidebarTab === 'tables' ? '2px solid #E11D48' : '2px solid transparent', color: tables.sidebarTab === 'tables' ? '#E11D48' : '#737373', fontWeight: tables.sidebarTab === 'tables' ? 700 : 500, cursor: 'pointer', fontSize: 13, padding: '0 4px 6px' }}>
            Tables ({baseline?.tables?.length || 0})
          </button>
        </div>
        {tables.sidebarTab === 'fields' && !isFieldBuilderReadOnly && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SuggestionTrigger disabled={!baseline?.id || baselineLoading} onGenerate={handleGenerateSuggestionsWithRetry} />
            {autoConfirmFields.length > 0 && (
              <button
                onClick={handleBulkConfirmSuggestions}
                disabled={!baseline?.id || bulkConfirming || autoConfirmPendingCount === 0}
                title="Shift+Enter"
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #16a34a',
                  background: '#dcfce7',
                  color: '#166534',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: !baseline?.id || bulkConfirming || autoConfirmPendingCount === 0 ? 'not-allowed' : 'pointer',
                  opacity: !baseline?.id || bulkConfirming || autoConfirmPendingCount === 0 ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {bulkConfirming ? 'Confirming...' : 'Confirm High-Confidence Fields'}
              </button>
            )}
          </div>
        )}
        {tables.sidebarTab === 'tables' && !isFieldBuilderReadOnly && (
          <button onClick={tables.handleDetectTables} disabled={tables.detectingTables || !baseline?.id} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: tables.detectingTables || !baseline?.id ? 'not-allowed' : 'pointer', opacity: tables.detectingTables || !baseline?.id ? 0.6 : 1 }}>
            {tables.detectingTables ? 'Detecting...' : 'Get Suggestions'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 0, position: 'relative' }}>
        {tables.sidebarTab === 'fields' ? (
          <>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: isMobile ? 'auto' : 'calc(100vh - 350px)', paddingRight: 4 }}>
              {(() => {
                const assignments = baseline?.assignments || [];
                const generatedCount = assignments.filter(a => a.assignedValue && a.suggestionConfidence !== null && a.suggestionConfidence !== undefined).length;
                const manualCount = assignments.filter(a => a.assignedValue && (a.suggestionConfidence === null || a.suggestionConfidence === undefined)).length;
                const flagCount = assignments.filter(a => a.tier === 'flag').length;
                if (assignments.length === 0) return null;
                return (
                  <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
                      Generated: {generatedCount}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: '#f5f5f5', border: '1px solid #d4d4d4', color: '#525252' }}>
                      Manual: {manualCount}
                    </span>
                    {flagCount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b' }}>
                        Flag: {flagCount}
                      </span>
                    )}
                  </div>
                );
              })()}
              <FieldAssignmentPanel
                fields={libraryFields}
                assignments={baseline?.assignments || []}
                isReadOnly={isFieldBuilderReadOnly}
                readOnlyReason={readOnlyReason}
                onUpdate={handleTrackedAssignmentUpdate}
                onDelete={handleTrackedAssignmentDelete}
                onAccept={fields.handleAccept}
                onLocalValuesChange={fields.setPendingLocalValues}
                resetLocalField={fields.resetLocalField}
                highlightFieldKey={fields.highlightFieldKey}
                segments={baseline?.segments || []}
                similarContext={reviewManifest?.similarContext ?? {}}
                dismissedFields={dismissedFieldKeys}
                onDismissField={isFieldBuilderReadOnly ? undefined : handleDismissField}
                onRestoreField={isFieldBuilderReadOnly ? undefined : handleRestoreField}
              />
            </div>
            {!isMobile && (
              <div style={{ position: 'absolute', top: 8, right: 24, bottom: 72, zIndex: 30 }}>
                <ChangeLogPanel
                  entries={fields.fieldChangeLog}
                  collapsed={fields.fieldChangeLogCollapsed}
                  onToggleCollapse={fields.setFieldChangeLogCollapsed}
                  onHighlightField={(fieldKey) => {
                    fields.setHighlightFieldKey(fieldKey);
                    setTimeout(() => fields.setHighlightFieldKey(null), 2000);
                  }}
                />
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: isMobile ? 'auto' : 'calc(100vh - 350px)', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tableSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Suggested Tables ({tableSuggestions.length})</div>
                {tableSuggestions.map((suggestion) => (
                  <div key={suggestion.id} style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--surface-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>Table</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{suggestion.suggestedLabel || `Table ${suggestion.rowCount}x${suggestion.columnCount}`}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {suggestion.rowCount} rows x {suggestion.columnCount} columns
                        <span style={{ marginLeft: 8, color: '#E11D48', fontWeight: 600 }}>{Math.round(suggestion.confidence * 100)}% confidence</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => tables.handlePreviewTableSuggestion(suggestion)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #E11D48', background: 'var(--surface)', color: '#E11D48', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Preview</button>
                      <button onClick={() => tables.handleIgnoreTableSuggestion(suggestion)} style={{ padding: '6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }} title="Ignore suggestion">x</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Created Tables ({baseline?.tables?.length || 0})</div>
              <TableListPanel
                tables={baseline?.tables || []}
                activeTableId={tables.activeTable?.table.id || null}
                onSelectTable={tables.loadTableDetail}
                onDeleteTable={tables.handleDeleteTable}
                onCreateTable={() => tables.setIsTableCreationOpen(true)}
                isReadOnly={isFieldBuilderReadOnly}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderTableEditor = () => {
    if (!tables.activeTable) return null;
    return (
      <TableEditorPanel
        table={tables.activeTable.table}
        cells={tables.activeTable.cells}
        columnMappings={tables.activeTable.columnMappings}
        fields={libraryFields}
        isReadOnly={isFieldBuilderReadOnly}
        baselineStatus={baseline?.status}
        onRefresh={async () => { await tables.loadTableDetail(tables.activeTable!.table.id); await loadBaseline(); }}
        onClose={() => tables.setActiveTable(null)}
        onNotification={addNotification}
      />
    );
  };

  // ---------- Render ----------
  return (
    <Layout currentPage="home" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      {/* Header */}
      {ocrData?.attachment && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>Baseline Review</h1>
              {baseline && <BaselineStatusBadge status={baseline.status} />}
              {!baseline && baselineLoading && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading baseline...</span>}
              <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 8 }}><strong>{ocrData.attachment.filename}</strong></span>
              {/* Document type badge */}
              {ocrData.documentTypeId ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: '#ede9fe', color: '#6d28d9', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                  {ocrData.documentTypeName ?? ocrData.documentTypeId}
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                  Unclassified
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Classify / re-classify button */}
              <button
                onClick={handleReclassify}
                disabled={reclassifying}
                title={ocrData.documentTypeId ? 'Re-run document type classification' : 'Classify this document'}
                style={{ padding: '7px 13px', borderRadius: 6, border: '1px solid #c4b5fd', background: reclassifying ? '#ede9fe' : '#f5f3ff', color: '#6d28d9', fontSize: 13, fontWeight: 600, cursor: reclassifying ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
              >
                {reclassifying ? 'Classifying...' : ocrData.documentTypeId ? 'Re-classify' : 'Classify'}
              </button>
              {taskId && (
                <button onClick={() => window.location.href = `/task/${taskId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface-secondary)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'var(--surface)'; }}>
                  <span>{'<-'}</span> Back to Task
                </button>
              )}
              {baseline?.status === 'draft' && (
                <button onClick={baselineActions.handleMarkReviewed} disabled={baselineLoading || baselineActions.reviewingBaseline} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: baselineLoading || baselineActions.reviewingBaseline ? 'not-allowed' : 'pointer' }}>
                  {baselineActions.reviewingBaseline ? 'Marking...' : 'Mark as Reviewed'}
                </button>
              )}
              {baseline?.status === 'reviewed' && (
                <button onClick={() => baselineActions.setIsConfirmModalOpen(true)} disabled={hasDraftTables || baselineLoading || baselineActions.confirmingBaseline} title={hasDraftTables ? 'All tables must be confirmed first' : 'Confirm baseline'} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #4ade80', background: baselineLoading || baselineActions.confirmingBaseline ? '#dcfce7' : '#bbf7d0', color: '#166534', fontSize: 14, fontWeight: 700, cursor: hasDraftTables || baselineLoading || baselineActions.confirmingBaseline ? 'not-allowed' : 'pointer' }}>
                  {baselineActions.confirmingBaseline ? 'Confirming...' : 'Confirm Baseline'}
                </button>
              )}
              {baseline?.status === 'confirmed' && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Read-only view</span>
              )}
              {baseline?.status === 'archived' && (
                <button disabled style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'not-allowed' }}>Archived</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Banners */}
      {baseline && baseline.status === 'draft' && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: badgeStylesValue.bg, border: `1px solid ${badgeStylesValue.border}`, color: badgeStylesValue.color, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          <span style={{ fontSize: 16 }}>Info</span>
          <span>Draft baseline. Mark as reviewed before confirming.</span>
        </div>
      )}
      {baselineError && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>!</span>
          <span>Baseline status unavailable. {baselineError}</span>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>!</span>
          <span>Failed to load extraction review data. {error}</span>
        </div>
      )}
      {isLowConfidence && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>!</span>
          <span style={{ fontWeight: 600 }}>Low confidence extraction - please verify carefully.</span>
        </div>
      )}
      {mathRetryJobId && (mathRetryStatus === 'PENDING' || mathRetryStatus === 'RUNNING') && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>i</span>
          <span style={{ fontWeight: 600 }}>Verifying math...</span>
        </div>
      )}
      {mathRetryStatus === 'RECONCILIATION_FAILED' && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>!</span>
          <span style={{ fontWeight: 600 }}>
            Math reconciliation failed - manual review required
            {mathRetryFailingFieldKeys.length > 0 ? ` (${mathRetryFailingFieldKeys.join(', ')})` : ''}.
          </span>
        </div>
      )}
      {mathRetryStatus === 'UI_TIMEOUT' && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>!</span>
          <span>Still processing - this may take longer on this device.</span>
          <button
            onClick={() => {
              setMathRetryStatus('PENDING');
              setPollTrigger((prev) => prev + 1);
            }}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Check Status
          </button>
        </div>
      )}
      <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 12, background: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 16 }}>i</span>
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>About this review</p>
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
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e5', marginBottom: 20, gap: 4, overflowX: 'auto' }}>
            {[{ id: 'document', label: 'Document' }, { id: 'text', label: 'Text' }, { id: 'fields', label: 'Fields & Tables' }].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{ flex: 1, whiteSpace: 'nowrap', padding: '12px 8px', background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #E11D48' : '2px solid transparent', color: activeTab === tab.id ? '#E11D48' : '#737373', fontSize: 14, fontWeight: activeTab === tab.id ? 700 : 500, cursor: 'pointer' }}>
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'document' && (
            <DocumentPreviewPanel ocrData={ocrData} documentUrl={documentUrl} highlightedSegment={highlightedSegment} selectedField={ocr.selectedField} documentError={documentError} onDocumentError={setDocumentError} isMobile={isMobile} />
          )}
          {activeTab === 'text' && renderPanel2()}
          {activeTab === 'fields' && tables.activeTable ? (
            <div style={{ height: 'calc(100vh - 200px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button onClick={() => tables.setActiveTable(null)} style={{ padding: 12, background: 'var(--surface-secondary)', border: 'none', borderBottom: '1px solid #e5e5e5', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left' }}>{'<-'} Back to List</button>
              {renderTableEditor()}
            </div>
          ) : activeTab === 'fields' ? renderPanel3() : null}
        </div>
      ) : tables.activeTable ? (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', height: 'calc(100vh - 250px)' }}>
          <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', height: '100%' }}>{renderPanel3()}</div>
          <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: '100%' }}>{renderTableEditor()}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <DocumentPreviewPanel ocrData={ocrData} documentUrl={documentUrl} highlightedSegment={highlightedSegment} selectedField={ocr.selectedField} documentError={documentError} onDocumentError={setDocumentError} isMobile={isMobile} />
          {renderPanel2()}
          {renderPanel3()}
        </div>
      )}

      {/* Modals */}
      <OcrFieldEditModal field={ocr.editField} isOpen={ocr.isEditOpen} isSaving={ocr.savingCorrection} error={ocr.correctionError} onClose={ocr.onEditClose} onSave={ocr.handleSaveCorrection} />
      {ocr.isCreateOpen && (
        <OcrFieldCreateModal isOpen={ocr.isCreateOpen} isSaving={ocr.creatingField} error={ocr.createError} onClose={() => { ocr.setIsCreateOpen(false); ocr.setCreateModalInitials({}); }} onSave={ocr.handleCreateField} initialFieldName={ocr.createModalInitials.fieldName} initialFieldValue={ocr.createModalInitials.fieldValue} />
      )}
      <OcrCorrectionHistoryModal field={ocr.historyField} isOpen={Boolean(ocr.historyField)} loading={ocr.historyLoading} history={ocr.historyEntries} error={ocr.historyError} onClose={ocr.handleHistoryClose} />
      {baselineActions.isConfirmModalOpen && baseline && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 6, padding: 24, width: 'min(520px, 92vw)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Confirm Baseline</h3>
            <p style={{ marginTop: 12, marginBottom: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>
              You are about to confirm this baseline. Once confirmed, this baseline becomes <strong>read-only</strong>. You cannot edit fields or delete assignments after confirmation.
            </p>
            <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fff7ed', border: '1px solid #ffedd5', color: '#9a3412', fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>!</span><span>Warning: This will lock the baseline and make it system-usable.</span>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: 'var(--surface-secondary)', border: '1px dashed #d4d4d4', color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fields Assigned:</span><strong style={{ color: '#166534' }}>{assignmentStats.assigned} fields</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fields Empty:</span><strong style={{ color: assignmentStats.empty > 0 ? '#b91c1c' : '#525252' }}>{assignmentStats.empty} fields</strong></div>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Previous confirmed baseline (if exists) will be automatically archived.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => baselineActions.setIsConfirmModalOpen(false)} disabled={baselineActions.confirmingBaseline} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: baselineActions.confirmingBaseline ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button onClick={baselineActions.handleConfirmBaseline} disabled={hasDraftTables || baselineActions.confirmingBaseline} title={hasDraftTables ? 'All tables must be confirmed first' : 'Confirm baseline'} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #16a34a', background: baselineActions.confirmingBaseline || hasDraftTables ? '#bbf7d0' : '#22c55e', color: '#065f46', fontSize: 14, fontWeight: 700, cursor: baselineActions.confirmingBaseline || hasDraftTables ? 'not-allowed' : 'pointer' }}>
                {baselineActions.confirmingBaseline ? 'Confirming...' : 'Confirm Baseline'}
              </button>
            </div>
          </div>
        </div>
      )}
      <CorrectionReasonModal
        isOpen={fields.isCorrectionModalOpen}
        title={fields.correctionPendingAction?.type === 'upsert' ? 'Confirm Overwrite' : 'Confirm Deletion'}
        message={fields.correctionPendingAction?.type === 'upsert'
          ? `You are overwriting the assignment for ${fields.correctionPendingAction.fieldKey}. This action requires a justification.`
          : `You are clearing the assignment for ${fields.correctionPendingAction?.fieldKey}. This action requires a justification.`
        }
        onClose={fields.handleCorrectionCancel}
        onConfirm={fields.handleCorrectionConfirm}
      />
      <ValidationConfirmationModal
        isOpen={fields.isValidationModalOpen}
        fieldLabel={fields.validationPendingAction?.fieldLabel || ''}
        enteredValue={fields.validationPendingAction?.value || ''}
        validationError={fields.validationPendingAction?.validationError || ''}
        suggestedCorrection={fields.validationPendingAction?.suggestedCorrection}
        onConfirm={fields.handleValidationConfirm}
        onUseSuggestion={fields.validationPendingAction?.suggestedCorrection ? fields.handleValidationUseSuggestion : undefined}
        onCancel={fields.handleValidationCancel}
      />
      <TableCreationModal isOpen={tables.isTableCreationOpen} onClose={() => tables.setIsTableCreationOpen(false)} onCreate={tables.handleCreateTable} selectedSegments={baseline?.segments?.filter(s => tables.selectedSegmentIds.has(s.id as string)) || []} />
      <ConfirmationModal isOpen={!!tables.deleteTableModal} onClose={() => tables.setDeleteTableModal(null)} onConfirm={tables.confirmDeleteTable} title="Delete Table" message={`Are you sure you want to delete "${tables.deleteTableModal?.tableLabel || `Table #${(tables.deleteTableModal?.tableIndex ?? 0) + 1}`}"? This action cannot be undone.`} confirmLabel="Delete Table" confirmStyle="danger" />
      <NotificationToast notifications={notifications} onDismiss={(id) => setNotifications((prev) => prev.filter((item) => item.id !== id))} />
      <TableSuggestionPreviewModal isOpen={tables.isTablePreviewOpen} onClose={() => tables.setIsTablePreviewOpen(false)} onConvert={tables.handleConvertTableSuggestion} suggestion={tables.previewSuggestion} isConverting={!!tables.convertingSuggestionId} />
    </Layout>
  );
}
