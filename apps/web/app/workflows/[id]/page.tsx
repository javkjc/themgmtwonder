'use client';

import { use, useEffect, useState } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../../lib/api';
import type { Me } from '../../types';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useToast } from '../../components/ToastProvider';

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

type WorkflowDefinition = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
    }
  }, [me]);

  const loadWorkflow = async () => {
    setLoadingWorkflow(true);
    try {
      const data = await apiFetchJson(`/workflows/${id}`);
      setWorkflow(data as WorkflowDefinition);
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

          <button
            onClick={() => window.location.href = `/workflows/${id}/edit`}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Edit Workflow
          </button>
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
