'use client';

import type React from 'react';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
    RowSelectionState,
} from '@tanstack/react-table';
import { Table, Cell, ColumnMapping, updateCell, deleteRow, assignColumn, confirmTable } from '@/app/lib/api/tables';
import { Field, FieldCharacterType } from '@/app/lib/api/fields';
import { useToast } from '../ToastProvider';
import CorrectionReasonModal from '../ocr/CorrectionReasonModal';
import TableConfirmationModal from './TableConfirmationModal';

interface TableEditorPanelProps {
    table: Table;
    cells: Cell[][];
    columnMappings: ColumnMapping[];
    fields: Field[];
    isReadOnly: boolean;
    onRefresh: () => Promise<void>;
    onClose: () => void;
}

const typeInputAttributes: Record<FieldCharacterType, { type: string; inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url'; step?: string; placeholder?: string }> = {
    varchar: { type: 'text' },
    int: { type: 'number', inputMode: 'numeric', step: '1' },
    decimal: { type: 'number', inputMode: 'decimal', step: '0.01' },
    currency: { type: 'text', inputMode: 'text', placeholder: 'USD' },
    date: { type: 'text', placeholder: 'YYYY-MM-DD' },
    email: { type: 'email', inputMode: 'email', placeholder: 'user@example.com' },
    phone: { type: 'tel', inputMode: 'tel', placeholder: '+1234567890' },
    url: { type: 'url', inputMode: 'url', placeholder: 'https://example.com' },
    percentage: { type: 'number', inputMode: 'decimal', step: '0.01', placeholder: '0-100' },
    boolean: { type: 'text', placeholder: 'true/false' },
};

type FieldMappingDropdownProps = {
    columnIndex: number;
    currentFieldKey?: string;
    fields: Field[];
    disabled?: boolean;
    onSelect: (value: string) => void;
    compact?: boolean;
};

function FieldMappingDropdown({ columnIndex, currentFieldKey, fields, disabled, onSelect, compact }: FieldMappingDropdownProps) {
    const [search, setSearch] = useState('');
    const filtered = useMemo(() => {
        const term = search.toLowerCase();
        const base = fields.filter(f =>
            f.fieldKey.toLowerCase().includes(term) ||
            f.label.toLowerCase().includes(term) ||
            f.characterType.toLowerCase().includes(term)
        );
        if (currentFieldKey && !base.some(f => f.fieldKey === currentFieldKey)) {
            const current = fields.find(f => f.fieldKey === currentFieldKey);
            if (current) base.unshift(current);
        }
        return base;
    }, [fields, search, currentFieldKey]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={disabled}
                placeholder="Search fields..."
                style={{
                    width: '100%',
                    padding: compact ? '6px 10px' : '8px 10px',
                    fontSize: compact ? 12 : 13,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: disabled ? '#f8fafc' : 'white',
                    outline: 'none',
                }}
            />
            <select
                value={currentFieldKey || ''}
                onChange={(e) => onSelect(e.target.value)}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: compact ? '6px 10px' : '8px 10px',
                    fontSize: compact ? 12 : 13,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: disabled ? '#f8fafc' : 'white',
                    outline: 'none',
                }}
            >
                <option value="">Unmapped</option>
                {filtered.map(f => (
                    <option key={f.fieldKey} value={f.fieldKey}>{`${f.label} (${f.characterType})`}</option>
                ))}
            </select>
        </div>
    );
}

export default function TableEditorPanel({
    table,
    cells,
    columnMappings,
    fields,
    isReadOnly,
    onRefresh,
    onClose,
}: TableEditorPanelProps) {
    const { showToast } = useToast();
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [editingCell, setEditingCell] = useState<{ rowIndex: number; columnIndex: number; value: string } | null>(null);
    const [correctionModal, setCorrectionModal] = useState<{ rowIndex: number; columnIndex: number; value: string } | null>(null);
    const [deleteRowModal, setDeleteRowModal] = useState<{ rowIndex: number } | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
    const [showErrorsOnly, setShowErrorsOnly] = useState(false);
    const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; columnIndex: number } | null>(null);
    const [focusedColumnIndex, setFocusedColumnIndex] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: 50 });
    const ROW_HEIGHT = 40;

    const columnHelper = createColumnHelper<Cell[]>();

    const mappingMap = useMemo(() => {
        const map: Record<number, string> = {};
        columnMappings.forEach(m => {
            map[m.columnIndex] = m.fieldKey;
        });
        return map;
    }, [columnMappings]);

    const fieldMap = useMemo(() => {
        const map: Record<string, Field> = {};
        fields.forEach(f => {
            map[f.fieldKey] = f;
        });
        return map;
    }, [fields]);

    const errorCount = useMemo(() => {
        let count = 0;
        cells.forEach(row => {
            row.forEach(cell => {
                if (cell.validationStatus === 'invalid') count++;
            });
        });
        return count;
    }, [cells]);

    const filteredData = useMemo(() => {
        if (!showErrorsOnly) return cells;
        return cells.filter(row => row.some(cell => cell.validationStatus === 'invalid'));
    }, [cells, showErrorsOnly]);

    const totalRows = filteredData.length;

    const columns = useMemo(() => {
        const cols = [];

        // Checkbox column
        cols.push(
            columnHelper.display({
                id: 'select',
                header: ({ table }) => (
                    <input
                        type="checkbox"
                        checked={table.getIsAllRowsSelected()}
                        onChange={table.getToggleAllRowsSelectedHandler()}
                        style={{ cursor: 'pointer' }}
                    />
                ),
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        style={{ cursor: 'pointer' }}
                    />
                ),
                size: 40,
            })
        );

        // Index column
        cols.push(
            columnHelper.display({
                id: 'index',
                header: '#',
                cell: info => info.row.index + 1,
                size: 50,
            })
        );

        // Data columns
        for (let i = 0; i < table.columnCount; i++) {
            const fieldKey = mappingMap[i];
            const field = fieldKey ? fieldMap[fieldKey] : null;

            cols.push(
                columnHelper.accessor(row => row[i], {
                    id: `col-${i}`,
                    header: () => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>COLUMN {i + 1}</div>
                            <FieldMappingDropdown
                                columnIndex={i}
                                currentFieldKey={fieldKey}
                                fields={fields}
                                disabled={isReadOnly || table.status === 'confirmed'}
                                onSelect={value => handleMapColumn(i, value)}
                            />
                            {field && (
                                <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 500 }}>
                                    TYPE: {field.characterType.toUpperCase()}
                                </div>
                            )}
                        </div>
                    ),
                    cell: info => {
                        const cell = info.getValue() as Cell;
                        const isEditing = editingCell?.rowIndex === cell.rowIndex && editingCell?.columnIndex === cell.columnIndex;
                        const value = isEditing ? editingCell.value : (cell.cellValue || '');
                        const fieldKey = mappingMap[cell.columnIndex];
                        const field = fieldKey ? fieldMap[fieldKey] : null;
                        const inputAttrs = field ? (typeInputAttributes[field.characterType] || typeInputAttributes.varchar) : typeInputAttributes.varchar;

                        if (isEditing) {
                            return (
                                <div style={{ position: 'relative' }}>
                                    <input
                                        autoFocus
                                        value={value}
                                        type={inputAttrs.type}
                                        onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                        onBlur={() => handleCellSave(cell.rowIndex, cell.columnIndex, value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellSave(cell.rowIndex, cell.columnIndex, value);
                                            if (e.key === 'Escape') setEditingCell(null);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '4px 8px',
                                            fontSize: 13,
                                            border: '2px solid #3b82f6',
                                            borderRadius: 4,
                                            outline: 'none',
                                        }}
                                    />
                                </div>
                            );
                        }

                        const isFocused = focusedCell?.rowIndex === info.row.index && focusedCell?.columnIndex === i;

                        return (
                            <div
                                tabIndex={0}
                                onFocus={() => {
                                    setFocusedCell({ rowIndex: info.row.index, columnIndex: i });
                                    setFocusedColumnIndex(i);
                                }}
                                onClick={() => {
                                    if (!isReadOnly && table.status !== 'confirmed') {
                                        setEditingCell({ rowIndex: cell.rowIndex, columnIndex: cell.columnIndex, value: cell.cellValue || '' });
                                    }
                                }}
                                title={cell.errorText || undefined}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: 13,
                                    minHeight: 32,
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: (isReadOnly || table.status === 'confirmed') ? 'default' : 'text',
                                    background: cell.validationStatus === 'invalid' ? '#fee2e2' : 'transparent',
                                    border: isFocused ? '2px solid #3b82f6' : (cell.validationStatus === 'invalid' ? '1px solid #ef4444' : '1px solid transparent'),
                                    borderRadius: 4,
                                    position: 'relative',
                                    outline: 'none',
                                    boxShadow: isFocused ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
                                }}
                            >
                                <span style={{ color: cell.cellValue ? '#1e293b' : '#94a3b8' }}>
                                    {cell.cellValue || (isReadOnly ? '' : 'Empty')}
                                </span>
                                {cell.validationStatus === 'invalid' && (
                                    <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 14 }} title={cell.errorText || 'Invalid value'}>⚠️</span>
                                )}
                                {cell.validationStatus === 'valid' && (
                                    <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 14 }}>✓</span>
                                )}
                            </div>
                        );
                    },
                })
            );
        }

        return cols;
    }, [table, columnMappings, fields, mappingMap, fieldMap, isReadOnly, editingCell, onRefresh, showToast]);

    const reactTable = useReactTable({
        data: filteredData,
        columns,
        state: {
            rowSelection,
        },
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        enableRowSelection: true,
    });

    const colCount = columns.length;

    const handleCellSave = async (rowIndex: number, columnIndex: number, value: string, reason?: string) => {
        const originalCell = cells[rowIndex][columnIndex];
        if (originalCell.cellValue === value && !reason) {
            setEditingCell(null);
            return;
        }

        try {
            await updateCell(table.id, rowIndex, columnIndex, value, reason);
            setEditingCell(null);
            onRefresh();
        } catch (err: any) {
            if (err.status === 409) {
                setCorrectionModal({ rowIndex, columnIndex, value });
            } else {
                showToast(err.message || 'Failed to update cell', 'error');
            }
        }
    };

    const handleDeleteSelected = async (reason: string) => {
        const selectedRows = Object.keys(rowSelection)
            .map(idx => parseInt(idx, 10))
            .sort((a, b) => b - a); // Delete from bottom up

        if (selectedRows.length === 0) return;

        try {
            for (const idx of selectedRows) {
                await deleteRow(table.id, filteredData[idx][0].rowIndex, reason);
            }
            setRowSelection({});
            setDeleteRowModal(null);
            showToast(`Deleted ${selectedRows.length} rows`, 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.message || 'Failed to delete rows', 'error');
        }
    };

    const handleTriggerConfirm = () => {
        if (errorCount > 0) {
            showToast('Cannot confirm table with validation errors', 'error');
            return;
        }
        setConfirmationModalOpen(true);
    };

    const handleFinalConfirm = async () => {
        setIsConfirming(true);
        try {
            await confirmTable(table.id);
            showToast('Table confirmed successfully', 'success');
            setConfirmationModalOpen(false);
            onRefresh();
        } catch (err: any) {
            showToast(err.message || 'Failed to confirm table', 'error');
        } finally {
            setIsConfirming(false);
        }
    };

    const handleExportCSV = () => {
        try {
            const headerRow = [];
            for (let i = 0; i < table.columnCount; i++) {
                const mapping = columnMappings.find(m => m.columnIndex === i);
                let label = `Column ${i + 1}`;
                if (mapping) {
                    const field = fields.find(f => f.fieldKey === mapping.fieldKey);
                    label = field ? field.label : mapping.fieldKey;
                }
                // Escape quotes in header if needed
                if (label.includes('"') || label.includes(',') || label.includes('\n')) {
                    label = `"${label.replace(/"/g, '""')}"`;
                }
                headerRow.push(label);
            }

            const dataRows = [];
            // Cells are Cell[][]
            for (let r = 0; r < table.rowCount; r++) {
                const rowValues = [];
                for (let c = 0; c < table.columnCount; c++) {
                    const cell = cells[r][c];
                    let val = cell.cellValue || '';
                    if (val.search(/("|,|\n|\r)/g) >= 0) {
                        val = `"${val.replace(/"/g, '""')}"`;
                    }
                    rowValues.push(val);
                }
                dataRows.push(rowValues.join(','));
            }

            const csvContent = [headerRow.join(','), ...dataRows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const label = (table.tableLabel || `Table_${table.tableIndex + 1}`).replace(/[^a-z0-9]/gi, '_');
            link.setAttribute('download', `${table.baselineId}_${label}_${timestamp}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e: any) {
            showToast('Failed to export CSV', 'error');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (editingCell) return;
        if (!focusedCell) return;

        const { rowIndex, columnIndex } = focusedCell;
        const maxRow = filteredData.length - 1;
        const maxCol = table.columnCount - 1;

        switch (e.key) {
            case 'ArrowUp':
                setFocusedCell({ rowIndex: Math.max(0, rowIndex - 1), columnIndex });
                e.preventDefault();
                break;
            case 'ArrowDown':
                setFocusedCell({ rowIndex: Math.min(maxRow, rowIndex + 1), columnIndex });
                e.preventDefault();
                break;
            case 'ArrowLeft':
                setFocusedCell({ rowIndex, columnIndex: Math.max(0, columnIndex - 1) });
                setFocusedColumnIndex(Math.max(0, columnIndex - 1));
                e.preventDefault();
                break;
            case 'ArrowRight':
                setFocusedCell({ rowIndex, columnIndex: Math.min(maxCol, columnIndex + 1) });
                setFocusedColumnIndex(Math.min(maxCol, columnIndex + 1));
                e.preventDefault();
                break;
            case 'Enter':
                const cell = filteredData[rowIndex][columnIndex];
                if (!isReadOnly && table.status !== 'confirmed') {
                    setEditingCell({ rowIndex: cell.rowIndex, columnIndex: cell.columnIndex, value: cell.cellValue || '' });
                }
                setFocusedColumnIndex(columnIndex);
                e.preventDefault();
                break;
        }
    };

    useEffect(() => {
        if (focusedCell) {
            const selector = `tr[data-row-index="${focusedCell.rowIndex}"] td:nth-child(${focusedCell.columnIndex + 3}) div[tabindex="0"]`;
            const el = document.querySelector(selector) as HTMLElement;
            el?.focus();
        }
    }, [focusedCell]);

    // Keep focused cell in bounds if filters change
    useEffect(() => {
        if (focusedCell && focusedCell.rowIndex >= totalRows) {
            setFocusedCell(null);
            setFocusedColumnIndex(null);
        }
    }, [focusedCell, totalRows]);

    const handleMapColumn = async (columnIndex: number, value: string) => {
        try {
            await assignColumn(table.id, columnIndex, value);
            showToast('Column mapped successfully', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.message || 'Failed to map column', 'error');
        }
    };

    const handleScroll = useCallback(() => {
        const container = scrollRef.current;
        if (!container) return;
        const scrollTop = container.scrollTop;
        const clientHeight = container.clientHeight || 0;
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
        const visible = Math.ceil(clientHeight / ROW_HEIGHT) + 10;
        const end = Math.min(totalRows, start + visible);
        setVisibleRange({ start, end });
    }, [ROW_HEIGHT, totalRows]);

    useEffect(() => {
        handleScroll();
    }, [handleScroll, totalRows]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
            {/* Header / Toolbar */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px',
                            borderRadius: '50%',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                        ←
                    </button>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                            {table.tableLabel || `Table #${table.tableIndex + 1}`}
                        </h2>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                            {table.rowCount} rows × {table.columnCount} columns
                        </div>
                        {table.status === 'confirmed' && (
                            <div style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: '#166534',
                                background: '#dcfce7',
                                padding: '2px 8px',
                                borderRadius: 4,
                                display: 'inline-block',
                                border: '1px solid #bbf7d0'
                            }}>
                                ✓ Table confirmed on {table.confirmedAt ? new Date(table.confirmedAt).toLocaleDateString() : 'Unknown Date'} by {table.confirmedByEmail || table.confirmedBy || 'Unknown User'}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    {Object.keys(rowSelection).length > 0 && !isReadOnly && table.status !== 'confirmed' && (
                        <button
                            onClick={() => setDeleteRowModal({ rowIndex: -1 })} // Multi-delete
                            style={{
                                padding: '8px 16px',
                                fontSize: 13,
                                fontWeight: 600,
                                borderRadius: 8,
                                border: '1px solid #fee2e2',
                                background: '#fef2f2',
                                color: '#dc2626',
                                cursor: 'pointer',
                            }}
                        >
                            Delete Selected ({Object.keys(rowSelection).length})
                        </button>
                    )}

                    {table.status === 'confirmed' && (
                        <button
                            onClick={handleExportCSV}
                            style={{
                                padding: '8px 16px',
                                fontSize: 13,
                                fontWeight: 600,
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                color: '#475569',
                                cursor: 'pointer',
                            }}
                        >
                            Export CSV
                        </button>
                    )}

                    {!isReadOnly && table.status !== 'confirmed' && (
                        <button
                            onClick={handleTriggerConfirm}
                            disabled={isConfirming || errorCount > 0}
                            style={{
                                padding: '8px 24px',
                                fontSize: 13,
                                fontWeight: 700,
                                borderRadius: 8,
                                border: 'none',
                                background: errorCount > 0 ? '#94a3b8' : '#3b82f6',
                                color: 'white',
                                cursor: errorCount > 0 ? 'not-allowed' : 'pointer',
                                boxShadow: errorCount > 0 ? 'none' : '0 4px 6px -1px rgba(59, 130, 246, 0.2)',
                            }}
                        >
                            Confirm Table
                        </button>
                    )}
                </div>
            </div>

            {/* Validation Banner */}
            <div style={{
                padding: '8px 24px',
                background: errorCount > 0 ? '#fff1f2' : '#f0fdf4',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: errorCount > 0 ? '#ef4444' : '#22c55e',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 11,
                    }}>
                        {errorCount} ERRORS
                    </span>
                    <span style={{ color: errorCount > 0 ? '#991b1b' : '#166534', fontWeight: 500 }}>
                        {errorCount > 0 ? 'Table has validation errors that must be resolved before confirmation.' : 'All cells valid. Table ready for confirmation.'}
                    </span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#475569', fontWeight: 500 }}>
                    <input
                        type="checkbox"
                        checked={showErrorsOnly}
                        onChange={(e) => setShowErrorsOnly(e.target.checked)}
                    />
                    Show errors only
                </label>
            </div>

            {/* Grid Container */}
            <div
                style={{ flex: 1, overflow: 'auto', padding: 24, background: '#f1f5f9' }}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                ref={scrollRef}
            >
                <div style={{
                    background: 'white',
                    borderRadius: 12,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    overflow: 'hidden',
                    minWidth: 'fit-content',
                }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                            {reactTable.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <th
                                            key={header.id}
                                            style={{
                                                padding: '12px 16px',
                                                background: '#f8fafc',
                                                borderBottom: '2px solid #e2e8f0',
                                                borderRight: '1px solid #e2e8f0',
                                                textAlign: 'left',
                                                verticalAlign: 'top',
                                            }}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {visibleRange.start > 0 && (
                                <tr style={{ height: visibleRange.start * ROW_HEIGHT }}>
                                    <td colSpan={colCount} />
                                </tr>
                            )}
                            {reactTable.getRowModel().rows.slice(visibleRange.start, visibleRange.end).map(row => (
                                <tr
                                    key={row.id}
                                    data-row-index={row.index}
                                    style={{
                                        height: ROW_HEIGHT,
                                        borderBottom: '1px solid #f1f5f9',
                                        background: row.getIsSelected() ? '#eff6ff' : 'transparent',
                                    }}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td
                                            key={cell.id}
                                            style={{
                                                padding: '4px 8px',
                                                borderRight: '1px solid #f1f5f9',
                                            }}
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {visibleRange.end < totalRows && (
                                <tr style={{ height: (totalRows - visibleRange.end) * ROW_HEIGHT }}>
                                    <td colSpan={colCount} />
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                            {showErrorsOnly ? 'No validation errors found.' : 'Table is empty.'}
                        </div>
                    )}
                </div>
            </div>

            {/* Column Mapping Toolbar */}
            <div style={{
                padding: '10px 16px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 13,
            }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Column Mapping</div>
                <div style={{ color: '#475569' }}>
                    {focusedColumnIndex !== null ? `Column ${focusedColumnIndex + 1}` : 'Select a cell to choose a column'}
                </div>
                <div style={{ minWidth: 220, flex: '0 0 260px' }}>
                    <FieldMappingDropdown
                        columnIndex={focusedColumnIndex ?? -1}
                        currentFieldKey={focusedColumnIndex !== null ? mappingMap[focusedColumnIndex] : undefined}
                        fields={fields}
                        disabled={isReadOnly || table.status === 'confirmed' || focusedColumnIndex === null}
                        onSelect={(value) => focusedColumnIndex !== null && handleMapColumn(focusedColumnIndex, value)}
                        compact
                    />
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: errorCount > 0 ? '#fee2e2' : '#dcfce7',
                        color: errorCount > 0 ? '#b91c1c' : '#166534',
                        fontWeight: 700,
                        fontSize: 11,
                    }}>
                        {errorCount} errors
                    </span>
                    <span style={{ color: '#64748b' }}>|</span>
                    <span style={{ color: '#475569' }}>Arrow keys to move • Enter to edit • Esc to cancel</span>
                </div>
            </div>

            {/* Modals */}
            {correctionModal && (
                <CorrectionReasonModal
                    isOpen={true}
                    title="Correction Reason Required"
                    message="Overwriting values requires a justification."
                    onConfirm={(reason: string) => handleCellSave(correctionModal.rowIndex, correctionModal.columnIndex, correctionModal.value, reason)}
                    onClose={() => setCorrectionModal(null)}
                />
            )}

            {deleteRowModal && (
                <CorrectionReasonModal
                    isOpen={true}
                    title={`Delete ${Object.keys(rowSelection).length || 1} Row(s)`}
                    message="Deleting rows requires a justification."
                    onConfirm={(reason: string) => handleDeleteSelected(reason)}
                    onClose={() => setDeleteRowModal(null)}
                />
            )}

            {confirmationModalOpen && (
                <TableConfirmationModal
                    table={table}
                    errorCount={errorCount}
                    onConfirm={handleFinalConfirm}
                    onCancel={() => setConfirmationModalOpen(false)}
                    isConfirming={isConfirming}
                />
            )}
        </div>
    );
}
