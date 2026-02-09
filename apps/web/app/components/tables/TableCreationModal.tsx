'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Segment } from '@/app/lib/api/baselines';
import { CreateTablePayload } from '@/app/lib/api/tables';

interface TableCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (payload: CreateTablePayload) => Promise<void>;
    selectedSegments: Segment[];
}

interface DetectedCell {
    text: string;
    confidence: number;
    segments: Segment[];
}

interface DetectedGrid {
    rows: DetectedCell[][];
    rowCount: number;
    columnCount: number;
}

export default function TableCreationModal({
    isOpen,
    onClose,
    onCreate,
    selectedSegments,
}: TableCreationModalProps) {
    const [mode, setMode] = useState<'auto' | 'manual'>('auto');
    const [rowCount, setRowCount] = useState<number>(1);
    const [columnCount, setColumnCount] = useState<number>(1);
    const [tableLabel, setTableLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Heuristics and grid detection
    const detectedGrid = useMemo<DetectedGrid | null>(() => {
        if (selectedSegments.length === 0) return null;

        const segmentsWithBox = selectedSegments.filter(s => {
            const box = s.boundingBox;
            return box && typeof box.x === 'number' && typeof box.y === 'number' && typeof box.width === 'number' && typeof box.height === 'number';
        });

        if (segmentsWithBox.length === 0) return null;

        // 1. Calculate medians
        const heights = segmentsWithBox.map(s => s.boundingBox.height);
        const sortedHeights = [...heights].sort((a, b) => a - b);
        const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)];

        const charWidths = segmentsWithBox.map(s => s.boundingBox.width / (s.text.length || 1));
        const sortedCharWidths = [...charWidths].sort((a, b) => a - b);
        const medianCharWidth = sortedCharWidths[Math.floor(sortedCharWidths.length / 2)];

        // 2. Group into lines (rows)
        // Sort by Y center and cluster by line center to avoid collapsing distinct rows
        const sortedByCenterY = [...segmentsWithBox].sort((a, b) => {
            const aCenter = a.boundingBox.y + a.boundingBox.height / 2;
            const bCenter = b.boundingBox.y + b.boundingBox.height / 2;
            return aCenter - bCenter;
        });
        const lines: Segment[][] = [];
        const lineCenters: number[] = [];
        const lineThreshold = medianHeight * 0.6;

        for (const seg of sortedByCenterY) {
            const centerY = seg.boundingBox.y + seg.boundingBox.height / 2;
            if (lines.length === 0) {
                lines.push([seg]);
                lineCenters.push(centerY);
                continue;
            }
            const lastIndex = lines.length - 1;
            const lastCenter = lineCenters[lastIndex];
            if (Math.abs(centerY - lastCenter) <= lineThreshold) {
                lines[lastIndex].push(seg);
                // Update line center with a running average for stability
                lineCenters[lastIndex] = (lastCenter * (lines[lastIndex].length - 1) + centerY) / lines[lastIndex].length;
            } else {
                lines.push([seg]);
                lineCenters.push(centerY);
            }
        }

        // 3. Within each line, group into cells (columns)
        const gridRows: DetectedCell[][] = [];
        let maxCols = 0;

        for (const line of lines) {
            const sortedByX = [...line].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
            const rowCells: DetectedCell[] = [];

            if (sortedByX.length > 0) {
                let currentCellSegments: Segment[] = [sortedByX[0]];
                for (let i = 1; i < sortedByX.length; i++) {
                    const prev = sortedByX[i - 1];
                    const curr = sortedByX[i];
                    const horizontalGap = curr.boundingBox.x - (prev.boundingBox.x + prev.boundingBox.width);

                    // If gap is significant (> 3x median char width), it's a new column
                    if (horizontalGap > (medianCharWidth * 3)) {
                        rowCells.push({
                            text: currentCellSegments.map(s => s.text).join(' '),
                            confidence: currentCellSegments.reduce((acc, s) => acc + (parseFloat(s.confidence || '0')), 0) / currentCellSegments.length,
                            segments: currentCellSegments
                        });
                        currentCellSegments = [curr];
                    } else {
                        currentCellSegments.push(curr);
                    }
                }
                rowCells.push({
                    text: currentCellSegments.map(s => s.text).join(' '),
                    confidence: currentCellSegments.reduce((acc, s) => acc + (parseFloat(s.confidence || '0')), 0) / currentCellSegments.length,
                    segments: currentCellSegments
                });
            }
            gridRows.push(rowCells);
            maxCols = Math.max(maxCols, rowCells.length);
        }

        return {
            rows: gridRows,
            rowCount: gridRows.length,
            columnCount: maxCols
        };
    }, [selectedSegments]);

    useEffect(() => {
        if (mode === 'auto' && detectedGrid) {
            setRowCount(detectedGrid.rowCount);
            setColumnCount(detectedGrid.columnCount);
        }
    }, [mode, detectedGrid]);

    if (!isOpen) return null;

    const handleCreate = async () => {
        setError(null);
        setIsSubmitting(true);
        try {
            const payload: CreateTablePayload = {
                rowCount,
                columnCount,
                tableLabel: tableLabel.trim() || undefined,
            };

            if (mode === 'auto' && detectedGrid) {
                const cellValues: (string | null)[][] = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => null));
                detectedGrid.rows.forEach((row, ri) => {
                    row.forEach((cell, ci) => {
                        if (ri < rowCount && ci < columnCount) {
                            cellValues[ri][ci] = cell.text;
                        }
                    });
                });
                payload.cellValues = cellValues;
            }

            await onCreate(payload);
            setTableLabel('');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create table');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isAutoDisabled = selectedSegments.length === 0;

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, padding: 20,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#ffffff', borderRadius: 24, width: '100%', maxWidth: 800,
                    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    animation: 'modalEnter 0.3s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ padding: '32px 32px 16px' }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                        Create Table
                    </h3>
                    <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
                        {selectedSegments.length} segments selected
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 4, padding: '0 32px', marginBottom: 20 }}>
                    <button
                        onClick={() => setMode('auto')}
                        disabled={isAutoDisabled}
                        style={{
                            padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                            background: mode === 'auto' ? '#eff6ff' : 'transparent',
                            color: mode === 'auto' ? '#2563eb' : '#64748b',
                            border: 'none', cursor: isAutoDisabled ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Option A: Auto-detect
                    </button>
                    <button
                        onClick={() => setMode('manual')}
                        style={{
                            padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                            background: mode === 'manual' ? '#eff6ff' : 'transparent',
                            color: mode === 'manual' ? '#2563eb' : '#64748b',
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        Option B: Manual
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px' }}>
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                            Table Label (Optional)
                        </label>
                        <input
                            type="text"
                            value={tableLabel}
                            onChange={(e) => setTableLabel(e.target.value)}
                            placeholder="e.g. Line Items, Tax Table..."
                            style={{
                                width: '100%', padding: '10px 14px', borderRadius: 10,
                                border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                            }}
                        />
                    </div>

                    {mode === 'manual' ? (
                        <div style={{ display: 'flex', gap: 20 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                                    Rows
                                </label>
                                <input
                                    type="number"
                                    min={1} max={1000}
                                    value={rowCount}
                                    onChange={(e) => setRowCount(parseInt(e.target.value) || 1)}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: 10,
                                        border: '1px solid #e2e8f0', fontSize: 14,
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                                    Columns
                                </label>
                                <input
                                    type="number"
                                    min={1} max={50}
                                    value={columnCount}
                                    onChange={(e) => setColumnCount(parseInt(e.target.value) || 1)}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: 10,
                                        border: '1px solid #e2e8f0', fontSize: 14,
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            {detectedGrid ? (
                                <>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        marginBottom: 12, padding: '12px 16px', background: '#f8fafc',
                                        borderRadius: 12, border: '1px solid #e2e8f0'
                                    }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>
                                            Detection Summary: {detectedGrid.rowCount} rows × {detectedGrid.columnCount} columns
                                        </span>
                                    </div>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                        {Array.from({ length: detectedGrid.columnCount }).map((_, i) => (
                                                            <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', borderRight: '1px solid #f1f5f9' }}>
                                                                Col {i + 1}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detectedGrid.rows.map((row, ri) => (
                                                        <tr key={ri} style={{ borderBottom: ri === detectedGrid.rows.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                            {Array.from({ length: detectedGrid.columnCount }).map((_, ci) => {
                                                                const cell = row[ci];
                                                                const confidence = cell?.confidence ?? 0;
                                                                const isLowConf = confidence < 0.7;
                                                                return (
                                                                    <td
                                                                        key={ci}
                                                                        style={{
                                                                            padding: '8px 12px',
                                                                            color: cell ? '#1e293b' : '#94a3b8',
                                                                            borderRight: '1px solid #f1f5f9',
                                                                            border: cell ? `1px solid ${isLowConf ? '#fee2e2' : '#dcfce7'}` : undefined,
                                                                            background: cell ? (isLowConf ? '#fffafb' : '#fafffa') : 'transparent',
                                                                            minWidth: 100,
                                                                            maxWidth: 200,
                                                                            whiteSpace: 'nowrap',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis'
                                                                        }}
                                                                        title={cell?.text}
                                                                    >
                                                                        {cell?.text || ''}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid #dcfce7', background: '#fafffa' }}></div>
                                            <span style={{ fontSize: 12, color: '#64748b' }}>High Confidence</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid #fee2e2', background: '#fffafb' }}></div>
                                            <span style={{ fontSize: 12, color: '#64748b' }}>Low Confidence (&lt; 0.7)</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                                    Could not automatically detect table structure from selection.
                                    Try selecting segments with clear horizontal and vertical alignment.
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div style={{ marginTop: 20, padding: '12px 16px', background: '#fee2e2', borderRadius: 12, border: '1px solid #fecaca', color: '#b91c1c', fontSize: 14 }}>
                            {error}
                        </div>
                    )}
                </div>

                <div style={{ padding: '24px 32px 32px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        style={{
                            padding: '12px 24px', borderRadius: 12, background: '#f1f5f9',
                            border: 'none', color: '#475569', fontSize: 14, fontWeight: 700,
                            cursor: 'pointer', transition: 'background 0.2s',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isSubmitting}
                        style={{
                            padding: '12px 32px', borderRadius: 12, background: '#2563eb',
                            border: 'none', color: '#ffffff', fontSize: 14, fontWeight: 700,
                            cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)',
                            transition: 'all 0.2s',
                            opacity: isSubmitting ? 0.7 : 1,
                        }}
                    >
                        {isSubmitting ? 'Creating...' : 'Create Table'}
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes modalEnter {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}
