'use client';

import { useEffect, useState } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../lib/api';
import type { Me } from '../types';
import Layout from '../components/Layout';
import ForcePasswordChange from '../components/ForcePasswordChange';
import { useToast } from '../components/ToastProvider';

type WorkflowDefinition = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function WorkflowsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const { showToast } = useToast();

  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);

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
      loadWorkflows();
    }
  }, [me]);

  const loadWorkflows = async () => {
    setLoadingWorkflows(true);
    try {
      const data = await apiFetchJson('/workflows');
      setWorkflows(data as WorkflowDefinition[]);
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      showToast(e?.message || 'Failed to load workflows', 'error');
    } finally {
      setLoadingWorkflows(false);
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

  return (
    <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
          Workflow Management
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          View and manage workflow definitions
        </p>
      </div>

      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#475569' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#475569' }}>Description</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#475569' }}>Version</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#475569' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#475569' }}>Last Updated</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#475569' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingWorkflows ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  Loading workflows...
                </td>
              </tr>
            ) : workflows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  No workflow definitions found
                </td>
              </tr>
            ) : (
              workflows.map((workflow) => (
                <tr key={workflow.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>
                    {workflow.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: '#64748b' }}>
                    {workflow.description || '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'center' }}>
                    v{workflow.version}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      background: workflow.isActive ? '#dcfce7' : '#f1f5f9',
                      color: workflow.isActive ? '#166534' : '#64748b',
                    }}>
                      {workflow.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: '#64748b' }}>
                    {new Date(workflow.updatedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => window.location.href = `/workflows/${workflow.id}`}
                      style={{
                        padding: '6px 12px',
                        background: '#f0f9ff',
                        color: '#0369a1',
                        border: '1px solid #bae6fd',
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
