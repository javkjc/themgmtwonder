'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetchJson, isUnauthorized } from '@/app/lib/api';
import {
  fetchBaselineForAttachment,
  createDraftBaseline as createDraftBaselineApi,
} from '@/app/lib/api/baselines';
import { fetchAttachmentOcrResults } from '@/app/lib/api/ocr';
import { fetchTableSuggestions } from '@/app/lib/api/tables';
import type { Me } from '@/app/types';
import type {
  Baseline,
  OcrResultsWithCorrectionsResponse,
  TableSuggestion,
} from '../types';

export function useReviewPageData(attachmentId: string | undefined) {
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [ocrData, setOcrData] = useState<OcrResultsWithCorrectionsResponse | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [libraryFields, setLibraryFields] = useState<any[]>([]);
  const [tableSuggestions, setTableSuggestions] = useState<TableSuggestion[]>([]);

  // Auth check
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

  // Load OCR data + library fields
  const fetchOcrAndFields = useCallback(async () => {
    if (!attachmentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAttachmentOcrResults(attachmentId);
      setOcrData(data);
      const documentTypeId = data.documentTypeId;
      const fields = documentTypeId
        ? await apiFetchJson(`/document-types/${documentTypeId}/fields`)
        : await apiFetchJson('/fields?status=active');  // fallback unchanged

      const fieldsArray = fields as any[];
      (fieldsArray as any).documentTypeId = documentTypeId || null;
      setLibraryFields(fieldsArray);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load extraction review data');
    } finally {
      setLoading(false);
    }
  }, [attachmentId]);

  useEffect(() => {
    fetchOcrAndFields();
  }, [fetchOcrAndFields]);

  // Load baseline (auto-create draft if needed)
  const loadBaseline = useCallback(async () => {
    if (!attachmentId) return;
    setBaselineLoading(true);
    setBaselineError(null);
    try {
      let current = await fetchBaselineForAttachment(attachmentId);
      if (!current) {
        current = await createDraftBaselineApi(attachmentId);
        current = await fetchBaselineForAttachment(attachmentId);
      }
      setBaseline(current);
    } catch (err: unknown) {
      setBaselineError((err as Error)?.message || 'Unable to load baseline status');
    } finally {
      setBaselineLoading(false);
    }
  }, [attachmentId]);

  useEffect(() => {
    if (authLoading || !me) return;
    loadBaseline();
  }, [authLoading, loadBaseline, me]);

  // Fire prefetch when baseline and OCR data are both ready
  useEffect(() => {
    if (baseline?.id && ocrData) {
      apiFetchJson(`/baselines/${baseline.id}/suggestions/prefetch`, {
        method: 'POST',
      }).catch(() => {
        // Ignore failures completely
      });
    }
  }, [baseline?.id, ocrData]);

  // Load table suggestions
  const loadSuggestions = useCallback(async () => {
    if (!attachmentId || !me) return;
    try {
      const suggestions = await fetchTableSuggestions(attachmentId);
      setTableSuggestions(suggestions.filter(s => s.status === 'pending'));
    } catch (err) {
      console.error('Failed to fetch table suggestions:', err);
    }
  }, [attachmentId, me]);

  useEffect(() => {
    if (!attachmentId || !me) return;
    loadSuggestions();
  }, [attachmentId, me, loadSuggestions]);

  // Derived values
  const taskId = searchParams.get('taskId');

  const targetTaskId = taskId || ocrData?.attachment?.todoId || null;

  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    libraryFields.forEach((field: any) => {
      if (field?.fieldKey) {
        map[field.fieldKey] = field.label || field.fieldKey;
      }
    });
    return map;
  }, [libraryFields]);

  return {
    // Auth
    me,
    authLoading,
    logout,
    // OCR data
    ocrData,
    // Baseline
    baseline,
    setBaseline,
    baselineLoading,
    baselineError,
    setBaselineError,
    loadBaseline,
    // General loading
    loading,
    error,
    // Fields
    libraryFields,
    fieldLabelMap,
    // Tables
    tableSuggestions,
    setTableSuggestions,
    loadSuggestions,
    // IDs
    taskId,
    targetTaskId,
    // Re-fetch
    fetchOcrAndFields,
  };
}
