'use client';

import { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { useAuditLogs, type AuditLog } from '../hooks/useAuditLogs';
import ForcePasswordChange from '../components/ForcePasswordChange';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'auth.login': { label: 'Logged in', color: '#10b981' },
  'auth.logout': { label: 'Logged out', color: '#6b7280' },
  'auth.register': { label: 'Registered', color: '#3b82f6' },
  'auth.password_change': { label: 'Changed password', color: '#f59e0b' },
  'todo.create': { label: 'Created task', color: '#3b82f6' },
  'todo.update': { label: 'Updated task', color: '#8b5cf6' },
  'todo.delete': { label: 'Deleted task', color: '#ef4444' },
  'todo.schedule': { label: 'Scheduled task', color: '#06b6d4' },
  'todo.unschedule': { label: 'Unscheduled task', color: '#f97316' },
  'todo.bulk_update': { label: 'Bulk updated tasks', color: '#8b5cf6' },
  'todo.bulk_delete': { label: 'Bulk deleted tasks', color: '#ef4444' },
  'category.create': { label: 'Created category', color: '#3b82f6' },
  'category.update': { label: 'Updated category', color: '#8b5cf6' },
  'category.delete': { label: 'Deleted category', color: '#ef4444' },
  'settings.update': { label: 'Updated settings', color: '#f59e0b' },
  'admin.reset_password': { label: 'Admin reset password', color: '#ef4444' },
  'user.role.grant': { label: 'Admin role granted', color: '#10b981' },
  'user.role.revoke': { label: 'Admin role revoked', color: '#ef4444' },
  'OCR_REQUESTED': { label: 'Extraction requested', color: '#f59e0b' },
  'OCR_SUCCEEDED': { label: 'Extraction succeeded', color: '#10b981' },
  'OCR_FAILED': { label: 'Extraction failed', color: '#ef4444' },
  'ocr.apply.remark': { label: 'Extracted text added to remark', color: '#0ea5e9' },
  'ocr.apply.description': { label: 'Extracted text appended to description', color: '#0ea5e9' },
};

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      if (minutes === 0) return 'Just now';
      return `${minutes}m ago`;
    }
    return `${hours}h ago`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function ActionBadge({ action }: { action: string }) {
  const config = ACTION_LABELS[action] || { label: action, color: '#64748b' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 12,
        background: `${config.color}15`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

function formatFieldValue(field: string, value: any): string {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'boolean') return value ? 'done' : 'not done';

  // Format date/time fields
  if (field === 'startAt' && typeof value === 'string') {
    const date = new Date(value);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  if (field === 'durationMin' && typeof value === 'number') {
    return `${value} min`;
  }

  return String(value);
}

function ChangesDisplay({ changes }: { changes: Record<string, { from: any; to: any }> }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: 8, fontSize: 12 }}>
      {entries.map(([field, delta]) => (
        <div key={field} style={{ marginBottom: 4 }}>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>{field}:</span>
          {' '}
          <span style={{ color: '#ef4444' }}>{formatFieldValue(field, delta.from)}</span>
          {' → '}
          <span style={{ color: '#10b981' }}>{formatFieldValue(field, delta.to)}</span>
        </div>
      ))}
    </div>
  );
}

function DetailsDisplay({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return null;

  // Extract changes field if present
  const changes = details.changes as Record<string, { from: any; to: any }> | undefined;

  const entries = Object.entries(details).filter(
    ([key]) => !['ids', 'adminId', 'changes'].includes(key) // Hide technical details and changes (rendered separately)
  );

  return (
    <>
      {changes && <ChangesDisplay changes={changes} />}

      {entries.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
          {entries.map(([key, value]) => {
            let displayValue = value;
            if (typeof value === 'boolean') {
              displayValue = value ? 'Yes' : 'No';
            } else if (Array.isArray(value)) {
              displayValue = `${value.length} items`;
            } else if (typeof value === 'object' && value !== null) {
              displayValue = JSON.stringify(value);
            }

            return (
              <span key={key} style={{ marginRight: 16 }}>
                <span style={{ color: '#94a3b8' }}>{key}: </span>
                <span>{String(displayValue)}</span>
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

function LogEntry({ log }: { log: AuditLog }) {
  const actorDisplay =
    log.actorType === 'system'
      ? 'System'
      : log.userEmail || log.userId || 'Unknown user';
  const moduleDisplay = log.module || '—';
  const targetDisplay = log.resourceId
    ? `${log.resourceType || 'resource'}: ${log.resourceId.substring(0, 8)}...`
    : '—';

  return (
    <div
      style={{
        padding: '16px 20px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
      }}
    >
      {/* Time column */}
      <div style={{ width: 100, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
          {formatDate(log.createdAt)}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {formatTime(log.createdAt)}
        </div>
      </div>

      {/* Action column */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ActionBadge action={log.action} />
        </div>

        {/* Who + Module + Target */}
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
          <span style={{ fontWeight: 500, color: '#475569' }}>Who:</span> {actorDisplay}
          {' · '}
          <span style={{ fontWeight: 500, color: '#475569' }}>Module:</span> {moduleDisplay}
          {' · '}
          <span style={{ fontWeight: 500, color: '#475569' }}>Target:</span> {targetDisplay}
        </div>

        <DetailsDisplay details={log.details} />
      </div>

      {/* IP/Browser info (collapsed) */}
      <div style={{ width: 120, flexShrink: 0, textAlign: 'right' }}>
        {log.ipAddress && (
          <div style={{ fontSize: 11, color: '#94a3b8' }} title={log.userAgent || ''}>
            {log.ipAddress === '::1' || log.ipAddress === '127.0.0.1'
              ? 'Local'
              : log.ipAddress}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const auth = useAuth();
  const [actionFilter, setActionFilter] = useState<string>('');
  const auditLogs = useAuditLogs({
    action: actionFilter || undefined,
    onUnauthorized: () => { },
  });

  if (auth.initialLoad) {
    return null;
  }

  if (!auth.me) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        Please login to view activity log.
      </div>
    );
  }

  if (auth.me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={auth.me.email}
        onChangePassword={auth.changePassword}
        error={auth.error}
      />
    );
  }

  // Check admin access
  if (!auth.me.isAdmin) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  const actionTypes = [
    { value: '', label: 'All activities' },
    { value: 'auth', label: 'Authentication' },
    { value: 'todo', label: 'Tasks' },
    { value: 'category', label: 'Categories' },
    { value: 'settings', label: 'Settings' },
    { value: 'ocr', label: 'Extraction' },
  ];

  return (
    <Layout
      currentPage="activity"
      userEmail={auth.me.email}
      userRole={auth.me.role}
      isAdmin={auth.me.isAdmin}
      onLogout={auth.logout}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
          Activity Log
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          View your recent activity and account history
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          background: 'white',
          padding: 16,
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span style={{ fontSize: 13, color: '#64748b' }}>Filter:</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {actionTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => setActionFilter(type.value)}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                borderRadius: 6,
                border: '1px solid',
                borderColor: actionFilter === type.value ? '#3b82f6' : '#e2e8f0',
                background: actionFilter === type.value ? '#eff6ff' : 'white',
                color: actionFilter === type.value ? '#3b82f6' : '#64748b',
                cursor: 'pointer',
                fontWeight: actionFilter === type.value ? 500 : 400,
              }}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={auditLogs.refresh}
          disabled={auditLogs.loading}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: 'white',
            color: '#64748b',
            cursor: auditLogs.loading ? 'not-allowed' : 'pointer',
          }}
        >
          {auditLogs.loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {auditLogs.error && (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {auditLogs.error}
        </div>
      )}

      {/* Activity List */}
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        {auditLogs.logs.length === 0 && !auditLogs.loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            No activity found
          </div>
        ) : (
          <>
            {auditLogs.logs.map((log) => (
              <LogEntry key={log.id} log={log} />
            ))}

            {auditLogs.hasMore && (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <button
                  onClick={auditLogs.loadMore}
                  disabled={auditLogs.loading}
                  style={{
                    padding: '8px 24px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    color: '#3b82f6',
                    cursor: auditLogs.loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {auditLogs.loading ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
