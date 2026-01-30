'use client';

import { useEffect, useState } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../../lib/api';
import type { Me } from '../../types';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useToast } from '../../components/ToastProvider';

type DraftStep = {
  stepOrder: number;
  stepType: string;
  name: string;
  description: string;
  assignedTo: string;
  conditions: string;
};

export default function WorkflowNewPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { showToast } = useToast();

  // Draft state
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([]);

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

  const handleAddStep = () => {
    const newStep: DraftStep = {
      stepOrder: steps.length + 1,
      stepType: 'approve',
      name: '',
      description: '',
      assignedTo: '',
      conditions: '',
    };
    setSteps([...steps, newStep]);
  };

  const handleRemoveStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    // Reorder remaining steps
    const reorderedSteps = newSteps.map((step, i) => ({
      ...step,
      stepOrder: i + 1,
    }));
    setSteps(reorderedSteps);
  };

  const handleMoveStepUp = (index: number) => {
    if (index === 0) return;
    const newSteps = [...steps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    // Reorder
    const reorderedSteps = newSteps.map((step, i) => ({
      ...step,
      stepOrder: i + 1,
    }));
    setSteps(reorderedSteps);
  };

  const handleMoveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    // Reorder
    const reorderedSteps = newSteps.map((step, i) => ({
      ...step,
      stepOrder: i + 1,
    }));
    setSteps(reorderedSteps);
  };

  const handleUpdateStep = (index: number, field: keyof DraftStep, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      [field]: value,
    };
    setSteps(newSteps);
  };

  const validateDraft = (): string | null => {
    if (!workflowName.trim()) {
      return 'Workflow name is required';
    }
    if (steps.length === 0) {
      return 'At least one step is required';
    }
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].name.trim()) {
        return `Step ${i + 1} name is required`;
      }
      if (!steps[i].stepType.trim()) {
        return `Step ${i + 1} type is required`;
      }
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const validationError = validateDraft();
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: workflowName,
        description: workflowDescription || undefined,
        steps: steps.map((step) => ({
          stepOrder: step.stepOrder,
          stepType: step.stepType,
          name: step.name,
          description: step.description || undefined,
          assignedTo: step.assignedTo || undefined,
          conditions: step.conditions || undefined,
        })),
      };

      const result = await apiFetchJson('/workflows', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast('Workflow created successfully', 'success');
      window.location.href = `/workflows/${result.id}`;
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        return;
      }
      showToast(e?.message || 'Failed to create workflow', 'error');
    } finally {
      setSaving(false);
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
      <div style={{ marginBottom: 24 }}>
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
            marginBottom: 16,
          }}
        >
          ← Back to Workflows
        </button>

        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
          Create Workflow
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          Design a new workflow definition (draft mode)
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
        {/* Left Panel: Editor */}
        <div>
          {/* Metadata Section */}
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: 24,
            marginBottom: 24,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 16, color: '#1e293b' }}>
              Workflow Details
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#475569', marginBottom: 8 }}>
                Name *
              </label>
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Enter workflow name"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#475569', marginBottom: 8 }}>
                Description
              </label>
              <textarea
                value={workflowDescription}
                onChange={(e) => setWorkflowDescription(e.target.value)}
                placeholder="Enter workflow description (optional)"
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          {/* Steps Section */}
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
                Workflow Steps
              </h2>
              <button
                onClick={handleAddStep}
                style={{
                  padding: '6px 12px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                + Add Stage
              </button>
            </div>

            {steps.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                No steps added yet. Click "Add Stage" to begin.
              </div>
            ) : (
              steps.map((step, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: 16,
                    padding: 16,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
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
                    <input
                      type="text"
                      value={step.name}
                      onChange={(e) => handleUpdateStep(index, 'name', e.target.value)}
                      placeholder="Step name *"
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: 4,
                        fontSize: 14,
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => handleMoveStepUp(index)}
                        disabled={index === 0}
                        style={{
                          padding: '4px 8px',
                          background: index === 0 ? '#f1f5f9' : 'white',
                          color: index === 0 ? '#cbd5e1' : '#64748b',
                          border: '1px solid #e2e8f0',
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: index === 0 ? 'not-allowed' : 'pointer',
                        }}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoveStepDown(index)}
                        disabled={index === steps.length - 1}
                        style={{
                          padding: '4px 8px',
                          background: index === steps.length - 1 ? '#f1f5f9' : 'white',
                          color: index === steps.length - 1 ? '#cbd5e1' : '#64748b',
                          border: '1px solid #e2e8f0',
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: index === steps.length - 1 ? 'not-allowed' : 'pointer',
                        }}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => handleRemoveStep(index)}
                        style={{
                          padding: '4px 8px',
                          background: 'white',
                          color: '#ef4444',
                          border: '1px solid #fecaca',
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                        title="Remove step"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div style={{ marginLeft: 44, display: 'grid', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        Step Type *
                      </label>
                      <select
                        value={step.stepType}
                        onChange={(e) => handleUpdateStep(index, 'stepType', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          fontSize: 14,
                          fontFamily: 'inherit',
                        }}
                      >
                        <option value="approve">Approve</option>
                        <option value="review">Review</option>
                        <option value="acknowledge">Acknowledge</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        Description
                      </label>
                      <textarea
                        value={step.description}
                        onChange={(e) => handleUpdateStep(index, 'description', e.target.value)}
                        placeholder="Optional description"
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        Assigned To (JSON)
                      </label>
                      <input
                        type="text"
                        value={step.assignedTo}
                        onChange={(e) => handleUpdateStep(index, 'assignedTo', e.target.value)}
                        placeholder='e.g. {"type":"role","value":"admin"}'
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          fontSize: 13,
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                        Conditions (JSON)
                      </label>
                      <input
                        type="text"
                        value={step.conditions}
                        onChange={(e) => handleUpdateStep(index, 'conditions', e.target.value)}
                        placeholder="Optional conditions"
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          fontSize: 13,
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}

            <div style={{ marginTop: 24, textAlign: 'center', paddingBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
              <div style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: '#fce7f3',
                color: '#9f1239',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
              }}>
                END
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: saving ? '#94a3b8' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 16,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => window.location.href = '/workflows'}
              style={{
                padding: '10px 24px',
                background: 'white',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 16,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Right Panel: Preview */}
        <div>
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: 24,
            position: 'sticky',
            top: 24,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 16, color: '#1e293b' }}>
              Preview
            </h2>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              Read-only preview of workflow flow
            </div>

            {steps.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No steps to preview
              </div>
            ) : (
              <div>
                {/* Start Node */}
                <div style={{ marginBottom: 16, textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: '#dbeafe',
                    color: '#1e40af',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '2px solid #3b82f6',
                  }}>
                    {workflowName || 'Untitled Workflow'}
                  </div>
                </div>

                {/* Steps */}
                {steps.map((step, index) => (
                  <div key={index} style={{ marginBottom: 16 }}>
                    {/* Connector */}
                    <div style={{
                      width: 2,
                      height: 24,
                      background: '#cbd5e1',
                      margin: '0 auto',
                    }} />

                    {/* Step Node */}
                    <div style={{
                      padding: 12,
                      background: step.name ? '#f0f9ff' : '#f8fafc',
                      border: `2px solid ${step.name ? '#0ea5e9' : '#e2e8f0'}`,
                      borderRadius: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#0ea5e9',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                          {step.stepOrder}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                          {step.name || 'Unnamed Step'}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginLeft: 28 }}>
                        {step.stepType}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Connector to END */}
                <div style={{
                  width: 2,
                  height: 24,
                  background: '#cbd5e1',
                  margin: '0 auto',
                }} />

                {/* End Node */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: '#f1f5f9',
                    color: '#64748b',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '2px solid #cbd5e1',
                  }}>
                    END
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
