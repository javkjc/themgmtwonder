'use client';

import React, { useMemo } from 'react';
import type { Table } from '@/app/lib/api/tables';

interface TableListPanelProps {
    tables: Table[];
    activeTableId: string | null;
    onSelectTable: (tableId: string) => void;
    onDeleteTable: (table: Table) => void;
    onCreateTable: () => void;
    isReadOnly: boolean;
}

export default function TableListPanel({
    tables,
    activeTableId,
    onSelectTable,
    onDeleteTable,
    onCreateTable,
    isReadOnly,
}: TableListPanelProps) {

    const sortedTables = useMemo(() => {
        return [...tables].sort((a, b) => a.tableIndex - b.tableIndex);
    }, [tables]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
            {/* Header / Create Action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#475569' }}>Tables ({tables.length})</h3>
                {!isReadOnly && (
                    <button
                        onClick={onCreateTable}
                        style={{
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: '#ffffff',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                        }}
                    >
                        <span>➕</span> New
                    </button>
                )}
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                {sortedTables.length === 0 ? (
                    <div style={{
                        padding: 24,
                        textAlign: 'center',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px dashed #e2e8f0',
                        color: '#94a3b8',
                        fontSize: 13
                    }}>
                        No tables created yet.
                        {!isReadOnly && <div style={{ marginTop: 8 }}>Select text segments to create one.</div>}
                    </div>
                ) : (
                    sortedTables.map((table) => {
                        const isActive = activeTableId === table.id;
                        const isConfirmed = table.status === 'confirmed';
                        const isUtilized = !!table.baselineUtilizedAt;

                        return (
                            <div
                                key={table.id}
                                onClick={() => onSelectTable(table.id)}
                                style={{
                                    padding: '12px',
                                    borderRadius: 10,
                                    background: isActive ? '#eff6ff' : '#ffffff',
                                    border: isActive ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    boxShadow: isActive ? '0 4px 6px -1px rgba(59, 130, 246, 0.1)' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: isActive ? '#1e40af' : '#1e293b',
                                            marginBottom: 2
                                        }}>
                                            {table.tableLabel || `Table #${table.tableIndex + 1}`}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>
                                            {table.rowCount} rows × {table.columnCount} columns
                                        </div>
                                        {isUtilized && (
                                            <div style={{
                                                fontSize: 11,
                                                color: '#166534',
                                                marginTop: 4,
                                                fontStyle: 'italic'
                                            }}>
                                                Utilized {table.baselineUtilizedAt ? `on ${new Date(table.baselineUtilizedAt).toLocaleDateString()}` : ''}
                                            </div>
                                        )}
                                    </div>

                                    {isConfirmed ? (
                                        <span
                                            title={isUtilized
                                                ? `Baseline utilized${table.baselineUtilizedAt ? ` on ${new Date(table.baselineUtilizedAt).toLocaleString()}` : ''}`
                                                : "Confirmed"
                                            }
                                            style={{ fontSize: 14 }}
                                        >
                                            {isUtilized ? '🔒' : '✅'}
                                        </span>
                                    ) : (
                                        !isReadOnly && !isUtilized && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteTable(table);
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    padding: 4,
                                                    color: '#94a3b8',
                                                    fontSize: 14,
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.color = '#dc2626'}
                                                onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
                                                title="Delete table"
                                            >
                                                🗑️
                                            </button>
                                        )
                                    )}
                                </div>

                                {/* Status Badges */}
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {isConfirmed ? (
                                        <span style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            background: '#dcfce7',
                                            color: '#166534',
                                        }}>
                                            CONFIRMED
                                        </span>
                                    ) : (
                                        <span style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            background: '#fef9c3',
                                            color: '#854d0e',
                                        }}>
                                            DRAFT
                                        </span>
                                    )}

                                    {typeof table.errorCount === 'number' && table.errorCount > 0 && (
                                        <span style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            background: '#fee2e2',
                                            color: '#b91c1c',
                                        }}>
                                            ⚠️ {table.errorCount}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
