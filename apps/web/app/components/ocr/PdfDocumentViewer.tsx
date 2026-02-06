'use client';

import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { BoundingBox } from '../../lib/api/ocr';

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.25;

type HighlightedField = {
  pageNumber: number | null;
  boundingBox: BoundingBox | null;
} | null;

type PdfDocumentViewerProps = {
  title: string;
  documentUrl: string;
  mimeType: string | null | undefined;
  highlightedField: HighlightedField;
  forcePage?: number | null;
  onPageChange?: (page: number) => void;
  onDocumentError?: (message: string) => void;
  fileName?: string | null;
};

export default function PdfDocumentViewer({
  title,
  documentUrl,
  mimeType,
  highlightedField,
  forcePage,
  onPageChange,
  onDocumentError,
  fileName,
}: PdfDocumentViewerProps) {
  // Detect file type from mimeType or fileName
  const isPdf =
    mimeType?.toLowerCase() === 'application/pdf' ||
    fileName?.toLowerCase().endsWith('.pdf');

  const isImage =
    mimeType?.toLowerCase().startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|gif)$/i.test(fileName ?? '');

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [documentUrl]);

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    if (currentPage > numPages) {
      setCurrentPage(numPages);
    }
  };

  useEffect(() => {
    if (!forcePage || numPages === 0) return;
    if (forcePage < 1 || forcePage > numPages) return;
    if (forcePage === currentPage) return;
    setCurrentPage(forcePage);
    onPageChange?.(forcePage);
  }, [forcePage, numPages, currentPage, onPageChange]);

  const handlePageChange = (delta: number) => {
    setCurrentPage((prev) => {
      const next = Math.min(Math.max(prev + delta, 1), numPages || 1);
      onPageChange?.(next);
      return next;
    });
  };

  const handleZoom = (direction: 'in' | 'out') => {
    setScale((prev) => {
      const next =
        direction === 'in' ? Math.min(prev + SCALE_STEP, MAX_SCALE) : Math.max(prev - SCALE_STEP, MIN_SCALE);
      return next;
    });
  };

  const documentOptions = useMemo(() => ({ withCredentials: true }), []);

  const highlightStyles = useMemo(() => {
    if (!highlightedField || !highlightedField.boundingBox) {
      return null;
    }

    if (highlightedField.pageNumber !== currentPage && highlightedField.pageNumber !== null) {
      return null;
    }

    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const { boundingBox } = highlightedField;
    return {
      left: `${clamp(boundingBox.x) * 100}%`,
      top: `${clamp(1 - boundingBox.y - boundingBox.height) * 100}%`,
      width: `${clamp(boundingBox.width) * 100}%`,
      height: `${clamp(boundingBox.height) * 100}%`,
    };
  }, [currentPage, highlightedField]);

  const handleError = (error: Error) => {
    const message = error?.message || 'Unable to render document';
    setRenderError(message);
    onDocumentError?.(message);
  };

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      {isPdf && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => handlePageChange(-1)}
            disabled={currentPage <= 1}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #cbd5f5',
              background: 'white',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ‹
          </button>
          <span style={{ fontSize: 13 }}>
            Page {currentPage} {numPages ? `of ${numPages}` : ''}
          </span>
          <button
            type="button"
            onClick={() => handlePageChange(1)}
            disabled={numPages > 0 ? currentPage >= numPages : false}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #cbd5f5',
              background: 'white',
              cursor: numPages > 0 && currentPage >= numPages ? 'not-allowed' : 'pointer',
            }}
          >
            ›
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          onClick={() => handleZoom('out')}
          disabled={scale <= MIN_SCALE}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #cbd5f5',
            background: 'white',
            cursor: scale <= MIN_SCALE ? 'not-allowed' : 'pointer',
          }}
        >
          -
        </button>
        <span style={{ fontSize: 13 }}>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => handleZoom('in')}
          disabled={scale >= MAX_SCALE}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #cbd5f5',
            background: 'white',
            cursor: scale >= MAX_SCALE ? 'not-allowed' : 'pointer',
          }}
        >
          +
        </button>
      </div>
    </div>
  );

  const pdfViewer = (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        overflow: 'auto',
        background: '#0f172a',
      }}
    >
      <Document
        file={documentUrl}
        options={documentOptions}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleError}
        loading={<div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>}
        noData={<div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No document loaded.</div>}
        renderMode="canvas"
      >
        <Page
          pageNumber={currentPage}
          scale={scale}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          onRenderError={handleError}
        />
      </Document>
      {renderError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,0.95)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>Unable to render PDF</p>
            <p style={{ margin: '4px 0 0', color: '#64748b' }}>{renderError}</p>
            <a
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
              style={{ marginTop: 8, display: 'inline-block', color: '#2563eb' }}
            >
              Download document
            </a>
          </div>
        </div>
      )}
      {!renderError && highlightStyles && (
        <div
          style={{
            position: 'absolute',
            border: '2px solid #f97316',
            boxShadow: '0 0 8px rgba(249,115,22,0.4)',
            background: 'rgba(249,115,22,0.15)',
            borderRadius: 4,
            pointerEvents: 'none',
            ...highlightStyles,
          }}
        />
      )}
    </div>
  );

  const imageViewer = (
    <div
      style={{
        position: 'relative',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        overflow: 'auto',
        background: '#0f172a',
        minHeight: 320,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <img
        src={documentUrl}
        alt={fileName ?? title}
        style={{
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          transition: 'transform 0.2s ease-out',
        }}
        onError={(event) => {
          const target = event.target as HTMLImageElement;
          target.style.display = 'none';
          setRenderError('Unable to load image preview.');
          onDocumentError?.('Unable to load image preview.');
        }}
      />
      {renderError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
            textAlign: 'center',
            color: '#f8fafc',
            background: 'rgba(15,23,42,0.9)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Unable to render preview</p>
          <p style={{ margin: '4px 0', color: '#cbd5f5' }}>{renderError}</p>
          <a href={documentUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>
            Download file
          </a>
        </div>
      )}
    </div>
  );

  const fallbackViewer = (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        padding: 40,
        textAlign: 'center',
        background: '#f8fafc',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>Unsupported file type</p>
      <p style={{ margin: '8px 0', color: '#94a3b8', fontSize: 14 }}>
        Preview not available for this file type.
      </p>
      <a
        href={documentUrl}
        target="_blank"
        rel="noreferrer"
        style={{ color: '#2563eb', fontSize: 14 }}
      >
        Download file
      </a>
    </div>
  );

  const renderViewer = () => {
    if (isPdf) return pdfViewer;
    if (isImage) return imageViewer;
    return fallbackViewer;
  };

  return (
    <div>
      {toolbar}
      {renderViewer()}
    </div>
  );
}
