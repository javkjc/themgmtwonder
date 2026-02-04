'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetchJson, isUnauthorized, isForbidden } from '../../lib/api';
import type { Me } from '../../types';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useToast } from '../../components/ToastProvider';
import FieldTable from '../../components/admin/FieldTable';
import FieldFormModal from '../../components/admin/FieldFormModal';
import ConfirmModal from '../../components/ConfirmModal';
import {
    listFields,
    createField,
    updateField,
    hideField,
    unhideField,
    archiveField,
    type Field,
    type FieldStatus,
    type CreateFieldDto,
    type UpdateFieldDto,
} from '../../lib/api/fields';

export default function AdminFieldsPage() {
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    // Toast
    const { showToast } = useToast();

    // Fields state
    const [fields, setFields] = useState<Field[]>([]);
    const [loadingFields, setLoadingFields] = useState(false);
    const [statusFilter, setStatusFilter] = useState<FieldStatus | 'all'>('all');

    // Form modal state
    const [formModal, setFormModal] = useState<{ mode: 'create' | 'edit'; field?: Field } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Confirm modal state
    const [confirmModal, setConfirmModal] = useState<{
        type: 'hide' | 'unhide' | 'archive';
        field: Field;
    } | null>(null);

    // Check auth on mount
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

    // Load fields when auth is confirmed
    useEffect(() => {
        if (me && me.role === 'admin') {
            loadFields();
        }
    }, [me, statusFilter]);

    const loadFields = async () => {
        setLoadingFields(true);
        try {
            const status = statusFilter === 'all' ? undefined : statusFilter;
            const data = await listFields(status);
            setFields(data);
        } catch (e: any) {
            if (isForbidden(e)) {
                showToast('Access denied: Admin privileges required', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                return;
            }
            showToast(e?.message || 'Failed to load fields', 'error');
        } finally {
            setLoadingFields(false);
        }
    };

    const handleCreateField = async (dto: CreateFieldDto | UpdateFieldDto) => {
        setSubmitting(true);
        setFormError(null);
        try {
            await createField(dto as CreateFieldDto);
            showToast('Field created successfully', 'success');
            setFormModal(null);
            loadFields();
        } catch (e: any) {
            if (isForbidden(e)) {
                showToast('Access denied: Admin privileges required', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                return;
            }
            setFormError(e?.message || 'Failed to create field');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateField = async (dto: CreateFieldDto | UpdateFieldDto) => {
        if (!formModal?.field) return;
        setSubmitting(true);
        setFormError(null);
        try {
            await updateField(formModal.field.fieldKey, dto as UpdateFieldDto);
            showToast('Field updated successfully', 'success');
            setFormModal(null);
            loadFields();
        } catch (e: any) {
            if (isForbidden(e)) {
                showToast('Access denied: Admin privileges required', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                return;
            }
            setFormError(e?.message || 'Failed to update field');
        } finally {
            setSubmitting(false);
        }
    };

    const handleHideField = async () => {
        if (!confirmModal || confirmModal.type !== 'hide') return;
        try {
            await hideField(confirmModal.field.fieldKey);
            showToast('Field hidden successfully', 'success');
            setConfirmModal(null);
            loadFields();
        } catch (e: any) {
            if (isForbidden(e)) {
                showToast('Access denied: Admin privileges required', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                return;
            }
            showToast(e?.message || 'Failed to hide field', 'error');
            setConfirmModal(null);
        }
    };

    const handleUnhideField = async () => {
        if (!confirmModal || confirmModal.type !== 'unhide') return;
        try {
            await unhideField(confirmModal.field.fieldKey);
            showToast('Field restored to active', 'success');
            setConfirmModal(null);
            loadFields();
        } catch (e: any) {
            if (isForbidden(e)) {
                showToast('Access denied: Admin privileges required', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                return;
            }
            showToast(e?.message || 'Failed to unhide field', 'error');
            setConfirmModal(null);
        }
    };

    const handleArchiveField = async () => {
        if (!confirmModal || confirmModal.type !== 'archive') return;
        try {
            await archiveField(confirmModal.field.fieldKey);
            showToast('Field archived successfully', 'success');
            setConfirmModal(null);
            loadFields();
        } catch (e: any) {
            if (isForbidden(e)) {
                showToast('Access denied: Admin privileges required', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                return;
            }
            showToast(e?.message || 'Failed to archive field', 'error');
            setConfirmModal(null);
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

    // Force password change handler
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

    // Force password change if required
    if (me.mustChangePassword) {
        return <ForcePasswordChange email={me.email} onChangePassword={forceChangePassword} error={authError} />;
    }

    // Check admin access
    if (!me.isAdmin) {
        if (typeof window !== 'undefined') {
            window.location.href = '/';
        }
        return null;
    }

    return (
        <Layout currentPage="adminFields" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
            {/* Header */}
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8, color: '#1e293b' }}>
                    Field Library
                </h1>
                <p style={{ color: '#64748b', margin: 0 }}>
                    Manage structured field definitions for extraction baselines
                </p>
            </div>

            {/* Actions Bar */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 24,
                }}
            >
                {/* Status Filter */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label htmlFor="statusFilter" style={{ fontSize: 14, fontWeight: 500, color: '#475569' }}>
                        Status:
                    </label>
                    <select
                        id="statusFilter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as FieldStatus | 'all')}
                        style={{
                            padding: '8px 12px',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            fontSize: 14,
                            outline: 'none',
                            background: 'white',
                        }}
                    >
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="hidden">Hidden</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>

                {/* Create Button */}
                <button
                    onClick={() => setFormModal({ mode: 'create' })}
                    style={{
                        padding: '10px 20px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    + Create Field
                </button>
            </div>

            {/* Fields Table */}
            <FieldTable
                fields={fields}
                loading={loadingFields}
                onEdit={(field) => setFormModal({ mode: 'edit', field })}
                onHide={(field) => setConfirmModal({ type: 'hide', field })}
                onUnhide={(field) => setConfirmModal({ type: 'unhide', field })}
                onArchive={(field) => setConfirmModal({ type: 'archive', field })}
            />

            {/* Form Modal */}
            <FieldFormModal
                isOpen={!!formModal}
                mode={formModal?.mode || 'create'}
                field={formModal?.field}
                onSubmit={formModal?.mode === 'create' ? handleCreateField : handleUpdateField}
                onCancel={() => {
                    setFormModal(null);
                    setFormError(null);
                }}
                submitting={submitting}
                error={formError}
            />

            {/* Hide Confirmation Modal */}
            {confirmModal && confirmModal.type === 'hide' && (
                <ConfirmModal
                    isOpen={true}
                    title="Hide Field"
                    message="Hidden fields are unavailable for new assignments but remain visible in history."
                    taskTitle={`${confirmModal.field.label} (${confirmModal.field.fieldKey})`}
                    confirmText="Hide Field"
                    cancelText="Cancel"
                    variant="warning"
                    onConfirm={handleHideField}
                    onCancel={() => setConfirmModal(null)}
                />
            )}

            {/* Unhide Confirmation Modal */}
            {confirmModal && confirmModal.type === 'unhide' && (
                <ConfirmModal
                    isOpen={true}
                    title="Unhide Field"
                    message="This will make the field available for new assignments again."
                    taskTitle={`${confirmModal.field.label} (${confirmModal.field.fieldKey})`}
                    confirmText="Unhide"
                    cancelText="Cancel"
                    variant="info"
                    onConfirm={handleUnhideField}
                    onCancel={() => setConfirmModal(null)}
                />
            )}

            {/* Archive Confirmation Modal */}
            {confirmModal && confirmModal.type === 'archive' && (
                <ConfirmModal
                    isOpen={true}
                    title="Archive Field"
                    message="Archived fields cannot be used. Fields in use cannot be archived."
                    taskTitle={`${confirmModal.field.label} (${confirmModal.field.fieldKey})`}
                    confirmText="Archive Field"
                    cancelText="Cancel"
                    variant="danger"
                    onConfirm={handleArchiveField}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </Layout>
    );
}
