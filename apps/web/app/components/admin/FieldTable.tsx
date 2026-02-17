'use client';

import type { Field, FieldStatus } from '../../lib/api/fields';

type FieldTableProps = {
    fields: Field[];
    loading: boolean;
    onEdit: (field: Field) => void;
    onHide: (field: Field) => void;
    onUnhide: (field: Field) => void;
    onArchive: (field: Field) => void;
};

export default function FieldTable({ fields, loading, onEdit, onHide, onUnhide, onArchive }: FieldTableProps) {
    const getStatusBadge = (status: FieldStatus) => {
        const styles = {
            active: { bg: '#dcfce7', color: '#166534', text: 'Active' },
            hidden: { bg: '#fef3c7', color: '#92400e', text: 'Hidden' },
            archived: { bg: '#f5f5f5', color: 'var(--text-secondary)', text: 'Archived' },
        };
        const style = styles[status];
        return (
            <span
                style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    background: style.bg,
                    color: style.color,
                }}
            >
                {style.text}
            </span>
        );
    };

    const getCharacterTypeDisplay = (type: string, limit: number | null) => {
        if (type === 'varchar' && limit) {
            return `varchar(${limit})`;
        }
        return type;
    };

    return (
        <div
            style={{
                background: 'var(--surface)',
                borderRadius: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'hidden',
            }}
        >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid #e5e5e5' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Field Key
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Label
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Character Type
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Version
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Status
                        </th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr>
                            <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                Loading fields...
                            </td>
                        </tr>
                    ) : fields.length === 0 ? (
                        <tr>
                            <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                No fields found
                            </td>
                        </tr>
                    ) : (
                        fields.map((field) => (
                            <tr key={field.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                                <td style={{ padding: '12px 16px', fontSize: 14, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                                    {field.fieldKey}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text-primary)' }}>{field.label}</td>
                                <td style={{ padding: '12px 16px', fontSize: 14, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                    {getCharacterTypeDisplay(field.characterType, field.characterLimit)}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: 14, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    v{field.version}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>{getStatusBadge(field.status)}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                        {field.status === 'active' && (
                                            <>
                                                <button
                                                    onClick={() => onEdit(field)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#eff6ff',
                                                        color: '#1e40af',
                                                        border: '1px solid #bfdbfe',
                                                        borderRadius: 4,
                                                        fontSize: 12,
                                                        cursor: 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => onHide(field)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#fef3c7',
                                                        color: '#92400e',
                                                        border: '1px solid #fde68a',
                                                        borderRadius: 4,
                                                        fontSize: 12,
                                                        cursor: 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Hide
                                                </button>
                                                <button
                                                    onClick={() => onArchive(field)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#fef2f2',
                                                        color: '#dc2626',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: 4,
                                                        fontSize: 12,
                                                        cursor: 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Archive
                                                </button>
                                            </>
                                        )}
                                        {field.status === 'hidden' && (
                                            <>
                                                <button
                                                    onClick={() => onEdit(field)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#eff6ff',
                                                        color: '#1e40af',
                                                        border: '1px solid #bfdbfe',
                                                        borderRadius: 4,
                                                        fontSize: 12,
                                                        cursor: 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => onUnhide(field)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#dcfce7',
                                                        color: '#166534',
                                                        border: '1px solid #bbf7d0',
                                                        borderRadius: 4,
                                                        fontSize: 12,
                                                        cursor: 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Unhide
                                                </button>
                                                <button
                                                    onClick={() => onArchive(field)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#fef2f2',
                                                        color: '#dc2626',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: 4,
                                                        fontSize: 12,
                                                        cursor: 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Archive
                                                </button>
                                            </>
                                        )}
                                        {field.status === 'archived' && (
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Read-only</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
