'use client';

import React, { useEffect, useState } from 'react';
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
  workflowGroupId: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkflowGroup = {
  groupId: string;
  displayName: string;
  isActive: boolean;
  latestUpdatedAt: string;
  versions: WorkflowDefinition[];
};

export default function WorkflowsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const { showToast } = useToast();

  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

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

  // Group workflows by workflowGroupId
  const groupWorkflows = (workflows: WorkflowDefinition[]): WorkflowGroup[] => {
    const groupMap = new Map<string, WorkflowDefinition[]>();

    // Group by workflowGroupId (or id if workflowGroupId is null)
    workflows.forEach((workflow) => {
      const groupId = workflow.workflowGroupId || workflow.id;
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId)!.push(workflow);
    });

    // Convert to WorkflowGroup array
    const groups: WorkflowGroup[] = Array.from(groupMap.entries()).map(([groupId, versions]) => {
      // Sort versions by version number descending (latest first)
      versions.sort((a, b) => b.version - a.version);

      // Determine group display name from latest/active version
      const activeVersion = versions.find(v => v.isActive);
      const latestVersion = versions[0];
      const displayVersion = activeVersion || latestVersion;

      // Determine if any version in group is active
      const isActive = versions.some(v => v.isActive);

      // Get latest updatedAt for sorting groups
      const latestUpdatedAt = versions.reduce((latest, v) => {
        return new Date(v.updatedAt) > new Date(latest) ? v.updatedAt : latest;
      }, versions[0].updatedAt);

      return {
        groupId,
        displayName: displayVersion.name,
        isActive,
        latestUpdatedAt,
        versions,
      };
    });

    // Sort groups by latest updatedAt descending
    groups.sort((a, b) => new Date(b.latestUpdatedAt).getTime() - new Date(a.latestUpdatedAt).getTime());

    return groups;
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const workflowGroups = groupWorkflows(workflows);

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#1e293b' }}>
            Workflow Management
          </h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => window.location.href = '/workflows/elements'}
              style={{
                padding: '10px 20px',
                background: 'white',
                color: '#3b82f6',
                border: '1px solid #3b82f6',
                borderRadius: 6,
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Element Library
            </button>
            <button
              onClick={() => window.location.href = '/workflows/new'}
              style={{
                padding: '10px 20px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + Create Workflow
            </button>
          </div>
        </div>
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
              workflowGroups.map((group) => {
                const isExpanded = expandedGroupIds.has(group.groupId);
                const hasMultipleVersions = group.versions.length > 1;

                return (
                  <React.Fragment key={group.groupId}>
                    {/* Group header row */}
                    <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasMultipleVersions && (
                            <button
                              onClick={() => toggleGroup(group.groupId)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                color: '#64748b',
                              }}
                            >
                              <span style={{ fontSize: 16 }}>{isExpanded ? '▼' : '▶'}</span>
                            </button>
                          )}
                          <span>{group.displayName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#64748b' }}>
                        {hasMultipleVersions ? `${group.versions.length} versions` : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'center' }}>
                        -
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          background: group.isActive ? '#dcfce7' : '#f1f5f9',
                          color: group.isActive ? '#166534' : '#64748b',
                        }}>
                          {group.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#64748b' }}>
                        {new Date(group.latestUpdatedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {!hasMultipleVersions && (
                          <button
                            onClick={() => window.location.href = `/workflows/${group.versions[0].id}`}
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
                            View
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Version rows (shown when expanded) */}
                    {hasMultipleVersions && isExpanded && group.versions.map((workflow) => (
                      <tr key={workflow.id} style={{ borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                        <td style={{ padding: '12px 16px 12px 48px', fontSize: 14, fontWeight: 400, color: '#64748b' }}>
                          {workflow.name}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 14, color: '#64748b' }}>
                          {workflow.description || '-'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'center', fontWeight: 500 }}>
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
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
                              View
                            </button>
                            {!workflow.isActive && (
                              <button
                                onClick={() => window.location.href = `/workflows/${workflow.id}/edit`}
                                style={{
                                  padding: '6px 12px',
                                  background: '#fefce8',
                                  color: '#854d0e',
                                  border: '1px solid #fde047',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
