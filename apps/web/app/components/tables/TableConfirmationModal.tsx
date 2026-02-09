'use client';

import { useState } from 'react';
import { Table } from '@/app/lib/api/tables';

interface TableConfirmationModalProps {
    table: Table;
    errorCount: number;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
    isConfirming: boolean;
}

export default function TableConfirmationModal({
    table,
    errorCount,
    onConfirm,
    onCancel,
    isConfirming,
}: TableConfirmationModalProps) {
    const [agreed, setAgreed] = useState(false);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
        }}>
            <div style={{
                background: 'white',
                borderRadius: 24,
                width: '100%',
                maxWidth: 480,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden',
                animation: 'modalEnter 0.3s ease-out',
            }}>
                <div style={{ padding: '32px 32px 24px' }}>
                    <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: 16,
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        marginBottom: 24,
                    }}>
                        📋
                    </div>

                    <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0', letterSpacing: '-0.02em' }}>
                        Confirm Table Extraction
                    </h2>

                    <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.6, margin: '0 0 24px 0' }}>
                        You are about to confirm the structure and data for <strong>{table.tableLabel || `Table #${table.tableIndex + 1}`}</strong>.
                        Once confirmed, the table will be locked and cannot be edited.
                    </p>

                    <div style={{
                        background: '#f8fafc',
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 24,
                        border: '1px solid #e2e8f0',
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Structure</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{table.rowCount} rows × {table.columnCount} columns</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Errors</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: errorCount > 0 ? '#dc2626' : '#16a34a' }}>
                                    {errorCount === 0 ? 'Zero Errors' : `${errorCount} Errors Remaining`}
                                </div>
                            </div>
                        </div>
                    </div>

                    <label style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 16px',
                        background: agreed ? '#f0fdf4' : '#f8fafc',
                        border: `1px solid ${agreed ? '#bbf7d0' : '#e2e8f0'}`,
                        borderRadius: 12,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}>
                        <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            style={{ marginTop: 2 }}
                        />
                        <span style={{ fontSize: 14, color: '#1e293b', fontWeight: 500, lineHeight: 1.4 }}>
                            I have reviewed the table data and confirm that the field mappings and cell values are correct. I understand this action locks the table.
                        </span>
                    </label>
                </div>

                <div style={{
                    padding: '24px 32px 32px',
                    background: '#f8fafc',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: 12,
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1,
                            padding: '12px',
                            fontSize: 15,
                            fontWeight: 600,
                            color: '#475569',
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: 12,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                        onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                    >
                        Go Back
                    </button>
                    <button
                        disabled={!agreed || isConfirming || errorCount > 0}
                        onClick={onConfirm}
                        style={{
                            flex: 1,
                            padding: '12px',
                            fontSize: 15,
                            fontWeight: 700,
                            color: 'white',
                            background: (!agreed || errorCount > 0) ? '#cbd5e1' : '#3b82f6',
                            border: 'none',
                            borderRadius: 12,
                            cursor: (!agreed || errorCount > 0) ? 'not-allowed' : 'pointer',
                            boxShadow: (!agreed || errorCount > 0) ? 'none' : '0 4px 6px -1px rgba(59, 130, 246, 0.2)',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {isConfirming ? 'Confirming...' : 'Confirm Table'}
                    </button>
                </div>
            </div>

            <style jsx>{`
        @keyframes modalEnter {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
        </div>
    );
}
