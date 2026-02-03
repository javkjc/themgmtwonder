'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import NotificationToast, { type Notification } from '@/app/components/NotificationToast';
import PdfDocumentViewer from '@/app/components/ocr/PdfDocumentViewer';
import OcrCorrectionHistoryModal from '@/app/components/ocr/OcrCorrectionHistoryModal';
import OcrFieldEditModal from '@/app/components/ocr/OcrFieldEditModal';
import OcrFieldList from '@/app/components/ocr/OcrFieldList';
import Layout from '@/app/components/Layout';

import { API_BASE_URL, apiFetchJson, isUnauthorized } from '@/app/lib/api';
import {
  createOcrCorrection,
  fetchAttachmentOcrResults,
  fetchOcrCorrectionHistory,
  type OcrCorrectionHistoryItem,
  type OcrField,
  type OcrResultsWithCorrectionsResponse,
} from '@/app/lib/api/ocr';
import type { Me } from '@/app/types';


const DEFAULT_NOTIFICATION_TTL = 5000;

const badgeStyles: Record<string, { bg: string; color: string; border: string }> = {
  draft: { bg: '#fff7ed', color: '#c2410c', border: '#ffedd5' },
  confirmed: { bg: '#f0fdf4', color: '#166534', border: '#dcfce7' },
  archived: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      setTaskId(urlParams.get('taskId'));
    }
  }, []);

  const documentUrl = attachmentId
    ? `${API_BASE_URL}/attachments/${attachmentId}/download`
    : '';

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
      } catch (e: any) {
        if (isUnauthorized(e)) {
          setMe(null);
        }
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const fetchData = useCallback(async () => {
    if (!attachmentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAttachmentOcrResults(attachmentId);
      setOcrData(data);
      setSelectedFieldId((prev) => {
        if (prev && data.parsedFields.some((field) => field.id === prev)) {
          return prev;
        }
        return data.parsedFields[0]?.id ?? null;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load extraction review data');
    } finally {
      setLoading(false);
    }
  }, [attachmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedField = useMemo(() => {
    return ocrData?.parsedFields.find((field) => field.id === selectedFieldId) ?? null;
  }, [ocrData, selectedFieldId]);

  const isLowConfidence = useMemo(() => {
    if (!ocrData || ocrData.parsedFields.length === 0) return false;
    const fieldsWithConfidence = ocrData.parsedFields.filter(
      (f) => f.confidence !== undefined && f.confidence !== null
    );
    if (fieldsWithConfidence.length === 0) return false;
    return fieldsWithConfidence.every((f) => f.confidence! < 0.6);
  }, [ocrData]);

  const handleOpenEdit = useCallback((field: OcrField) => {
    setEditField(field);
    setCorrectionError(null);
    setIsEditOpen(true);
  }, []);

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
      } catch (err: any) {
        setCorrectionError(err?.message || 'Unable to save correction');
      } finally {
        setSavingCorrection(false);
      }
    },
    [addNotification, editField, fetchData],
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
      .catch((err: any) => {
        setHistoryError(err?.message || 'Unable to load history');
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

  return (
    <Layout currentPage="home" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      {ocrData?.attachment && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
              Extracted Data Review
            </h1>
            {ocrData?.rawOcr && (
              <span style={{
                padding: '2px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'capitalize',
                background: badgeStyles[ocrData.rawOcr.status]?.bg || '#f1f5f9',
                color: badgeStyles[ocrData.rawOcr.status]?.color || '#475569',
                border: `1px solid ${badgeStyles[ocrData.rawOcr.status]?.border || '#e2e8f0'}`,
              }}>
                {ocrData.rawOcr.status}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
            Reviewing extraction for: <strong>{ocrData.attachment.filename}</strong>
          </p>
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
      {ocrData?.rawOcr && (
        <div
          style={{
            marginBottom: 24,
            padding: '12px 16px',
            borderRadius: 12,
            background: badgeStyles[ocrData.rawOcr.status]?.bg || '#f1f5f9',
            border: `1px solid ${badgeStyles[ocrData.rawOcr.status]?.border || '#e2e8f0'}`,
            color: badgeStyles[ocrData.rawOcr.status]?.color || '#475569',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 18 }}>
            {ocrData.rawOcr.status === 'confirmed' ? '✅' : ocrData.rawOcr.status === 'archived' ? '📁' : '📝'}
          </span>
          <span>
            {ocrData.rawOcr.status === 'draft' && "This is a draft extraction. Confirm to make it the baseline."}
            {ocrData.rawOcr.status === 'confirmed' && "This is the confirmed baseline extraction."}
            {ocrData.rawOcr.status === 'archived' && "This extraction is archived (view only)."}
          </span>
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
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
          <div style={{ marginBottom: 12, color: '#475569', fontSize: 14 }}>
            Document
          </div>
          <PdfDocumentViewer
            title={ocrData?.attachment?.filename ?? 'Attachment'}
            documentUrl={documentUrl}
            mimeType={ocrData?.attachment?.mimeType ?? null}
            fileName={ocrData?.attachment?.filename ?? null}
            highlightedField={
              selectedField
                ? { pageNumber: selectedField.pageNumber, boundingBox: selectedField.boundingBox }
                : null
            }
            onDocumentError={handleDocumentError}
            forcePage={selectedField?.pageNumber ?? null}
          />
          {documentError && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 10,
                background: '#fee2e2',
                color: '#b91c1c',
                fontSize: 13,
              }}
            >
              {documentError}. <a href={documentUrl} target="_blank" rel="noreferrer" style={{ color: '#991b1b' }}>Download file</a>
            </div>
          )}
        </div>
        <div style={{ flex: '1 1 360px', minWidth: 320 }}>
          <div style={{ marginBottom: 12, color: '#475569', fontSize: 14 }}>
            Extracted Fields
          </div>
          {loading && (
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                border: '1px dashed #cbd5f5',
                textAlign: 'center',
                color: '#94a3b8',
              }}
            >
              Loading extracted results...
            </div>
          )}
          {!loading && !hasOcrOutput && (
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                border: '1px dashed #f97316',
                background: '#fff7ed',
                color: '#c2410c',
                fontWeight: 600,
              }}
            >
              No extraction available for this attachment.
            </div>
          )}
          {!loading && hasOcrOutput && ocrData && ocrData.parsedFields.length === 0 && (
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                border: '1px dashed #cbd5f5',
                textAlign: 'center',
                color: '#64748b',
                background: '#f8fafc',
              }}
            >
              No fields extracted.
            </div>
          )}
          {!loading && hasOcrOutput && ocrData && ocrData.parsedFields.length > 0 && (
            <OcrFieldList
              fields={ocrData.parsedFields}
              utilizationType={ocrData.utilizationType}
              onEdit={handleOpenEdit}
              onViewHistory={handleOpenHistory}
              onSelect={handleFieldSelect}
              selectedFieldId={selectedFieldId}
            />
          )}

          {hasOcrOutput && ocrData?.rawOcr?.extractedText && (
            <div style={{ marginTop: 24 }}>
              <div style={{ marginBottom: 12, color: '#475569', fontSize: 14 }}>
                Extracted Text
              </div>
              <div style={{
                padding: 16,
                borderRadius: 12,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#1e293b',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                maxHeight: 400,
                overflowY: 'auto'
              }}>
                {ocrData.rawOcr.extractedText}
              </div>
            </div>
          )}
        </div>
      </div>
      <OcrFieldEditModal
        field={editField}
        isOpen={isEditOpen}
        isSaving={savingCorrection}
        error={correctionError}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveCorrection}
      />
      <OcrCorrectionHistoryModal
        field={historyField}
        isOpen={Boolean(historyField)}
        loading={historyLoading}
        history={historyEntries}
        error={historyError}
        onClose={handleHistoryClose}
      />
      <NotificationToast notifications={notifications} onDismiss={(id) => setNotifications((prev) => prev.filter((item) => item.id !== id))} />
    </Layout>
  );
}
