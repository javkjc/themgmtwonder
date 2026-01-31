'use client';

import { use, useEffect, useState } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../../../lib/api';
import type { Me } from '../../../types';
import Layout from '../../../components/Layout';
import ForcePasswordChange from '../../../components/ForcePasswordChange';
import { useToast } from '../../../components/ToastProvider';
import {
  validateWorkflow,
  generateWorkflowExplanation,
  generateDryRunPreview,
  getValidationSummary,
  type ValidationResult,
  type DryRunResult,
} from '../../../lib/workflow-validation';

type DraftStep = {
  stepOrder: number;
  stepType: string;
  name: string;
  description: string;
  assignedTo: string;
  conditions: string;
};

type WorkflowDefinition = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  steps: {
    id: string;
    stepOrder: number;
    stepType: string;
    name: string;
    description: string | null;
    assignedTo: string | null;
    conditions: string | null;
  }[];
};

export default function WorkflowEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);

  const { showToast } = useToast();

  // Draft state
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([]);

  // Validation state (computed from draft state - no persistence)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [showValidation, setShowValidation] = useState(true);

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

  // Recompute validation whenever draft changes (pure function, no side effects)
  useEffect(() => {
    // Convert draft steps to validation format
    const validationSteps = steps.map(s => ({
      stepOrder: s.stepOrder,
      stepType: s.stepType,
      name: s.name,
      description: s.description,
      assignedTo: s.assignedTo,
      conditions: s.conditions,
    }));

    // Run validation (pure function - no side effects)
    const validation = validateWorkflow(workflowName, validationSteps);
    setValidationResult(validation);

    // Generate dry-run preview (pure function - no execution)
    const dryRun = generateDryRunPreview(workflowName, validationSteps);
    setDryRunResult(dryRun);
  }, [workflowName, steps]);

  const loadWorkflow = async () => {
    setLoadingWorkflow(true);
    try {
      const data = await apiFetchJson(`/workflows/${id}`);
      const workflow = data as WorkflowDefinition;

      // v6: Check if workflow is active - block editing if so
      if (workflow.isActive) {
        showToast('Active workflows cannot be edited. Deactivate the workflow first.', 'error');
        setTimeout(() => { window.location.href = `/workflows/${id}`; }, 2000);
        return;
      }

      // Load into draft state
      setWorkflowName(workflow.name);
      setWorkflowDescription(workflow.description || '');
      setSteps(
        workflow.steps.map((s) => ({
          stepOrder: s.stepOrder,
          stepType: s.stepType,
          name: s.name,
          description: s.description || '',
          assignedTo: s.assignedTo || '',
          conditions: s.conditions || '',
        }))
      );
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
    // Use validation result if available
    if (validationResult && !validationResult.isValid) {
      // Return first error message
      if (validationResult.errors.length > 0) {
        return validationResult.errors[0].message;
      }
    }

    // Fallback validation
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

      await apiFetchJson(`/workflows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      showToast('Workflow updated successfully', 'success');
      window.location.href = `/workflows/${id}`;
    } catch (e: any) {
      if (isForbidden(e)) {
        showToast('Access denied: Admin privileges required', 'error');
        return;
      }
      showToast(e?.message || 'Failed to update workflow', 'error');
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

  if (loadingWorkflow) {
    return (
      <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
          Loading workflow...
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="workflows" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => window.location.href = `/workflows/${id}`}
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
          ← Back to Workflow Detail
        </button>

        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
          Edit Workflow
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          Update workflow definition (draft mode)
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
              onClick={() => window.location.href = `/workflows/${id}`}
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

        {/* Right Panel: Validation & Preview */}
        <div>
          {/* Validation Status */}
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: 24,
            marginBottom: 16,
            position: 'sticky',
            top: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1e293b' }}>
                Validation & Preview
              </h2>
              <button
                onClick={() => setShowValidation(!showValidation)}
                style={{
                  padding: '4px 10px',
                  background: '#f1f5f9',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {showValidation ? 'Hide' : 'Show'}
              </button>
            </div>

            {/* Validation Summary */}
            {validationResult && (
              <div style={{
                padding: 12,
                borderRadius: 6,
                marginBottom: 16,
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
                      Possible execution paths (informational only)
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

                {/* No validation data yet */}
                {!validationResult && (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    Add workflow details to see validation
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
