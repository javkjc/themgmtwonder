'use client';

import { useEffect, useState } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../../lib/api';
import type { Me } from '../../types';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useToast } from '../../components/ToastProvider';

type ElementTemplate = {
  id: string;
  elementType: 'step' | 'decision';
  displayLabel: string;
  stepType: string | null;
  templateVersion: number;
  templateGroupId: string;
  isDeprecated: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function ElementLibraryPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ElementTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);

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
      loadTemplates();
    }
  }, [me]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await apiFetchJson('/workflows/elements/templates');
      setTemplates(data as ElementTemplate[]);
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
        return;
      }
      showToast(e?.message || 'Failed to load element templates', 'error');
    } finally {
      setLoadingTemplates(false);
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

  // Group templates by templateGroupId to show only latest version
  const templateGroups = new Map<string, ElementTemplate>();
  templates.forEach(t => {
    const groupId = t.templateGroupId;
    const existing = templateGroups.get(groupId);
    if (!existing || t.templateVersion > existing.templateVersion) {
      templateGroups.set(groupId, t);
    }
  });

  const latestTemplates = Array.from(templateGroups.values());

  return (
    <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
              Workflow Element Library
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px' }}>
              Reusable building blocks for workflow composition
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => window.location.href = '/workflows'}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              Back to Workflows
            </button>
            <button
              onClick={() => setShowNewTemplateModal(true)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '4px',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              New Element Template
            </button>
          </div>
        </div>

        {loadingTemplates ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            Loading element templates...
          </div>
        ) : latestTemplates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            No element templates found. Create your first template to get started.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {latestTemplates.map((template) => (
              <div
                key={template.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  background: 'white',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                }}
                onClick={() => window.location.href = `/workflows/elements/${template.id}`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                      {template.displayLabel}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      v{template.templateVersion}
                    </div>
                  </div>
                  {template.isDeprecated && (
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: '#fee',
                      color: '#dc2626',
                    }}>
                      Deprecated
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: template.elementType === 'step' ? '#e0f2fe' : '#fef3c7',
                    color: template.elementType === 'step' ? '#0369a1' : '#ca8a04',
                  }}>
                    {template.elementType}
                  </span>
                  {template.stepType && (
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: '#f1f5f9',
                      color: '#475569',
                    }}>
                      {template.stepType}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Updated {new Date(template.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {showNewTemplateModal && (
          <NewTemplateModal
            onClose={() => setShowNewTemplateModal(false)}
            onSuccess={() => {
              setShowNewTemplateModal(false);
              loadTemplates();
            }}
          />
        )}
      </div>
    </Layout>
  );
}

function NewTemplateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [elementType, setElementType] = useState<'step' | 'decision'>('step');
  const [displayLabel, setDisplayLabel] = useState('');
  const [stepType, setStepType] = useState('approve');
  const [defaultConfig, setDefaultConfig] = useState('');
  const [editableFields, setEditableFields] = useState('');
  const [validationConstraints, setValidationConstraints] = useState('');
  const [creating, setCreating] = useState(false);

  const { showToast } = useToast();

  const handleCreate = async () => {
    if (!displayLabel.trim()) {
      showToast('Display label is required', 'error');
      return;
    }

    setCreating(true);
    try {
      await apiFetchJson('/workflows/elements/templates', {
        method: 'POST',
        body: JSON.stringify({
          elementType,
          displayLabel: displayLabel.trim(),
          stepType: elementType === 'step' ? stepType : 'if_else',
          defaultConfig: defaultConfig.trim() || undefined,
          editableFields: editableFields.trim() || undefined,
          validationConstraints: validationConstraints.trim() || undefined,
        }),
      });
      showToast('Element template created successfully', 'success');
      onSuccess();
    } catch (e: any) {
      showToast(e?.message || 'Failed to create element template', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>
          New Element Template
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            Element Type
          </label>
          <select
            value={elementType}
            onChange={(e) => setElementType(e.target.value as 'step' | 'decision')}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            <option value="step">Step</option>
            <option value="decision">Decision</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            Display Label *
          </label>
          <input
            type="text"
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            placeholder="e.g., Manager Approval"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        {elementType === 'step' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Step Type
            </label>
            <select
              value={stepType}
              onChange={(e) => setStepType(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              <option value="approve">Approve</option>
              <option value="review">Review</option>
              <option value="acknowledge">Acknowledge</option>
            </select>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            Default Config (JSON)
          </label>
          <textarea
            value={defaultConfig}
            onChange={(e) => setDefaultConfig(e.target.value)}
            placeholder='{"assignedTo": "admin", "description": "..."}'
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            Editable Fields (JSON array)
          </label>
          <textarea
            value={editableFields}
            onChange={(e) => setEditableFields(e.target.value)}
            placeholder='["assignedTo", "description"]'
            rows={2}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
            Validation Constraints (JSON)
          </label>
          <textarea
            value={validationConstraints}
            onChange={(e) => setValidationConstraints(e.target.value)}
            placeholder='{"required": ["assignedTo"]}'
            rows={2}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={creating}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              background: 'white',
              cursor: creating ? 'not-allowed' : 'pointer',
              opacity: creating ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: 'none',
              borderRadius: '4px',
              background: '#3b82f6',
              color: 'white',
              cursor: creating ? 'not-allowed' : 'pointer',
              opacity: creating ? 0.5 : 1,
            }}
          >
            {creating ? 'Creating...' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
