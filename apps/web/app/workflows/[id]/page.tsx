'use client';

import { use, useEffect, useState } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../../lib/api';
import type { Me } from '../../types';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useToast } from '../../components/ToastProvider';
import {
  validateWorkflow,
  generateWorkflowExplanation,
  generateDryRunPreview,
  getValidationSummary,
  type ValidationResult,
  type DryRunResult,
} from '../../lib/workflow-validation';

type WorkflowStep = {
  id: string;
  workflowDefinitionId: string;
  stepOrder: number;
  stepType: string;
  name: string;
  description: string | null;
  assignedTo: string | null;
  conditions: string | null;
  createdAt: string;
};

type WorkflowVersion = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  workflowGroupId: string | null;
};

type WorkflowDefinition = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  workflowGroupId: string | null;
  steps: WorkflowStep[];
};

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const { showToast } = useToast();

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Validation state (computed from workflow definition - no persistence)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);

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
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (me && me.role === 'admin') {
      loadWorkflow();
      loadVersions();
    }
  }, [me]);

  const loadWorkflow = async () => {
    setLoadingWorkflow(true);
    try {
      const data = await apiFetchJson(`/workflows/${id}`);
      const workflowData = data as WorkflowDefinition;
      setWorkflow(workflowData);

      // Compute validation (pure function, no side effects)
      const validationSteps = workflowData.steps.map(s => ({
        stepOrder: s.stepOrder,
        stepType: s.stepType,
        name: s.name,
        description: s.description || '',
        assignedTo: s.assignedTo || '',
        conditions: s.conditions || '',
      }));

      const validation = validateWorkflow(workflowData.name, validationSteps);
      setValidationResult(validation);

      // Generate dry-run preview (pure function - no execution)
      const dryRun = generateDryRunPreview(workflowData.name, validationSteps);
      setDryRunResult(dryRun);
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      showToast(e?.message || 'Failed to load workflow', 'error');
    } finally {
      setLoadingWorkflow(false);
    }
  };

  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const data = await apiFetchJson(`/workflows/${id}/versions`);
      setVersions(data as WorkflowVersion[]);
    } catch (e: any) {
      if (isForbidden(e)) {
        return; // Already handled in loadWorkflow
      }
      showToast(e?.message || 'Failed to load workflow versions', 'error');
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!window.confirm('Create a new version from this workflow? This will clone all steps.')) {
      return;
    }

    setCreatingVersion(true);
    try {
      const newVersion = await apiFetchJson('/workflows/versions', {
        method: 'POST',
        body: JSON.stringify({ sourceWorkflowId: id }),
      });

      showToast('New version created successfully', 'success');
      // Navigate to new version
      window.location.href = `/workflows/${(newVersion as any).id}`;
    } catch (e: any) {
      showToast(e?.message || 'Failed to create version', 'error');
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleActivate = async () => {
    if (!window.confirm('Activate this workflow version? This will deactivate other versions in the same group.')) {
      return;
    }

    setActivating(true);
    try {
      await apiFetchJson(`/workflows/${id}/activate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      showToast('Workflow activated successfully', 'success');
      loadWorkflow();
      loadVersions();
    } catch (e: any) {
      showToast(e?.message || 'Failed to activate workflow', 'error');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Deactivate this workflow version?')) {
      return;
    }

    setDeactivating(true);
    try {
      await apiFetchJson(`/workflows/${id}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      showToast('Workflow deactivated successfully', 'success');
      loadWorkflow();
      loadVersions();
    } catch (e: any) {
      showToast(e?.message || 'Failed to deactivate workflow', 'error');
    } finally {
      setDeactivating(false);
    }
  };

  const logout = async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // Ignore
    } finally {
      setMe(null);
      window.location.href = '/';
    }
  };

  const forceChangePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      await apiFetchJson('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMe(null);
      return true;
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setAuthError('Current password is incorrect, or session expired.');
        return false;
      }
      setAuthError(e?.message || 'Change password failed.');
      return false;
    }
  };

  const parseAssignedTo = (assignedTo: string | null): string => {
    if (!assignedTo) return 'Unassigned';
    try {
      const parsed = JSON.parse(assignedTo);
      if (parsed.type === 'role') {
        return `Role: ${parsed.value}`;
      } else if (parsed.type === 'user') {
        return `User: ${parsed.value}`;
      }
      return assignedTo;
    } catch {
      return assignedTo;
    }
  };

  const parseConditions = (conditions: string | null): string => {
    if (!conditions) return 'None';
    try {
      const parsed = JSON.parse(conditions);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return conditions;
    }
  };

  if (loading) {
    return null;
  }

  if (!me) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={me.email}
        onChangePassword={forceChangePassword}
        error={authError}
      />
    );
  }

  if (!me.isAdmin) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return null;
  }

  if (loadingWorkflow) {
    return (
      <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
          Loading workflow...
        </div>
      </Layout>
    );
  }

  if (!workflow) {
    return (
      <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
          Workflow not found
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button
            onClick={() => window.location.href = '/workflows'}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ← Back to Workflows
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {workflow.isActive ? (
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                style={{
                  padding: '8px 16px',
                  background: deactivating ? '#94a3b8' : 'white',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: deactivating ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {deactivating ? 'Deactivating...' : 'Deactivate'}
              </button>
            ) : (
              <button
                onClick={handleActivate}
                disabled={activating}
                style={{
                  padding: '8px 16px',
                  background: activating ? '#94a3b8' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: activating ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {activating ? 'Activating...' : 'Activate'}
              </button>
            )}

            <button
              onClick={handleCreateVersion}
              disabled={creatingVersion}
              style={{
                padding: '8px 16px',
                background: creatingVersion ? '#94a3b8' : 'white',
                color: '#3b82f6',
                border: '1px solid #bae6fd',
                borderRadius: 6,
                fontSize: 14,
                cursor: creatingVersion ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              {creatingVersion ? 'Creating...' : 'Create New Version'}
            </button>

            <button
              onClick={() => {
                if (workflow.isActive) {
                  showToast('Active workflows cannot be edited. Deactivate first to make changes.', 'error');
                  return;
                }
                window.location.href = `/workflows/${id}/edit`;
              }}
              style={{
                padding: '8px 16px',
                background: workflow.isActive ? '#f1f5f9' : '#3b82f6',
                color: workflow.isActive ? '#94a3b8' : 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                cursor: workflow.isActive ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
              title={workflow.isActive ? 'Active workflows cannot be edited' : 'Edit workflow'}
            >
              Edit Workflow
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#1e293b' }}>
            {workflow.name}
          </h1>
          <span style={{
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            background: workflow.isActive ? '#dcfce7' : '#f1f5f9',
            color: workflow.isActive ? '#166534' : '#64748b',
          }}>
            {workflow.isActive ? 'Active' : 'Inactive'}
          </span>
          <span style={{
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 14,
            background: '#f0f9ff',
            color: '#0369a1',
          }}>
            v{workflow.version}
          </span>
        </div>
        {workflow.description && (
          <p style={{ color: '#64748b', margin: 0 }}>
            {workflow.description}
          </p>
        )}
      </div>

      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 24,
        marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 16, color: '#1e293b' }}>
          Metadata
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Created</div>
            <div style={{ fontSize: 14, color: '#1e293b' }}>{new Date(workflow.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Last Updated</div>
            <div style={{ fontSize: 14, color: '#1e293b' }}>{new Date(workflow.updatedAt).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Validation & Dry-Run Preview */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{
          padding: 24,
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
            Validation & Preview
          </h2>
          <button
            onClick={() => setShowValidation(!showValidation)}
            style={{
              padding: '6px 12px',
              background: showValidation ? '#3b82f6' : '#f1f5f9',
              color: showValidation ? 'white' : '#64748b',
              border: showValidation ? 'none' : '1px solid #e2e8f0',
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {showValidation ? 'Hide' : 'Show Details'}
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Validation Summary (Always Visible) */}
          {validationResult && (
            <div style={{
              padding: 12,
              borderRadius: 6,
              marginBottom: showValidation ? 16 : 0,
              background: validationResult.isValid ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${validationResult.isValid ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: validationResult.isValid ? '#166534' : '#991b1b',
              }}>
                {getValidationSummary(validationResult)}
              </div>
            </div>
          )}

          {showValidation && (
            <>
              {/* Validation Errors */}
              {validationResult && validationResult.errors.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                    Errors
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {validationResult.errors.map((error, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '8px 12px',
                          marginBottom: 6,
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: 4,
                          color: '#991b1b',
                        }}
                      >
                        {error.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Warnings */}
              {validationResult && validationResult.warnings.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                    Warnings
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {validationResult.warnings.map((warning, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '8px 12px',
                          marginBottom: 6,
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          borderRadius: 4,
                          color: '#92400e',
                        }}
                      >
                        {warning.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Human-Readable Explanation */}
              {dryRunResult && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                    Workflow Explanation
                  </div>
                  <div style={{
                    padding: 12,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#475569',
                    lineHeight: 1.6,
                  }}>
                    {dryRunResult.explanation}
                  </div>
                </div>
              )}

              {/* Dry-Run Preview */}
              {dryRunResult && dryRunResult.paths.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
                    Dry-Run Preview
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    Possible execution paths (informational only, no execution occurs)
                  </div>
                  {dryRunResult.paths.map((path, pathIndex) => (
                    <div
                      key={path.pathId}
                      style={{
                        marginBottom: pathIndex < dryRunResult.paths.length - 1 ? 16 : 0,
                        padding: 12,
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0369a1', marginBottom: 8 }}>
                        {path.description}
                      </div>
                      <div style={{ fontSize: 12 }}>
                        {path.steps.map((step, stepIndex) => (
                          <div
                            key={stepIndex}
                            style={{
                              marginBottom: stepIndex < path.steps.length - 1 ? 8 : 0,
                              paddingLeft: 12,
                              borderLeft: '2px solid #0ea5e9',
                            }}
                          >
                            <div style={{ color: '#0f172a', fontWeight: 500 }}>
                              {step.stepOrder}. {step.stepName}
                            </div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>
                              {step.stepType} • {step.assignedTo}
                            </div>
                            {step.reason && (
                              <div style={{ color: '#0369a1', fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>
                                {step.reason}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Version History */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{ padding: 24, borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
            Version History
          </h2>
        </div>

        {loadingVersions ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
            Loading versions...
          </div>
        ) : versions.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
            No version history available
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Version</th>
                  <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</th>
                  <th style={{ padding: '8px 0', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Created</th>
                  <th style={{ padding: '8px 0', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: v.id === workflow.id ? '#f0f9ff' : 'transparent',
                  }}>
                    <td style={{ padding: '12px 0', fontSize: 14 }}>
                      <span style={{ fontWeight: v.id === workflow.id ? 600 : 400 }}>
                        v{v.version}
                      </span>
                      {v.id === workflow.id && (
                        <span style={{
                          marginLeft: 8,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          background: '#dbeafe',
                          color: '#1e40af',
                        }}>
                          Current
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 0' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 500,
                        background: v.isActive ? '#dcfce7' : '#f1f5f9',
                        color: v.isActive ? '#166534' : '#64748b',
                      }}>
                        {v.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 0', fontSize: 14, color: '#64748b' }}>
                      {new Date(v.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 0', textAlign: 'right' }}>
                      <button
                        onClick={() => window.location.href = `/workflows/${v.id}`}
                        style={{
                          padding: '4px 10px',
                          background: v.id === workflow.id ? '#dbeafe' : '#f0f9ff',
                          color: '#0369a1',
                          border: '1px solid #bae6fd',
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: v.id === workflow.id ? 'default' : 'pointer',
                        }}
                        disabled={v.id === workflow.id}
                      >
                        {v.id === workflow.id ? 'Viewing' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 24, borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
            Workflow Steps ({workflow.steps.length})
          </h2>
        </div>

        {workflow.steps.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
            No steps defined
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            {workflow.steps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  marginBottom: index < workflow.steps.length - 1 ? 24 : 0,
                  paddingBottom: index < workflow.steps.length - 1 ? 24 : 0,
                  borderBottom: index < workflow.steps.length - 1 ? '1px solid #e2e8f0' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#3b82f6',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {step.stepOrder}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#1e293b' }}>
                        {step.name}
                      </h3>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: '#f1f5f9',
                        color: '#475569',
                      }}>
                        {step.stepType}
                      </span>
                    </div>
                    {step.description && (
                      <p style={{ margin: '8px 0', fontSize: 14, color: '#64748b' }}>
                        {step.description}
                      </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Assigned To</div>
                        <div style={{ fontSize: 14, color: '#1e293b' }}>
                          {parseAssignedTo(step.assignedTo)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Conditions</div>
                        {step.conditions && step.conditions !== 'null' ? (
                          <pre style={{
                            fontSize: 12,
                            color: '#1e293b',
                            background: '#f8fafc',
                            padding: 8,
                            borderRadius: 4,
                            overflow: 'auto',
                            margin: 0,
                          }}>
                            {parseConditions(step.conditions)}
                          </pre>
                        ) : (
                          <div style={{ fontSize: 14, color: '#1e293b' }}>None</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
