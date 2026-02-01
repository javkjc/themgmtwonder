'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useAuth } from '../../hooks/useAuth';
import { apiFetchJson, isUnauthorized } from '../../lib/api';

type PendingStep = {
  executionId: string;
  stepId: string;
  workflowName: string;
  stepName: string;
  stepType: string;
  stepOrder: number;
  assignedAt: string;
  resourceType?: string | null;
  resourceId?: string | null;
};

const formatAssignedAt = (value: string) => {
  if (!value) return 'Assigned time unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Assigned time unknown';
  }
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatStepType = (value?: string) => {
  if (!value) return 'Step';
  return value.toUpperCase();
};

const formatExecutionId = (value: string) => {
  if (value.length <= 8) return value;
  return `${value.slice(0, 8)}...`;
};

const formatResourceId = (value?: string | null) => {
  if (!value) return null;
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 8)}...`;
};

export default function WorkflowInboxPage() {
  const auth = useAuth();
  const [steps, setSteps] = useState<PendingStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inboxStatusMessage = useMemo(() => {
    if (isLoading) {
      return 'Loading pending workflow steps…';
    }
    if (error) {
      return 'Inbox temporarily unavailable; see the error shown above.';
    }
    if (steps.length === 0) {
      return 'Inbox is clear and ready for new work.';
    }
    return `${steps.length} pending step${steps.length === 1 ? '' : 's'} await your response.`;
  }, [error, isLoading, steps.length]);

  const fetchSteps = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson('/workflows/my-pending-steps');
      const normalized = Array.isArray(data) ? data : [];
      setSteps(normalized as PendingStep[]);
    } catch (e: any) {
      if (isUnauthorized(e)) {
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        return;
      }
      setError(e?.message || 'Unable to load pending workflow steps.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.me) {
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      return;
    }
    if (auth.me.mustChangePassword) {
      return;
    }
    fetchSteps();
  }, [auth.loading, auth.me, fetchSteps]);

  const handleRefresh = useCallback(() => {
    fetchSteps();
  }, [fetchSteps]);

  if (auth.loading || !auth.me) {
    return null;
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

  return (
    <Layout
      currentPage="workflowInbox"
      userEmail={auth.me.email}
      userRole={auth.me.role}
      isAdmin={auth.me.isAdmin}
      onLogout={auth.logout}
    >
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: '#0f172a' }}>
              Workflow Inbox
            </h1>
            <p style={{ margin: '4px 0 0', color: '#475569' }}>
              Pending workflow steps assigned to you. Open an execution to respond to a step.
            </p>
            <p
              style={{ margin: '6px 0 0', color: '#475569', fontSize: 13 }}
              aria-live="polite"
              role="status"
            >
              {inboxStatusMessage}
            </p>
            <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 12 }}>
              No automation. Actions are explicit and audited.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: isLoading ? '1px solid #94a3b8' : 'none',
              background: isLoading ? '#e2e8f0' : '#1d4ed8',
              color: '#fff',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              boxShadow: isLoading ? 'none' : '0 4px 10px rgba(14, 165, 233, 0.35)',
              transition: 'background 0.2s',
            }}
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            marginBottom: 16,
            borderRadius: 12,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#b91c1c',
            padding: 16,
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#7f1d1d' }}>
            Use the refresh button to retry.
          </p>
        </div>
      )}

      <div>
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: 24,
              borderRadius: 12,
              background: '#fff',
              border: '1px solid #e2e8f0',
            }}
          >
            <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
              Fetching pending workflow steps…
            </p>
          </div>
        ) : !error && steps.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              borderRadius: 12,
              border: '1px dashed #cbd5f5',
              background: '#f8fafc',
              color: '#475569',
            }}
          >
            No pending workflow steps.
          </div>
        ) : null}
      </div>

      {!isLoading && !error && steps.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {steps.map((step) => {
            const shortenedResourceId = formatResourceId(step.resourceId);
            return (
              <Link
                key={step.stepId}
                href={`/workflows/executions/${step.executionId}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    padding: 20,
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
                    transition: 'transform 0.2s, border 0.2s',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                    {step.workflowName || 'Unnamed workflow'}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#1d4ed8' }}>
                      {step.stepName || 'Unnamed step'}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#0f172a',
                        background: '#e0f2fe',
                        borderRadius: 999,
                        padding: '4px 10px',
                        border: '1px solid #bae6fd',
                      }}
                    >
                      {formatStepType(step.stepType)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: 13,
                      color: '#475569',
                    }}
                  >
                    <span>Assigned {formatAssignedAt(step.assignedAt)}</span>
                    <span>Execution {formatExecutionId(step.executionId)}</span>
                  </div>
                  {(step.resourceType || shortenedResourceId) && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: '#94a3b8',
                      }}
                    >
                      Resource: {step.resourceType ?? 'Unknown'}
                      {shortenedResourceId ? ` · ${shortenedResourceId}` : ''}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
