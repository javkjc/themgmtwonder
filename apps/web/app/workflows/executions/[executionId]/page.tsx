'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import Layout from '../../../components/Layout';
import ForcePasswordChange from '../../../components/ForcePasswordChange';
import { useAuth } from '../../../hooks/useAuth';
import { apiFetchJson, isUnauthorized } from '../../../lib/api';

type ExecutionMetadata = {
  id: string;
  workflowName?: string | null;
  workflowDescription?: string | null;
  status?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  triggeredBy?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  errorDetails?: string | null;
};

type StepHistoryItem = {
  stepId: string;
  stepOrder: number;
  stepType: string | null;
  stepName: string | null;
  stepDescription: string | null;
  assignedTo: string | null;
  decision: string | null;
  actorId: string | null;
  remark: string | null;
  completedAt: string | null;
  status: string | null;
};

type ExecutionDetailResponse = {
  execution?: ExecutionMetadata | null;
  stepHistory?: StepHistoryItem[] | null;
};

type StepActionDecision = 'approve' | 'reject' | 'acknowledge';

const STEP_ACTIONS: StepActionDecision[] = ['approve', 'reject', 'acknowledge'];

const PENDING_STATUS_TOKENS = ['pending', 'assigned', 'in-progress', 'in progress', 'waiting'];

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
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

const shortenId = (value?: string | null, length = 10) => {
  if (!value) return 'Unknown';
  if (value.length <= length) return value;
  return `${value.slice(0, length)}�`;
};

const isPendingStatus = (status?: string | null) => {
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  return PENDING_STATUS_TOKENS.some((token) => normalized === token || normalized.includes(token));
};

const parseAssignedToLabel = (assignedTo?: string | null) => {
  if (!assignedTo) return null;
  try {
    const parsed = JSON.parse(assignedTo);
    if (parsed && typeof parsed === 'object' && typeof parsed.value === 'string') {
      return parsed.value;
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
};

const getStepTimestampText = (step: StepHistoryItem, fallbackStart?: string | null) => {
  if (step.completedAt) {
    return `Completed ${formatDateTime(step.completedAt)}`;
  }
  if (fallbackStart) {
    return `Assigned ${formatDateTime(fallbackStart)}`;
  }
  return 'Timestamp unknown';
};

export default function WorkflowExecutionDetailPage() {
  const auth = useAuth();
  const params = useParams();
  const executionId = params.executionId;
  const [executionDetail, setExecutionDetail] = useState<ExecutionDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [remarkInputs, setRemarkInputs] = useState<Record<string, string>>({});
  const [stepPanelErrors, setStepPanelErrors] = useState<Record<string, string>>({});
  const [confirmAction, setConfirmAction] = useState<{ stepId: string; action: StepActionDecision } | null>(null);
  const [submittingStepId, setSubmittingStepId] = useState<string | null>(null);

  const isStepAssignedToCurrentUser = useCallback(
    (step: StepHistoryItem) => {
      if (!auth.me?.userId || !step.assignedTo) return false;
      try {
        const assignment = JSON.parse(step.assignedTo);
        return assignment?.type === 'user' && assignment?.value === auth.me.userId;
      } catch {
        return false;
      }
    },
    [auth.me?.userId],
  );

  const fetchExecution = useCallback(async () => {
    if (!executionId) {
      setError('Execution identifier is missing.');
      setExecutionDetail(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetchJson(`/workflows/executions/${executionId}/detail`);
      if (!data || typeof data !== 'object' || !('execution' in data)) {
        setError('Unexpected response from execution detail endpoint.');
        setExecutionDetail(null);
        return;
      }
      setExecutionDetail(data as ExecutionDetailResponse);
    } catch (e: any) {
      if (isUnauthorized(e)) {
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        return;
      }
      setError(e?.message || 'Unable to load execution detail.');
      setExecutionDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [executionId]);

  const handleActionRequest = useCallback(
    (stepId: string, action: StepActionDecision) => {
      setStepPanelErrors((prev) => {
        const next = { ...prev };
        delete next[stepId];
        return next;
      });
      setConfirmAction({ stepId, action });
    },
    [],
  );

  const handleActionConfirm = useCallback(
    async (stepId: string, action: StepActionDecision) => {
      if (!executionId) {
        setStepPanelErrors((prev) => ({
          ...prev,
          [stepId]: 'Execution identifier is missing.',
        }));
        return;
      }

      const remarkValue = (remarkInputs[stepId] ?? '').trim();
      if (!remarkValue) {
        setStepPanelErrors((prev) => ({
          ...prev,
          [stepId]: 'Remark is required before taking an action.',
        }));
        return;
      }

      setSubmittingStepId(stepId);

      try {
        await apiFetchJson(`/workflows/executions/${executionId}/steps/${stepId}/action`, {
          method: 'POST',
          body: JSON.stringify({ decision: action, remark: remarkValue }),
        });
        setConfirmAction(null);
        setStepPanelErrors((prev) => {
          const next = { ...prev };
          delete next[stepId];
          return next;
        });
        setRemarkInputs((prev) => {
          const next = { ...prev };
          delete next[stepId];
          return next;
        });
        await fetchExecution();
      } catch (e: any) {
        setStepPanelErrors((prev) => ({
          ...prev,
          [stepId]: e?.message || 'Unable to submit action. Please try again.',
        }));
      } finally {
        setSubmittingStepId(null);
      }
    },
    [executionId, fetchExecution, remarkInputs],
  );

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
    if (!executionId) {
      setError('Execution identifier is missing.');
      setExecutionDetail(null);
      setIsLoading(false);
      return;
    }
    fetchExecution();
  }, [auth.loading, auth.me, executionId, fetchExecution]);

  const handleRefresh = useCallback(() => {
    fetchExecution();
  }, [fetchExecution]);

  const sortedSteps = useMemo(() => {
    if (!executionDetail?.stepHistory) return [];
    return [...executionDetail.stepHistory].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
  }, [executionDetail]);

  const hasPendingSteps = useMemo(
    () => sortedSteps.some((step) => isPendingStatus(step.status)),
    [sortedSteps],
  );

  const pendingStepsAssignedToCurrentUser = useMemo(
    () =>
      sortedSteps.filter(
        (step) => isPendingStatus(step.status) && isStepAssignedToCurrentUser(step),
      ),
    [sortedSteps, isStepAssignedToCurrentUser],
  );
  const executionStatusMessage = useMemo(() => {
    if (isLoading) {
      return 'Loading execution details…';
    }
    if (error) {
      return 'Execution details temporarily unavailable; see the error shown above.';
    }
    if (hasPendingSteps) {
      if (pendingStepsAssignedToCurrentUser.length > 0) {
        return `${pendingStepsAssignedToCurrentUser.length} pending step${
          pendingStepsAssignedToCurrentUser.length === 1 ? '' : 's'
        } await your action.`;
      }
      return 'Pending steps exist but are assigned to other users.';
    }
    if (sortedSteps.length === 0) {
      return 'No step history is available yet.';
    }
    return 'No pending steps; this execution is read-only.';
  }, [error, hasPendingSteps, isLoading, pendingStepsAssignedToCurrentUser.length, sortedSteps.length]);

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

  const execution = executionDetail?.execution;
  const statusLabel = execution?.status ?? 'Unknown';

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
              alignItems: 'flex-start',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: '#0f172a' }}>
                Workflow Execution Trace
              </h1>
              <p style={{ margin: '4px 0 0', color: '#475569' }}>
                Read-only metadata and ordered step history for a single execution.
              </p>
              <p
                style={{ margin: '6px 0 0', color: '#475569', fontSize: 13 }}
                aria-live="polite"
                role="status"
              >
                {executionStatusMessage}
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
            Tap refresh to retry.
          </p>
        </div>
      )}

      {isLoading && !execution && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: 24,
            borderRadius: 12,
            background: '#fff',
            border: '1px solid #e2e8f0',
            marginBottom: 16,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
            Loading execution details…
          </p>
        </div>
      )}

      {execution ? (
        <>
          <div
            style={{
              borderRadius: 20,
              border: '1px solid #e2e8f0',
              background: '#fff',
              padding: 24,
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>
                  {execution.workflowName || 'Unnamed workflow'}
                </div>
                <div style={{ marginTop: 6, fontSize: 14, color: '#475569' }}>
                  {execution.workflowDescription || 'No workflow description provided.'}
                </div>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: '#e0f2fe',
                  color: '#0f172a',
                  border: '1px solid #bae6fd',
                  textTransform: 'uppercase',
                }}
              >
                {statusLabel}
              </span>
            </div>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                fontSize: 13,
                color: '#475569',
              }}
            >
              <span>
                Execution ID: <strong>{shortenId(execution.id, 14)}</strong>
              </span>
              {execution.resourceType && (
                <span>Resource: {execution.resourceType}</span>
              )}
              {execution.resourceId && (
                <span>
                  ID: {shortenId(execution.resourceId, 12)}
                </span>
              )}
              {execution.triggeredBy && (
                <span>Triggered by: {execution.triggeredBy}</span>
              )}
              {execution.startedAt && (
                <span>Started: {formatDateTime(execution.startedAt)}</span>
              )}
              {execution.completedAt && (
                <span>Completed: {formatDateTime(execution.completedAt)}</span>
              )}
            </div>
            {execution.errorDetails && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: 13,
                }}
              >
                {execution.errorDetails}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a' }}>Step History</h2>
              <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 14 }}>
                Ordered trace of every step, decision, and remark.
              </p>
            </div>
            <div style={{ fontSize: 13, color: '#475569' }}>
              {sortedSteps.length} steps � {hasPendingSteps ? 'Pending steps highlighted below' : 'No pending steps.'}
            </div>
          </div>

          {hasPendingSteps && pendingStepsAssignedToCurrentUser.length === 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                background: '#f8fafc',
                color: '#475569',
                fontSize: 13,
              }}
            >
              You are not assigned to act on any pending steps.
            </div>
          )}

          {!hasPendingSteps && sortedSteps.length > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                border: '1px dashed #cbd5f5',
                background: '#f8fafc',
                color: '#475569',
                fontSize: 13,
              }}
            >
              No pending steps.
            </div>
          )}

          {sortedSteps.length === 0 ? (
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#475569',
              }}
            >
              No step history is available for this execution.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {sortedSteps.map((step) => {
                const isStepPending = isPendingStatus(step.status);
                const statusText = (step.status || 'unknown').replace(/_/g, ' ');
                const actorLabel = step.actorId ?? parseAssignedToLabel(step.assignedTo) ?? '�';
                const actionLabel = step.decision?.trim() ? step.decision : '�';
                const remarkLabel = step.remark?.trim() ? step.remark : '�';
                const timestampLabel = getStepTimestampText(step, execution?.startedAt ?? null);
                const panelRemarkValue = remarkInputs[step.stepId] ?? '';
                const remarkIsValid = panelRemarkValue.trim().length > 0;
                const isSubmittingThisStep = submittingStepId === step.stepId;
                const isConfirmingThisStep = confirmAction?.stepId === step.stepId;
                const currentConfirmDecision = isConfirmingThisStep ? confirmAction?.action ?? null : null;
                const confirmActionLabel = currentConfirmDecision
                  ? `${currentConfirmDecision.charAt(0).toUpperCase()}${currentConfirmDecision.slice(1)}`
                  : '';
                const actionButtonsDisabled = !remarkIsValid || isSubmittingThisStep || isConfirmingThisStep;
                return (
                  <div
                    key={`${step.stepOrder}-${step.stepId}`}
                    style={{
                      borderRadius: 18,
                      border: isStepPending ? '1px solid #facc15' : '1px solid #e2e8f0',
                      background: isStepPending ? '#fffbeb' : '#fff',
                      padding: 20,
                      boxShadow: '0 12px 26px rgba(15, 23, 42, 0.07)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 16,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                          Step {step.stepOrder ?? '�'} � {step.stepName || step.stepType || 'Unnamed step'}
                        </div>
                        {step.stepDescription && (
                          <div style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                            {step.stepDescription}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            borderRadius: 999,
                            padding: '4px 10px',
                            border: '1px solid',
                            borderColor: isStepPending ? '#facc15' : '#e2e8f0',
                            background: isStepPending ? '#fef3c7' : '#f8fafc',
                            color: isStepPending ? '#92400e' : '#475569',
                          }}
                        >
                          {statusText}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            borderRadius: 999,
                            padding: '4px 10px',
                            border: '1px solid #dbeafe',
                            background: '#e0f2fe',
                            color: '#0c4a6e',
                          }}
                        >
                          {step.stepType || 'Step'}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 18,
                        display: 'grid',
                        gap: 12,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        fontSize: 13,
                        color: '#475569',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8' }}>Actor</div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{actorLabel}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8' }}>
                          Action / Decision
                        </div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{actionLabel}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8' }}>Remark</div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{remarkLabel}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, fontSize: 12, color: '#64748b' }}>{timestampLabel}</div>
                    {isStepPending && (
                      <div style={{ marginTop: 20 }}>
                        {isStepAssignedToCurrentUser(step) ? (
                          <div
                            style={{
                              borderRadius: 16,
                              border: '1px solid #dbeafe',
                              background: '#f8fafc',
                              padding: 18,
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Action Panel</div>
                            <label style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#0f172a' }}>
                              Remark (required)
                              <textarea
                                value={panelRemarkValue}
                                onChange={(event) =>
                                  setRemarkInputs((prev) => ({
                                    ...prev,
                                    [step.stepId]: event.target.value,
                                  }))
                                }
                                disabled={isSubmittingThisStep}
                                rows={3}
                                style={{
                                  width: '100%',
                                  marginTop: 8,
                                  padding: 12,
                                  borderRadius: 12,
                                  border: '1px solid #cbd5f5',
                                  fontSize: 13,
                                  fontFamily: 'inherit',
                                  resize: 'vertical',
                                  minHeight: 88,
                                }}
                                placeholder="Capture decision context"
                              />
                            </label>
                            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {STEP_ACTIONS.map((action) => {
                                const actionLabelText = `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
                                const actionColor =
                                  action === 'approve'
                                    ? '#16a34a'
                                    : action === 'reject'
                                      ? '#dc2626'
                                      : '#1d4ed8';
                                return (
                                  <button
                                    key={action}
                                    type="button"
                                    onClick={() => handleActionRequest(step.stepId, action)}
                                    disabled={actionButtonsDisabled}
                                    style={{
                                      padding: '10px 16px',
                                      borderRadius: 10,
                                      border: 'none',
                                      fontWeight: 600,
                                      color: '#fff',
                                      background: actionColor,
                                      opacity: actionButtonsDisabled ? 0.6 : 1,
                                      cursor: actionButtonsDisabled ? 'not-allowed' : 'pointer',
                                      boxShadow: actionButtonsDisabled ? 'none' : '0 6px 12px rgba(15, 23, 42, 0.2)',
                                    }}
                                  >
                                    {actionLabelText}
                                  </button>
                                );
                              })}
                            </div>
                            <p style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
                              No automation. Actions are explicit and audited.
                            </p>
                            {isConfirmingThisStep && currentConfirmDecision && (
                              <div
                                style={{
                                  marginTop: 16,
                                  borderRadius: 12,
                                  border: '1px solid #cbd5f5',
                                  background: '#fff',
                                  padding: 14,
                                }}
                              >
                                <p style={{ margin: 0, fontSize: 13, color: '#0f172a' }}>
                                  Confirm <strong>{confirmActionLabel}</strong>. This action is audited and has no automation.
                                </p>
                                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleActionConfirm(step.stepId, currentConfirmDecision)}
                                    disabled={isSubmittingThisStep}
                                    style={{
                                      padding: '10px 18px',
                                      borderRadius: 10,
                                      border: 'none',
                                      fontWeight: 600,
                                      color: '#fff',
                                      background: '#0f172a',
                                      cursor: isSubmittingThisStep ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    {isSubmittingThisStep ? 'Submitting…' : `Confirm ${confirmActionLabel}`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmAction(null)}
                                    disabled={isSubmittingThisStep}
                                    style={{
                                      padding: '10px 18px',
                                      borderRadius: 10,
                                      border: '1px solid #94a3b8',
                                      background: '#fff',
                                      color: '#0f172a',
                                      fontWeight: 600,
                                      cursor: isSubmittingThisStep ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                            {stepPanelErrors[step.stepId] && (
                              <div
                                role="alert"
                                aria-live="assertive"
                                style={{
                                  marginTop: 12,
                                  padding: 10,
                                  borderRadius: 10,
                                  border: '1px solid #fecaca',
                                  background: '#fef2f2',
                                  color: '#991b1b',
                                  fontSize: 13,
                                }}
                              >
                                {stepPanelErrors[step.stepId]}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 12,
                              border: '1px solid #e2e8f0',
                              background: '#f8fafc',
                              color: '#475569',
                              fontSize: 13,
                            }}
                          >
                            You are not assigned to act on this step.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        !isLoading && !error && (
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#475569',
              marginBottom: 16,
            }}
          >
            Execution information is not available. Try refreshing the page.
          </div>
        )
      )}
    </Layout>
  );
}
