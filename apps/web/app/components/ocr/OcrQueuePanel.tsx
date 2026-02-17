'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cancelOcrJob, dismissOcrJob, fetchOcrJobs, retryOcrJob, type OcrJob } from '@/app/lib/api/ocr-queue';

type OcrQueuePanelProps = {
  pollMs?: number;
};

const badgeStyle = (status: string) => {
  if (status === 'processing') {
    return { bg: '#111111', color: '#fafafa' };
  }
  if (status === 'completed') {
    return { bg: '#16a34a', color: '#f0fdf4' };
  }
  if (status === 'failed') {
    return { bg: '#dc2626', color: '#fee2e2' };
  }
  return { bg: '#e5e5e5', color: 'var(--text-primary)' };
};

const formatStatus = (status: string) => {
  if (status === 'processing') return 'Processing';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return 'Queued';
};

export default function OcrQueuePanel({ pollMs = 3000 }: OcrQueuePanelProps) {
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchJobs = async () => {
      try {
        const data = await fetchOcrJobs();
        if (mounted) {
          setJobs(data);
        }
      } catch {
        if (mounted) {
          setJobs([]);
        }
      }
    };

    fetchJobs();
    timer = setInterval(fetchJobs, pollMs);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [pollMs]);

  const visibleJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aTime = new Date(a.requestedAt).getTime();
      const bTime = new Date(b.requestedAt).getTime();
      return aTime - bTime;
    });
  }, [jobs]);

  useEffect(() => {
    const headerHeight = 44;
    const rowHeight = 56;
    const emptyHeight = 36;
    const rows = Math.min(visibleJobs.length, 5);
    const listHeight = rows > 0 ? rows * rowHeight : emptyHeight;
    const panelHeight = headerHeight + (expanded ? listHeight : 0);
    const offset = 20 + panelHeight + 12;
    document.documentElement.style.setProperty('--toast-bottom-offset', `${offset}`);
    return () => {
      document.documentElement.style.removeProperty('--toast-bottom-offset');
    };
  }, [expanded, visibleJobs.length]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 320,
        borderRadius: 10,
        background: '#111827',
        color: '#fafafa',
        boxShadow: '0 12px 24px rgba(0,0,0,0.25)',
        zIndex: 9000,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#0b1220',
          border: 'none',
          color: '#fafafa',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <span>Jobs ({visibleJobs.length})</span>
        <span style={{ opacity: 0.7 }}>{expanded ? '—' : '+'}</span>
      </button>
      {expanded && (
        <div
          className="queueScroll"
          style={{
            background: '#111827',
            maxHeight: 5 * 56,
            overflowY: 'auto',
            paddingRight: 6,
          }}
        >
          {visibleJobs.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 13, color: '#9ca3af' }}>
              No OCR jobs in queue.
            </div>
          )}
          {visibleJobs.map((job, index) => {
            const badge = badgeStyle(job.status);
            return (
              <div
                key={job.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '10px 14px',
                  borderTop: index === 0 ? 'none' : '1px solid rgba(148,163,184,0.2)',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                  }}
                >
                  {job.mimeType.startsWith('image/') ? '[IMG]' : job.mimeType.includes('pdf') ? '[PDF]' : '[FILE]'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e5e5' }}>
                      {job.filename}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: badge.bg,
                        color: badge.color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {formatStatus(job.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Task: {job.todoTitle}
                  </div>
                  {job.completedAt && (job.status === 'completed' || job.status === 'failed') && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Completed: {new Date(job.completedAt).toLocaleString()}
                    </div>
                  )}
                  {job.status === 'failed' && job.error && (
                    <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>
                      {job.error}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <Link
                    href={`/task/${job.todoId}`}
                    style={{
                      fontSize: 12,
                      color: '#93c5fd',
                      textDecoration: 'none',
                    }}
                  >
                    View
                  </Link>
                  {(job.status === 'queued' || job.status === 'processing') && (
                    <button
                      type="button"
                      onClick={async () => {
                        await cancelOcrJob(job.id);
                        const data = await fetchOcrJobs();
                        setJobs(data);
                      }}
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 6,
                        border: '1px solid rgba(248,113,113,0.6)',
                        background: 'transparent',
                        color: '#fca5a5',
                        cursor: 'pointer',
                      }}
                    >
                      X
                    </button>
                  )}
                  {job.status === 'completed' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await dismissOcrJob(job.id);
                        setJobs((prev) => prev.filter((item) => item.id !== job.id));
                      }}
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 6,
                        border: '1px solid rgba(148,163,184,0.4)',
                        background: 'transparent',
                        color: '#cbd5f5',
                        cursor: 'pointer',
                      }}
                    >
                      Dismiss
                    </button>
                  )}
                  {job.status === 'failed' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          await retryOcrJob(job.id);
                          const data = await fetchOcrJobs();
                          setJobs(data);
                        }}
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 6,
                          border: '1px solid rgba(56,189,248,0.6)',
                          background: 'transparent',
                          color: '#7dd3fc',
                          cursor: 'pointer',
                        }}
                      >
                        Try again
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await dismissOcrJob(job.id);
                          setJobs((prev) => prev.filter((item) => item.id !== job.id));
                        }}
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 6,
                          border: '1px solid rgba(148,163,184,0.4)',
                          background: 'transparent',
                          color: '#cbd5f5',
                          cursor: 'pointer',
                        }}
                      >
                        X
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style jsx>{`
        .queueScroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.6) transparent;
        }
        .queueScroll::-webkit-scrollbar {
          width: 8px;
        }
        .queueScroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .queueScroll::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.5);
          border-radius: 10px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .queueScroll::-webkit-scrollbar-thumb:hover {
          background-color: rgba(148, 163, 184, 0.8);
        }
      `}</style>
    </div>
  );
}
