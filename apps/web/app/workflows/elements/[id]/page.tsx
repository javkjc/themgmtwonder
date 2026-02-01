'use client';

import { use, useEffect, useState } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../../../lib/api';
import type { Me } from '../../../types';
import Layout from '../../../components/Layout';
import ForcePasswordChange from '../../../components/ForcePasswordChange';
import { useToast } from '../../../components/ToastProvider';

type ElementTemplate = {
  id: string;
  elementType: 'step' | 'decision';
  displayLabel: string;
  stepType: string | null;
  defaultConfig: string | null;
  editableFields: string | null;
  validationConstraints: string | null;
  templateVersion: number;
  templateGroupId: string;
  isDeprecated: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export default function ElementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [template, setTemplate] = useState<ElementTemplate | null>(null);
  const [versions, setVersions] = useState<ElementTemplate[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [showDeprecateModal, setShowDeprecateModal] = useState(false);

  const { showToast } = useToast();

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
      loadTemplate();
      loadVersions();
    }
  }, [me]);

  const loadTemplate = async () => {
    setLoadingTemplate(true);
    try {
      const data = await apiFetchJson(`/workflows/elements/templates/${id}`);
      setTemplate(data as ElementTemplate);
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      showToast(e?.message || 'Failed to load element template', 'error');
    } finally {
      setLoadingTemplate(false);
    }
  };

  const loadVersions = async () => {
    try {
      const data = await apiFetchJson(`/workflows/elements/templates/${id}/versions`);
      setVersions(data as ElementTemplate[]);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load template versions', 'error');
    }
  };

  const handleDeprecate = async (isDeprecated: boolean) => {
    try {
      await apiFetchJson(`/workflows/elements/templates/${id}/deprecate`, {
        method: 'POST',
        body: JSON.stringify({ isDeprecated }),
      });
      showToast(
        isDeprecated ? 'Template deprecated successfully' : 'Template reactivated successfully',
        'success'
      );
      setShowDeprecateModal(false);
      loadTemplate();
    } catch (e: any) {
      showToast(e?.message || 'Failed to update template', 'error');
    }
  };

  const handleCreateVersion = async () => {
    try {
      const newVersion = await apiFetchJson(`/workflows/elements/templates/${id}/version`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      showToast('New version created successfully', 'success');
      window.location.href = `/workflows/elements/${(newVersion as ElementTemplate).id}`;
    } catch (e: any) {
      showToast(e?.message || 'Failed to create version', 'error');
    }
  };

  const logout = async () => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // Ignore
    }
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading...
      </div>
    );
  }

  if (!me) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        email={me.email}
        onChangePassword={async () => false}
        error={null}
      />
    );
  }

  if (authError) {
    return (
      <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
        <div style={{ padding: '20px' }}>
          <div style={{ color: '#dc2626', marginBottom: '20px' }}>{authError}</div>
          <button onClick={() => window.location.href = '/'}>Back to Home</button>
        </div>
      </Layout>
    );
  }

  if (me.role !== 'admin') {
    return (
      <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
        <div style={{ padding: '20px' }}>
          <div style={{ color: '#dc2626', marginBottom: '20px' }}>
            Access denied: Admin privileges required
          </div>
          <button onClick={() => window.location.href = '/'}>Back to Home</button>
        </div>
      </Layout>
    );
  }

  if (loadingTemplate) {
    return (
      <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          Loading element template...
        </div>
      </Layout>
    );
  }

  if (!template) {
    return (
      <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
        <div style={{ padding: '20px' }}>
          <div style={{ color: '#dc2626', marginBottom: '20px' }}>
            Element template not found
          </div>
          <button onClick={() => window.location.href = '/workflows/elements'}>
            Back to Element Library
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => window.location.href = '/workflows/elements'}
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              background: 'white',
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            ← Back to Element Library
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 600 }}>
                  {template.displayLabel}
                </h1>
                {template.isDeprecated && (
                  <span style={{
                    fontSize: '12px',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    background: '#fee',
                    color: '#dc2626',
                  }}>
                    Deprecated
                  </span>
                )}
              </div>
              <p style={{ color: '#64748b', fontSize: '14px' }}>
                Version {template.templateVersion} • {template.elementType} element
                {template.stepType && ` • ${template.stepType}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleCreateVersion}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                Create New Version
              </button>
              <button
                onClick={() => setShowDeprecateModal(true)}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '4px',
                  background: template.isDeprecated ? '#10b981' : '#ef4444',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {template.isDeprecated ? 'Reactivate' : 'Deprecate'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          <div>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                Template Details
              </h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Element Type</div>
                  <div style={{ fontSize: '14px' }}>{template.elementType}</div>
                </div>
                {template.stepType && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Step Type</div>
                    <div style={{ fontSize: '14px' }}>{template.stepType}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Template Version</div>
                  <div style={{ fontSize: '14px' }}>v{template.templateVersion}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Created</div>
                  <div style={{ fontSize: '14px' }}>{new Date(template.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Last Updated</div>
                  <div style={{ fontSize: '14px' }}>{new Date(template.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                Configuration
              </h2>
              <div style={{ display: 'grid', gap: '16px' }}>
                {template.defaultConfig && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Default Config</div>
                    <pre style={{
                      fontSize: '12px',
                      background: '#f8fafc',
                      padding: '12px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                    }}>
                      {JSON.stringify(JSON.parse(template.defaultConfig), null, 2)}
                    </pre>
                  </div>
                )}
                {template.editableFields && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Editable Fields</div>
                    <pre style={{
                      fontSize: '12px',
                      background: '#f8fafc',
                      padding: '12px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                    }}>
                      {JSON.stringify(JSON.parse(template.editableFields), null, 2)}
                    </pre>
                  </div>
                )}
                {template.validationConstraints && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Validation Constraints</div>
                    <pre style={{
                      fontSize: '12px',
                      background: '#f8fafc',
                      padding: '12px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                    }}>
                      {JSON.stringify(JSON.parse(template.validationConstraints), null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                Version History
              </h2>
              {versions.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '14px' }}>
                  No version history available
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        padding: '12px',
                        border: v.id === template.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: v.id === template.id ? '#eff6ff' : 'white',
                      }}
                      onClick={() => {
                        if (v.id !== template.id) {
                          window.location.href = `/workflows/elements/${v.id}`;
                        }
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>
                          Version {v.templateVersion}
                        </span>
                        {v.id === template.id && (
                          <span style={{ fontSize: '11px', color: '#3b82f6' }}>Current</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {new Date(v.createdAt).toLocaleDateString()}
                      </div>
                      {v.isDeprecated && (
                        <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                          Deprecated
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {showDeprecateModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowDeprecateModal(false)}
          >
            <div
              style={{
                background: 'white',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '400px',
                width: '100%',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
                {template.isDeprecated ? 'Reactivate Template?' : 'Deprecate Template?'}
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
                {template.isDeprecated
                  ? 'This will mark the template as active again.'
                  : 'This will mark the template as deprecated. It will remain visible but indicated as deprecated.'}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowDeprecateModal(false)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    background: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeprecate(!template.isDeprecated)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    border: 'none',
                    borderRadius: '4px',
                    background: template.isDeprecated ? '#10b981' : '#ef4444',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  {template.isDeprecated ? 'Reactivate' : 'Deprecate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
