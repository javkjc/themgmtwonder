'use client';

import dynamic from 'next/dynamic';
import type { Segment } from '../types';
import type { OcrField, OcrResultsWithCorrectionsResponse } from '@/app/lib/api/ocr';

const PdfDocumentViewer = dynamic(() => import('@/app/components/ocr/PdfDocumentViewer'), { ssr: false });

interface DocumentPreviewPanelProps {
  ocrData: OcrResultsWithCorrectionsResponse | null;
  documentUrl: string;
  highlightedSegment: Segment | null;
  selectedField: OcrField | null;
  documentError: string | null;
  onDocumentError: (message: string) => void;
  isMobile: boolean;
}

export default function DocumentPreviewPanel({
  ocrData,
  documentUrl,
  highlightedSegment,
  selectedField,
  documentError,
  onDocumentError,
  isMobile,
}: DocumentPreviewPanelProps) {
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
      <div style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>1. Document Preview</div>
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
          onDocumentError={onDocumentError}
          forcePage={highlightedSegment?.pageNumber ?? selectedField?.pageNumber ?? null}
        />
      ) : isExcel ? (
        <div style={{ height: 400, background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <span style={{ fontSize: 48, marginBottom: 16 }}>Table</span>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
            Excel files have no preview. <a href={documentUrl} target="_blank" rel="noreferrer" style={{ color: '#E11D48' }}>Download to view.</a>
          </p>
        </div>
      ) : isWord ? (
        <div style={{ height: 400, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <span style={{ fontSize: 48, marginBottom: 16 }}>!</span>
          <p style={{ margin: 0, fontWeight: 600, color: '#b91c1c' }}>Word documents not supported. Please convert to PDF.</p>
          <a href={documentUrl} target="_blank" rel="noreferrer" style={{ marginTop: 12, color: '#991b1b', fontWeight: 600 }}>Download file</a>
        </div>
      ) : (
        <div style={{ height: 400, background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Preview not available for this file type.</p>
        </div>
      )}
      {documentError && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>
          {documentError}. <a href={documentUrl} target="_blank" rel="noreferrer" style={{ color: '#991b1b' }}>Download file</a>
        </div>
      )}
    </div>
  );
}
