'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import NotificationToast, { type Notification } from '@/app/components/NotificationToast';
const PdfDocumentViewer = dynamic(() => import('@/app/components/ocr/PdfDocumentViewer'), { ssr: false });
import OcrCorrectionHistoryModal from '@/app/components/ocr/OcrCorrectionHistoryModal';
import OcrFieldEditModal from '@/app/components/ocr/OcrFieldEditModal';
import OcrFieldCreateModal from '@/app/components/ocr/OcrFieldCreateModal';
import OcrFieldList from '@/app/components/ocr/OcrFieldList';
import Layout from '@/app/components/Layout';

import { API_BASE_URL, apiFetchJson, isUnauthorized } from '@/app/lib/api';
import {
  createOcrCorrection,
  createManualOcrField,
  deleteOcrField,
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creatingField, setCreatingField] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load extraction review data');
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
      } catch (err: unknown) {
        setCorrectionError((err as Error)?.message || 'Unable to save correction');
      } finally {
        setSavingCorrection(false);
      }
    },
    [addNotification, editField, fetchData],
  );

  const handleCreateField = useCallback(
    async (payload: { fieldName: string; fieldValue: string; reason: string }) => {
      if (!ocrData?.rawOcr) return;
      setCreatingField(true);
      setCreateError(null);
      try {
        await createManualOcrField(ocrData.rawOcr.id, payload);
        setIsCreateOpen(false);
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
    [addNotification, fetchData, ocrData?.rawOcr],
  );

  const handleDeleteField = useCallback(
    async (field: OcrField) => {
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
    [addNotification, fetchData],
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

  const badgeStylesValue = ocrData?.rawOcr?.status ? (badgeStyles[ocrData.rawOcr.status] || badgeStyles.draft) : badgeStyles.draft;

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
                background: badgeStylesValue.bg,
                color: badgeStylesValue.color,
                border: `1px solid ${badgeStylesValue.border}`,
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
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#475569', fontSize: 14, fontWeight: 500 }}>
              Extracted Fields
            </div>
            {hasOcrOutput && (
              <button
                onClick={() => setIsCreateOpen(true)}
                disabled={!!ocrData?.utilizationType}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: ocrData?.utilizationType ? '#f1f5f9' : '#ffffff',
                  border: '1px solid #e2e8f0',
                  color: ocrData?.utilizationType ? '#94a3b8' : '#2563eb',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: ocrData?.utilizationType ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>➕</span> Add Field
              </button>
            )}
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
              onDelete={handleDeleteField}
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
      {isCreateOpen && (
        <OcrFieldCreateModal
          isOpen={isCreateOpen}
          isSaving={creatingField}
          error={createError}
          onClose={() => setIsCreateOpen(false)}
          onSave={handleCreateField}
        />
      )}
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
