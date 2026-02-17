import React from 'react';
import { TableSuggestion } from '../../lib/api/tables';

interface TableSuggestionPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConvert: (suggestion: TableSuggestion) => void;
    suggestion: TableSuggestion | null;
    isConverting: boolean;
}

const TableSuggestionPreviewModal: React.FC<TableSuggestionPreviewModalProps> = ({
    isOpen,
    onClose,
    onConvert,
    suggestion,
    isConverting,
}) => {
    if (!isOpen || !suggestion) return null;

    const safeRowCount = Math.max(0, suggestion.rowCount);
    const safeColumnCount = Math.max(0, suggestion.columnCount);
    const columns = Array.from({ length: safeColumnCount });

    // Build grid from cellMapping
    const grid: string[][] = Array.from({ length: safeRowCount }, () =>
        Array(safeColumnCount).fill('')
    );

    if (Array.isArray(suggestion.cellMapping)) {
        suggestion.cellMapping.forEach((cell: any) => {
            const { rowIndex, columnIndex, text } = cell;
            if (
                rowIndex >= 0 &&
                rowIndex < safeRowCount &&
                columnIndex >= 0 &&
                columnIndex < safeColumnCount
            ) {
                grid[rowIndex][columnIndex] = text || '';
            }
        });
    }

    const confidencePercentage = Math.round(suggestion.confidence * 100);
    const confidenceColor =
        suggestion.confidence >= 0.8 ? '#166534' :
            suggestion.confidence >= 0.6 ? '#854d0e' : '#991b1b';
    const confidenceBg =
        suggestion.confidence >= 0.8 ? '#dcfce7' :
            suggestion.confidence >= 0.6 ? '#fef9c3' : '#fee2e2';

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 20,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: 16,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    width: '100%',
                    maxWidth: 900,
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '20px 24px',
                        borderBottom: '1px solid #e5e5e5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'linear-gradient(to right, #fafafa, #ffffff)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                            Suggested Table Preview
                        </h2>
                        <div
                            style={{
                                backgroundColor: confidenceBg,
                                color: confidenceColor,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                        >
                            {confidencePercentage}% Confidence
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: 24,
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            padding: 0,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            transition: 'background 0.2s',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                    >
                        x
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
                    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{suggestion.rowCount}</span> Rows
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{suggestion.columnCount}</span> Columns
                        </div>
                        {suggestion.suggestedLabel && (
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                Label: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{suggestion.suggestedLabel}</span>
                            </div>
                        )}
                    </div>

                    <div
                        style={{
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            overflow: 'hidden',
                            backgroundColor: '#ffffff',
                        }}
                    >
                        <table
                            style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: 13,
                                tableLayout: 'fixed',
                            }}
                        >
                            <thead>
                                <tr style={{ background: 'var(--surface-secondary)' }}>
                                    {columns.map((_, colIndex) => (
                                        <th
                                            key={colIndex}
                                            style={{
                                                padding: '10px 12px',
                                                textAlign: 'left',
                                                borderBottom: '1px solid #e5e5e5',
                                                borderRight: colIndex < columns.length - 1 ? '1px solid #f5f5f5' : 'none',
                                                color: 'var(--text-muted)',
                                                fontWeight: 600,
                                                fontSize: 11,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                            }}
                                        >
                                            Col {colIndex + 1}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {grid.map((row, rowIndex) => (
                                    <tr key={rowIndex} style={{ borderBottom: rowIndex < grid.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                                        {row.map((cell, colIndex) => (
                                            <td
                                                key={colIndex}
                                                style={{
                                                    padding: '12px',
                                                    borderRight: colIndex < row.length - 1 ? '1px solid #f5f5f5' : 'none',
                                                    color: cell ? '#262626' : '#d4d4d4',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                {cell || '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '16px 24px',
                        borderTop: '1px solid #e5e5e5',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 12,
                        background: 'var(--surface-secondary)',
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: '#ffffff',
                            color: '#262626',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.background = '#f5f5f5';
                            e.currentTarget.style.borderColor = '#d4d4d4';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.borderColor = '#e5e5e5';
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConvert(suggestion)}
                        disabled={isConverting}
                        style={{
                            padding: '10px 24px',
                            borderRadius: 10,
                            border: 'none',
                            background: 'linear-gradient(135deg, #E11D48 0%, #BE123C 100%)',
                            color: '#ffffff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: isConverting ? 'not-allowed' : 'pointer',
                            opacity: isConverting ? 0.7 : 1,
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}
                        onMouseOver={(e) => {
                            if (!isConverting) {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 6px 12px -1px rgba(37, 99, 235, 0.3)';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (!isConverting) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(37, 99, 235, 0.2)';
                            }
                        }}
                    >
                        {isConverting ? (
                            <>
                                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                Converting...
                            </>
                        ) : (
                            <>
                                <span></span>
                                Convert to Table
                            </>
                        )}
                    </button>
                </div>
            </div>
            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default TableSuggestionPreviewModal;
