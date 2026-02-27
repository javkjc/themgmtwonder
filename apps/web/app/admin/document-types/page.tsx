'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetchJson, isForbidden, isUnauthorized } from '../../lib/api';
import type { Me } from '../../types';
import Layout from '../../components/Layout';
import ForcePasswordChange from '../../components/ForcePasswordChange';
import { useToast } from '../../components/ToastProvider';
import { listFields, type Field } from '../../lib/api/fields';
import {
    addDocumentTypeField,
    createDocumentType,
    deleteDocumentType,
    getDocumentTypeFields,
    listDocumentTypes,
    removeDocumentTypeField,
    updateDocumentType,
    updateDocumentTypeField,
    type DocumentType,
    type DocumentTypeField,
} from '../../lib/api/document-types';

type FieldEditState = {
    required: boolean;
    zoneHint: string;
    sortOrder: number;
};

export default function AdminDocumentTypesPage() {
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    const { showToast } = useToast();

    const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
    const [loadingDocumentTypes, setLoadingDocumentTypes] = useState(false);
    const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<string | null>(null);

    const [templateFields, setTemplateFields] = useState<DocumentTypeField[]>([]);
    const [loadingTemplateFields, setLoadingTemplateFields] = useState(false);
    const [fieldEdits, setFieldEdits] = useState<Record<string, FieldEditState>>({});

    const [libraryFields, setLibraryFields] = useState<Field[]>([]);

    const [typeFormMode, setTypeFormMode] = useState<'create' | 'edit'>('create');
    const [typeName, setTypeName] = useState('');
    const [typeDescription, setTypeDescription] = useState('');
    const [submittingType, setSubmittingType] = useState(false);

    const [newFieldKey, setNewFieldKey] = useState('');
    const [newRequired, setNewRequired] = useState(false);
    const [newZoneHint, setNewZoneHint] = useState('');
    const [newSortOrder, setNewSortOrder] = useState(0);
    const [submittingField, setSubmittingField] = useState(false);

    const selectedDocumentType = useMemo(
        () => documentTypes.find((type) => type.id === selectedDocumentTypeId) ?? null,
        [documentTypes, selectedDocumentTypeId],
    );

    const availableFields = useMemo(() => {
        const usedKeys = new Set(templateFields.map((field) => field.fieldKey));
        return libraryFields.filter((field) => !usedKeys.has(field.fieldKey));
    }, [libraryFields, templateFields]);

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
            loadDocumentTypes();
            loadFieldLibrary();
        }
    }, [me]);

    useEffect(() => {
        if (!selectedDocumentTypeId) {
            setTemplateFields([]);
            setFieldEdits({});
            return;
        }

        loadTemplateFields(selectedDocumentTypeId);
    }, [selectedDocumentTypeId]);

    useEffect(() => {
        if (availableFields.length > 0 && !availableFields.some((field) => field.fieldKey === newFieldKey)) {
            setNewFieldKey(availableFields[0].fieldKey);
        }
        if (availableFields.length === 0) {
            setNewFieldKey('');
        }
    }, [availableFields, newFieldKey]);

    const redirectForbidden = () => {
        showToast('Access denied: Admin privileges required', 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
    };

    const loadDocumentTypes = async () => {
        setLoadingDocumentTypes(true);
        try {
            const types = await listDocumentTypes();
            setDocumentTypes(types);

            if (types.length === 0) {
                setSelectedDocumentTypeId(null);
                setTypeFormMode('create');
                setTypeName('');
                setTypeDescription('');
                return;
            }

            if (!selectedDocumentTypeId || !types.some((type) => type.id === selectedDocumentTypeId)) {
                setSelectedDocumentTypeId(types[0].id);
            }
        } catch (e: any) {
            if (isForbidden(e)) {
                redirectForbidden();
                return;
            }
            showToast(e?.message || 'Failed to load document types', 'error');
        } finally {
            setLoadingDocumentTypes(false);
        }
    };

    const loadFieldLibrary = async () => {
        try {
            const fields = await listFields('active');
            setLibraryFields(fields);
        } catch (e: any) {
            showToast(e?.message || 'Failed to load field library', 'error');
        }
    };

    const loadTemplateFields = async (documentTypeId: string) => {
        setLoadingTemplateFields(true);
        try {
            const fields = await getDocumentTypeFields(documentTypeId);
            setTemplateFields(fields);

            const nextEdits: Record<string, FieldEditState> = {};
            for (const field of fields) {
                nextEdits[field.fieldKey] = {
                    required: field.required,
                    zoneHint: field.zoneHint ?? '',
                    sortOrder: field.sortOrder,
                };
            }
            setFieldEdits(nextEdits);
            setNewSortOrder(fields.length);
        } catch (e: any) {
            if (isForbidden(e)) {
                redirectForbidden();
                return;
            }
            showToast(e?.message || 'Failed to load document type fields', 'error');
        } finally {
            setLoadingTemplateFields(false);
        }
    };

    const handleSelectDocumentType = (documentType: DocumentType) => {
        setSelectedDocumentTypeId(documentType.id);
        setTypeFormMode('edit');
        setTypeName(documentType.name);
        setTypeDescription(documentType.description ?? '');
    };

    const handleCreateMode = () => {
        setTypeFormMode('create');
        setTypeName('');
        setTypeDescription('');
    };

    const handleSaveDocumentType = async () => {
        const name = typeName.trim();
        if (!name) {
            showToast('Document type name is required', 'error');
            return;
        }

        setSubmittingType(true);
        try {
            if (typeFormMode === 'create') {
                const created = await createDocumentType({
                    name,
                    description: typeDescription.trim() || undefined,
                });
                showToast('Document type created successfully', 'success');
                await loadDocumentTypes();
                setSelectedDocumentTypeId(created.id);
                setTypeFormMode('edit');
            } else if (selectedDocumentTypeId) {
                await updateDocumentType(selectedDocumentTypeId, {
                    name,
                    description: typeDescription.trim() || undefined,
                });
                showToast('Document type updated successfully', 'success');
                await loadDocumentTypes();
            }
        } catch (e: any) {
            if (isForbidden(e)) {
                redirectForbidden();
                return;
            }
            showToast(e?.message || 'Failed to save document type', 'error');
        } finally {
            setSubmittingType(false);
        }
    };

    const handleDeleteDocumentType = async () => {
        if (!selectedDocumentTypeId || !selectedDocumentType) {
            return;
        }

        if (!window.confirm(`Delete document type "${selectedDocumentType.name}"?`)) {
            return;
        }

        try {
            await deleteDocumentType(selectedDocumentTypeId);
            showToast('Document type deleted successfully', 'success');
            setTypeFormMode('create');
            setTypeName('');
            setTypeDescription('');
            setSelectedDocumentTypeId(null);
            await loadDocumentTypes();
        } catch (e: any) {
            if (isForbidden(e)) {
                redirectForbidden();
                return;
            }
            showToast(e?.message || 'Failed to delete document type', 'error');
        }
    };

    const handleAddField = async () => {
        if (!selectedDocumentTypeId) {
            return;
        }

        if (!newFieldKey) {
            showToast('Select a field to add', 'error');
            return;
        }

        setSubmittingField(true);
        try {
            await addDocumentTypeField(selectedDocumentTypeId, {
                fieldKey: newFieldKey,
                required: newRequired,
                zoneHint: newZoneHint.trim() || undefined,
                sortOrder: newSortOrder,
            });
            showToast('Field added to template', 'success');
            setNewRequired(false);
            setNewZoneHint('');
            await loadTemplateFields(selectedDocumentTypeId);
        } catch (e: any) {
            if (isForbidden(e)) {
                redirectForbidden();
                return;
            }
            showToast(e?.message || 'Failed to add field', 'error');
        } finally {
            setSubmittingField(false);
        }
    };

    const handleUpdateField = async (fieldKey: string) => {
        if (!selectedDocumentTypeId) {
            return;
        }

        const next = fieldEdits[fieldKey];
        if (!next) {
            return;
        }

        try {
            await updateDocumentTypeField(selectedDocumentTypeId, fieldKey, {
                required: next.required,
                zoneHint: next.zoneHint.trim() || undefined,
                sortOrder: Number(next.sortOrder),
            });
            showToast(`Updated ${fieldKey}`, 'success');
            await loadTemplateFields(selectedDocumentTypeId);
        } catch (e: any) {
            if (isForbidden(e)) {
                redirectForbidden();
                return;
            }
            showToast(e?.message || `Failed to update ${fieldKey}`, 'error');
        }
    };

    const handleRemoveField = async (fieldKey: string) => {
        if (!selectedDocumentTypeId) {
            return;
        }

        if (!window.confirm(`Remove field "${fieldKey}" from this template?`)) {
            return;
        }

        try {
            await removeDocumentTypeField(selectedDocumentTypeId, fieldKey);
            showToast(`Removed ${fieldKey}`, 'success');
            await loadTemplateFields(selectedDocumentTypeId);
        } catch (e: any) {
            if (isForbidden(e)) {
                redirectForbidden();
                return;
            }
            showToast(e?.message || `Failed to remove ${fieldKey}`, 'error');
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
        return <ForcePasswordChange email={me.email} onChangePassword={forceChangePassword} error={authError} />;
    }

    if (!me.isAdmin) {
        if (typeof window !== 'undefined') {
            window.location.href = '/';
        }
        return null;
    }

    return (
        <Layout currentPage="adminDocumentTypes" userEmail={me.email} userRole={me.role} isAdmin={me.isAdmin} onLogout={logout}>
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-heading)', letterSpacing: '-0.025em', margin: 0, marginBottom: 8, color: 'var(--text-primary)' }}>
                    Document Types
                </h1>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                    Manage document type templates and scoped field order for extraction.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
                <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Types</h2>
                        <button
                            onClick={handleCreateMode}
                            style={{
                                padding: '8px 12px',
                                background: '#F43F5E',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            + New
                        </button>
                    </div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                        <input
                            value={typeName}
                            onChange={(e) => setTypeName(e.target.value)}
                            placeholder="Type name"
                            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                        />
                        <textarea
                            value={typeDescription}
                            onChange={(e) => setTypeDescription(e.target.value)}
                            placeholder="Description (optional)"
                            rows={3}
                            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleSaveDocumentType}
                                disabled={submittingType}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: '#0EA5E9',
                                    color: '#fff',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                {typeFormMode === 'create' ? 'Create Type' : 'Save Type'}
                            </button>
                            {typeFormMode === 'edit' && selectedDocumentType && (
                                <button
                                    onClick={handleDeleteDocumentType}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: 6,
                                        border: '1px solid #DC2626',
                                        background: 'transparent',
                                        color: '#DC2626',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 8 }}>
                        {loadingDocumentTypes && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading document types...</div>}
                        {!loadingDocumentTypes && documentTypes.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No document types created yet.</div>
                        )}
                        {documentTypes.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => handleSelectDocumentType(type)}
                                style={{
                                    textAlign: 'left',
                                    padding: '10px 12px',
                                    borderRadius: 8,
                                    border: selectedDocumentTypeId === type.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                                    background: selectedDocumentTypeId === type.id ? 'var(--surface-hover)' : 'var(--surface)',
                                    cursor: 'pointer',
                                }}
                            >
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{type.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{type.description || 'No description'}</div>
                            </button>
                        ))}
                    </div>
                </section>

                <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <h2 style={{ margin: 0, marginBottom: 12, fontSize: 18, color: 'var(--text-primary)' }}>Field Template</h2>

                    {!selectedDocumentType && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Select or create a document type to edit its template.</div>
                    )}

                    {selectedDocumentType && (
                        <>
                            <div style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 14 }}>
                                Editing template for <strong>{selectedDocumentType.name}</strong>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 110px 1fr 100px auto', gap: 8, marginBottom: 16 }}>
                                <select
                                    value={newFieldKey}
                                    onChange={(e) => setNewFieldKey(e.target.value)}
                                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                                    disabled={availableFields.length === 0 || submittingField}
                                >
                                    {availableFields.length === 0 && <option value="">No available fields</option>}
                                    {availableFields.map((field) => (
                                        <option key={field.fieldKey} value={field.fieldKey}>
                                            {field.label} ({field.fieldKey})
                                        </option>
                                    ))}
                                </select>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={newRequired}
                                        onChange={(e) => setNewRequired(e.target.checked)}
                                    />
                                    Required
                                </label>
                                <input
                                    value={newZoneHint}
                                    onChange={(e) => setNewZoneHint(e.target.value)}
                                    placeholder="Zone hint (optional)"
                                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                                />
                                <input
                                    type="number"
                                    min={0}
                                    value={newSortOrder}
                                    onChange={(e) => setNewSortOrder(Number(e.target.value))}
                                    placeholder="Sort"
                                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14 }}
                                />
                                <button
                                    onClick={handleAddField}
                                    disabled={submittingField || availableFields.length === 0}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: 6,
                                        border: 'none',
                                        background: '#10B981',
                                        color: '#fff',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Add Field
                                </button>
                            </div>

                            {loadingTemplateFields && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading template fields...</div>}
                            {!loadingTemplateFields && templateFields.length === 0 && (
                                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No fields assigned yet.</div>
                            )}

                            {!loadingTemplateFields && templateFields.length > 0 && (
                                <div style={{ display: 'grid', gap: 8 }}>
                                    {templateFields.map((field) => {
                                        const edit = fieldEdits[field.fieldKey] ?? {
                                            required: field.required,
                                            zoneHint: field.zoneHint ?? '',
                                            sortOrder: field.sortOrder,
                                        };

                                        return (
                                            <div
                                                key={field.fieldKey}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'minmax(180px, 1fr) 120px 1fr 95px auto auto',
                                                    gap: 8,
                                                    alignItems: 'center',
                                                    padding: 10,
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 8,
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        {field.label}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                        {field.fieldKey} - {field.characterType}
                                                    </div>
                                                </div>

                                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={edit.required}
                                                        onChange={(e) =>
                                                            setFieldEdits((prev) => ({
                                                                ...prev,
                                                                [field.fieldKey]: { ...edit, required: e.target.checked },
                                                            }))
                                                        }
                                                    />
                                                    Required
                                                </label>

                                                <input
                                                    value={edit.zoneHint}
                                                    onChange={(e) =>
                                                        setFieldEdits((prev) => ({
                                                            ...prev,
                                                            [field.fieldKey]: { ...edit, zoneHint: e.target.value },
                                                        }))
                                                    }
                                                    placeholder="Zone hint"
                                                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                                                />

                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={edit.sortOrder}
                                                    onChange={(e) =>
                                                        setFieldEdits((prev) => ({
                                                            ...prev,
                                                            [field.fieldKey]: { ...edit, sortOrder: Number(e.target.value) },
                                                        }))
                                                    }
                                                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                                                />

                                                <button
                                                    onClick={() => handleUpdateField(field.fieldKey)}
                                                    style={{
                                                        padding: '7px 10px',
                                                        borderRadius: 6,
                                                        border: 'none',
                                                        background: '#0EA5E9',
                                                        color: '#fff',
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Save
                                                </button>

                                                <button
                                                    onClick={() => handleRemoveField(field.fieldKey)}
                                                    style={{
                                                        padding: '7px 10px',
                                                        borderRadius: 6,
                                                        border: '1px solid #DC2626',
                                                        background: 'transparent',
                                                        color: '#DC2626',
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        </Layout>
    );
}

