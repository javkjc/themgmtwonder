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
import { apiFetchJson } from '@/app/lib/api';
import { Field, FieldCharacterType } from '@/app/lib/api/fields';
import type { Notification } from '../NotificationToast';
import CorrectionReasonModal from '../ocr/CorrectionReasonModal';
import TableConfirmationModal from './TableConfirmationModal';

interface TableEditorPanelProps {
    table: Table;
    cells: Cell[][];
    columnMappings: ColumnMapping[];
    fields: Field[];
    isReadOnly: boolean;
    baselineStatus?: 'draft' | 'reviewed' | 'confirmed' | 'archived';
    onRefresh: () => Promise<void>;
    onClose: () => void;
    onNotification?: (notification: Notification) => void;
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
    baselineStatus,
    onRefresh,
    onClose,
    onNotification,
}: TableEditorPanelProps) {
    const showNotification = useCallback((message: string, type: 'success' | 'error') => {
        if (onNotification) {
            onNotification({
                id: Date.now().toString(),
                type,
                title: type === 'success' ? 'Success' : 'Error',
                message,
            });
        }
    }, [onNotification]);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [editingCell, setEditingCell] = useState<{ rowIndex: number; columnIndex: number; value: string } | null>(null);
    const [correctionModal, setCorrectionModal] = useState<{ rowIndex: number; columnIndex: number; value: string } | null>(null);
    const [mappingCorrectionModal, setMappingCorrectionModal] = useState<{ columnIndex: number; fieldKey: string } | null>(null);
    const [deleteRowModal, setDeleteRowModal] = useState<{ rowIndex: number } | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
    const [showErrorsOnly, setShowErrorsOnly] = useState(false);
    const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; columnIndex: number } | null>(null);
    const [focusedColumnIndex, setFocusedColumnIndex] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: 50 });
    const [recentlySavedCells, setRecentlySavedCells] = useState<Set<string>>(new Set());
    const [pendingFindKey, setPendingFindKey] = useState<{ visibleIndex: number } | null>(null);
    const [findHighlightRowIndex, setFindHighlightRowIndex] = useState<number | null>(null);
    const [pendingFindTarget, setPendingFindTarget] = useState<{ rowIndex: number; columnIndex: number } | null>(null);
    const [changeLogCollapsed, setChangeLogCollapsed] = useState(true);
    const [changeLogLoaded, setChangeLogLoaded] = useState(false);
    const [changeLog, setChangeLog] = useState<Array<{
        id: string;
        timestamp: number;
        label: string;
        detail?: string;
        target?: { rowIndex: number; columnIndex: number; cellId?: string; expectedValue?: string };
    }>>([]);
    const ROW_HEIGHT = 40;

    const columnHelper = createColumnHelper<Cell[]>();

    const mappingMap = useMemo(() => {
        const map: Record<number, string> = {};
        columnMappings.forEach(m => {
            map[m.columnIndex] = m.fieldKey;
        });
        return map;
    }, [columnMappings]);

    // Cast table to access utilization props injected by backend
    const extendedTable = table as (Table & {
        baselineUtilizedAt?: string;
        baselineUtilizationType?: string;
        baselineUtilizationMetadata?: any;
    });
    const isUtilized = !!extendedTable.baselineUtilizedAt;
    const utilizationMetadata = extendedTable.baselineUtilizationMetadata || {};
    const utilizationType = extendedTable.baselineUtilizationType;
    const requiresCorrectionReason = table.status === 'confirmed' || baselineStatus === 'reviewed';

    // Determine utilization message
    const utilizationMessage = useMemo(() => {
        if (!isUtilized) return null;

        const isThisTable = utilizationMetadata.tableId === table.id;
        const targetLabel = utilizationMetadata.tableLabel || (isThisTable ? (table.tableLabel || `Table #${table.tableIndex + 1}`) : 'Another Table');

        let action = 'utilized';
        if (utilizationType === 'record_created') {
            // Use rowCount from metadata for accuracy at time of utilization
            const count = utilizationMetadata.rowCount || 0;
            action = `used to create ${count} record${count === 1 ? '' : 's'}`;
        } else if (utilizationType === 'data_exported') {
            action = `exported as ${utilizationMetadata.exportFormat || 'file'}`;
        } else if (utilizationType === 'process_committed') {
            action = 'committed to process';
        }

        if (isThisTable) {
            return `Table '${targetLabel}' ${action}`;
        } else {
            return `Baseline locked: Table '${targetLabel}' ${action}`;
        }
    }, [isUtilized, utilizationMetadata, utilizationType, table]);

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

    const addChangeLogEntry = useCallback((entry: { label: string; detail?: string; target?: { rowIndex: number; columnIndex: number; cellId?: string } }) => {
        const record = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            label: entry.label,
            detail: entry.detail,
            target: entry.target,
        };
        console.log('[ChangeLog][Table]', record);
        setChangeLog(prev => [record, ...prev]);
    }, []);

    const filteredData = useMemo(() => {
        if (!showErrorsOnly) return cells;
        return cells.filter(row => row.some(cell => cell.validationStatus === 'invalid'));
    }, [cells, showErrorsOnly]);

    const totalRows = filteredData.length;
    const sortedChangeLog = useMemo(() => {
        return [...changeLog].sort((a, b) => b.timestamp - a.timestamp);
    }, [changeLog]);

    const cellIdMap = useMemo(() => {
        const map = new Map<string, { rowIndex: number; columnIndex: number }>();
        cells.forEach(row => {
            row.forEach(cell => {
                if (cell.id) {
                    map.set(cell.id, { rowIndex: cell.rowIndex, columnIndex: cell.columnIndex });
                }
            });
        });
        return map;
    }, [cells]);

    const tableRowIndexSet = useMemo(() => {
        const set = new Set<number>();
        cells.forEach(row => {
            const idx = row[0]?.rowIndex;
            if (Number.isFinite(idx)) set.add(idx as number);
        });
        return set;
    }, [cells]);

    useEffect(() => {
        let isMounted = true;
        const loadAuditHistory = async () => {
            try {
                const history = await apiFetchJson(
                    `/audit/resource/${table.id}?type=baseline_table&limit=200&offset=0`,
                    { method: 'GET' },
                );
                if (!isMounted || !Array.isArray(history)) return;
                const entries = history.map((item: any) => {
                    const details = item.details || {};
                    const action = item.action || '';
                    let label = action.replace('table.', 'Table ').replace(/\./g, ' ');
                    let detail = '';
                    let target: { rowIndex: number; columnIndex: number; cellId?: string; expectedValue?: string } | undefined;

                    if (action === 'table.cell.update') {
                        const row = Number(details.rowIndex);
                        const col = Number(details.columnIndex);
                        const before = details.previousValue ?? '';
                        const after = details.newValue ?? '';
                        label = `Cell R${row + 1}C${col + 1} updated`;
                        detail = `"${before}" → "${after}"`;
                        if (details.cellId) {
                            target = { rowIndex: row, columnIndex: col, cellId: details.cellId };
                        } else if (Number.isFinite(row) && Number.isFinite(col)) {
                            target = { rowIndex: row, columnIndex: col };
                        }
                    } else if (action === 'table.row.delete') {
                        const row = Number(details.rowIndex);
                        label = Number.isFinite(row) ? `Row ${row + 1} deleted` : 'Row deleted';
                        detail = details.reason ? `Reason: ${details.reason}` : '';
                    } else if (action === 'table.column.assign') {
                        const col = Number(details.columnIndex);
                        label = Number.isFinite(col) ? `Column ${col + 1} mapping updated` : 'Column mapping updated';
                        detail = details.fieldLabel || details.fieldKey ? `Mapped to ${details.fieldLabel || details.fieldKey}` : '';
                    } else if (action === 'table.confirm') {
                        label = 'Table confirmed';
                    } else if (action === 'table.create') {
                        label = 'Table created';
                    }

                    if (item.userEmail) {
                        detail = detail ? `${detail} · ${item.userEmail}` : `${item.userEmail}`;
                    }

                    return {
                        id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        timestamp: new Date(item.createdAt || Date.now()).getTime(),
                        label,
                        detail: detail || undefined,
                        target,
                    };
                });
                setChangeLog(entries);
                setChangeLogLoaded(true);
            } catch {
                const stored = localStorage.getItem(`table-change-log:${table.id}`);
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed)) {
                            setChangeLog(parsed);
                        }
                    } catch {
                        // Ignore invalid storage
                    }
                }
                setChangeLogLoaded(true);
            }
        };
        loadAuditHistory();
        return () => {
            isMounted = false;
        };
    }, [table.id]);

    useEffect(() => {
        if (!changeLogLoaded) return;
        localStorage.setItem(`table-change-log:${table.id}`, JSON.stringify(changeLog));
    }, [changeLog, table.id, changeLogLoaded]);

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
                        disabled={isReadOnly || isUtilized}
                        style={{ cursor: isReadOnly || isUtilized ? 'not-allowed' : 'pointer' }}
                    />
                ),
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        disabled={isReadOnly || isUtilized}
                        style={{ cursor: isReadOnly || isUtilized ? 'not-allowed' : 'pointer' }}
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
                                disabled={isReadOnly || isUtilized}
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
                        const cellKey = `${cell.rowIndex}-${cell.columnIndex}`;
                        const isRecentlySaved = recentlySavedCells.has(cellKey);

                        // Determine background color priority:
                        // 1. Invalid (red) - highest priority
                        // 2. Recently saved (bright green flash) - temporary
                        // 3. Was edited (subtle green) - persistent until table confirmed/reviewed
                        // 4. Transparent - default
                        let backgroundColor = 'transparent';
                        let borderColor = '1px solid transparent';
                        let boxShadow = 'none';

                        if (cell.validationStatus === 'invalid') {
                            backgroundColor = '#fee2e2';
                            borderColor = '1px solid #ef4444';
                        } else if (isRecentlySaved) {
                            // Bright green flash for just-saved cells
                            backgroundColor = '#dcfce7';
                            borderColor = '1px solid #86efac';
                            boxShadow = '0 0 0 2px rgba(134, 239, 172, 0.3)';
                        }

                        if (isFocused) {
                                borderColor = '2px solid #3b82f6';
                                boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)';
                        }

                        return (
                            <div
                                tabIndex={0}
                                onFocus={() => {
                                    setFocusedCell({ rowIndex: info.row.index, columnIndex: i });
                                    setFocusedColumnIndex(i);
                                }}
                                onClick={() => {
                                    if (!isReadOnly && !isUtilized) {
                                        setEditingCell({ rowIndex: cell.rowIndex, columnIndex: cell.columnIndex, value: cell.cellValue || '' });
                                    }
                                }}
                                title={cell.validationStatus === 'invalid' ? cell.errorText || 'Validation error' : undefined}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: 13,
                                    minHeight: 32,
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: (isReadOnly || isUtilized) ? 'default' : 'text',
                                    background: backgroundColor,
                                    border: borderColor,
                                    borderRadius: 4,
                                    position: 'relative',
                                    outline: 'none',
                                    boxShadow: boxShadow,
                                    transition: 'all 0.3s ease',
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
    }, [table, columnMappings, fields, mappingMap, fieldMap, isReadOnly, isUtilized, editingCell, onRefresh]);

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

            // Add to recently saved set for bright flash
            const cellKey = `${rowIndex}-${columnIndex}`;
            setRecentlySavedCells(prev => new Set(prev).add(cellKey));
            setTimeout(() => {
                setRecentlySavedCells(prev => {
                    const next = new Set(prev);
                    next.delete(cellKey);
                    return next;
                });
            }, 2000);

            const oldValue = originalCell.cellValue ?? '';
            const newValue = value ?? '';
            if (oldValue !== newValue) {
                addChangeLogEntry({
                    label: `Cell R${rowIndex + 1}C${columnIndex + 1} updated`,
                    detail: `"${oldValue}" → "${newValue}"`,
                    target: { rowIndex, columnIndex },
                });
            }

            onRefresh();
        } catch (err: any) {
            if (err.status === 409) {
                setCorrectionModal({ rowIndex, columnIndex, value });
            } else {
                showNotification(err.message || 'Failed to update cell', 'error');
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
            addChangeLogEntry({
                label: `Deleted ${selectedRows.length} row${selectedRows.length === 1 ? '' : 's'}`,
                detail: `Rows: ${selectedRows.map(r => r + 1).join(', ')}`,
            });
            showNotification(`Deleted ${selectedRows.length} rows`, 'success');
            onRefresh();
        } catch (err: any) {
            showNotification(err.message || 'Failed to delete rows', 'error');
        }
    };

    const handleTriggerConfirm = () => {
        if (errorCount > 0) {
            showNotification('Cannot confirm table with validation errors', 'error');
            return;
        }
        setConfirmationModalOpen(true);
    };

    const handleFinalConfirm = async () => {
        setIsConfirming(true);
        try {
            await confirmTable(table.id);
            showNotification('Table confirmed successfully', 'success');
            setConfirmationModalOpen(false);
            onRefresh();
        } catch (err: any) {
            showNotification(err.message || 'Failed to confirm table', 'error');
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
            showNotification('Failed to export CSV', 'error');
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
                if (!isReadOnly && !isUtilized) {
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

    const handleMapColumn = async (columnIndex: number, value: string, reason?: string) => {
        if (requiresCorrectionReason && !reason) {
            setMappingCorrectionModal({ columnIndex, fieldKey: value });
            return;
        }
        try {
            await assignColumn(table.id, columnIndex, value, reason);
            addChangeLogEntry({
                label: `Column ${columnIndex + 1} mapping updated`,
                detail: value ? `Mapped to ${value}` : 'Unmapped',
            });
            showNotification('Column mapped successfully', 'success');
            onRefresh();
        } catch (err: any) {
            if (err.status === 409) {
                setMappingCorrectionModal({ columnIndex, fieldKey: value });
                return;
            }
            showNotification(err.message || 'Failed to map column', 'error');
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
        if (!pendingFindTarget) return;
        const { rowIndex, columnIndex } = pendingFindTarget;
        const visibleIndex = filteredData.findIndex(row => row[0]?.rowIndex === rowIndex);
        const resolvedIndex = visibleIndex >= 0 ? visibleIndex : rowIndex;
        const container = scrollRef.current;
        const clientHeight = container?.clientHeight || 0;
        const visible = Math.ceil(clientHeight / ROW_HEIGHT) + 20;
        const start = Math.max(0, resolvedIndex - 5);
        const end = Math.min(totalRows, start + visible);
        setVisibleRange({ start, end });
        const scrollTarget = Math.max(0, resolvedIndex) * ROW_HEIGHT;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = Math.max(0, scrollTarget - 120);
        }
        handleScroll();
        setFocusedCell({ rowIndex: Math.max(0, resolvedIndex), columnIndex });
        setFocusedColumnIndex(columnIndex);

        const focusTarget = () => {
            const selector = `tr[data-row-index="${Math.max(0, resolvedIndex)}"] td:nth-child(${columnIndex + 3}) div[tabindex="0"]`;
            const el = document.querySelector(selector) as HTMLElement | null;
            el?.focus();
        };
        requestAnimationFrame(() => {
            focusTarget();
            setTimeout(() => focusTarget(), 50);
        });

        setPendingFindKey({ visibleIndex: Math.max(0, resolvedIndex) });
        setPendingFindTarget(null);
    }, [filteredData, pendingFindTarget, handleScroll]);

    useEffect(() => {
        handleScroll();
    }, [handleScroll, totalRows]);

    useEffect(() => {
        if (!pendingFindKey) return;
        const { visibleIndex } = pendingFindKey;
        const inRange = visibleIndex >= visibleRange.start && visibleIndex < visibleRange.end;
        if (!inRange) return;
        setFindHighlightRowIndex(visibleIndex);
        setTimeout(() => setFindHighlightRowIndex(null), 8000);
        setPendingFindKey(null);
    }, [pendingFindKey, visibleRange]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
            {/* Header / Toolbar */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button
                        onClick={onClose}
                        title="Back to table list"
                        style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            background: 'white',
                            cursor: 'pointer',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 16,
                            fontWeight: 600,
                            gap: 6,
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                        }}
                        onMouseOver={e => {
                            e.currentTarget.style.background = '#f1f5f9';
                            e.currentTarget.style.borderColor = '#94a3b8';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.background = 'white';
                            e.currentTarget.style.borderColor = '#cbd5e1';
                        }}
                    >
                        ← <span style={{ fontSize: 13 }}>Back</span>
                    </button>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                            {table.tableLabel || `Table #${table.tableIndex + 1}`}
                        </h2>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                            {table.rowCount} rows × {table.columnCount} columns
                        </div>
                        {isUtilized ? (
                            <div style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: '#7f1d1d',
                                background: '#fecaca',
                                padding: '2px 8px',
                                borderRadius: 4,
                                display: 'inline-block',
                                border: '1px solid #f87171'
                            }}>
                                🔒 {utilizationMessage}
                            </div>
                        ) : table.status === 'confirmed' && (
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
                    {Object.keys(rowSelection).length > 0 && !isReadOnly && !isUtilized && (
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

                    {!isReadOnly && table.status !== 'confirmed' && !isUtilized && (
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

            {/* Validation Banner or Utilization Banner */}
            {isUtilized ? (
                <div style={{
                    padding: '8px 24px',
                    background: '#fff7ed', // Orange/Amber background
                    borderBottom: '1px solid #fed7aa',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 13,
                    color: '#9a3412',
                }}>
                    <span style={{ fontSize: 16 }}>🔒</span>
                    <strong>Baseline Locked</strong>
                    <span>{utilizationMessage}</span>
                </div>
            ) : (
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
            )}

            {/* Grid + Change Log */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
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
                                            background: findHighlightRowIndex === row.index
                                                ? '#fff7ed'
                                                : row.getIsSelected()
                                                    ? '#eff6ff'
                                                    : 'transparent',
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
                    </div>
                </div>
                <div style={{ position: 'absolute', top: 12, right: 24, bottom: 72, zIndex: 30 }}>
                    {changeLogCollapsed ? (
                        <button
                            onClick={() => setChangeLogCollapsed(false)}
                            title="Open change log"
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                cursor: 'pointer',
                                color: '#475569',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
                                fontSize: 16,
                                fontWeight: 700,
                            }}
                        >
                            ›
                        </button>
                    ) : (
                        <div
                            style={{
                                width: 292,
                                height: '100%',
                                border: '1px solid #e2e8f0',
                                background: '#f8fafc',
                                display: 'flex',
                                flexDirection: 'column',
                                borderRadius: 12,
                                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{
                                padding: '10px 12px',
                                borderBottom: '1px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                            }}>
                                <strong style={{ fontSize: 12, color: '#334155' }}>Change Log</strong>
                                <button
                                    onClick={() => setChangeLogCollapsed(true)}
                                    title="Collapse"
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: 999,
                                        border: '1px solid #e2e8f0',
                                        background: 'white',
                                        cursor: 'pointer',
                                        color: '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                            <div
                                style={{
                                    padding: 12,
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10,
                                    flex: 1,
                                    minHeight: 0,
                                    direction: 'rtl',
                                }}
                            >
                                <div style={{ direction: 'ltr', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {sortedChangeLog.length === 0 ? (
                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>No changes yet.</div>
                                ) : (
                                    sortedChangeLog.map(entry => (
                                        <div key={entry.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{entry.label}</div>
                                                {entry.target && (
                                                    <button
                                                        onClick={() => {
                                                            let rowIndex = entry.target!.rowIndex;
                                                            let columnIndex = entry.target!.columnIndex;
                                                            if (entry.target?.cellId) {
                                                                const loc = cellIdMap.get(entry.target.cellId);
                                                                if (!loc) {
                                                                    showNotification('Row not found (it may have been deleted).', 'error');
                                                                    return;
                                                                }
                                                                rowIndex = loc.rowIndex;
                                                                columnIndex = loc.columnIndex;
                                                            } else {
                                                                if (!tableRowIndexSet.has(rowIndex)) {
                                                                    showNotification('Row not found (it may have been deleted).', 'error');
                                                                    return;
                                                                }
                                                            }
                                                            const visibleIndex = filteredData.findIndex(row => row[0]?.rowIndex === rowIndex);
                                                            if (showErrorsOnly && visibleIndex === -1) {
                                                                setShowErrorsOnly(false);
                                                            }
                                                            setPendingFindTarget({ rowIndex, columnIndex });
                                                        }}
                                                        style={{
                                                            border: '1px solid #dbeafe',
                                                            background: '#eff6ff',
                                                            color: '#2563eb',
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            padding: '2px 6px',
                                                            borderRadius: 6,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        Find
                                                    </button>
                                                )}
                                            </div>
                                            {entry.detail && (
                                                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{entry.detail}</div>
                                            )}
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                                                {new Date(entry.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                    ))
                                )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {correctionModal && (
                <CorrectionReasonModal
                    isOpen={true}
                    title="Correction Required"
                    message="Please provide a reason for this correction:"
                    onConfirm={(reason) => {
                        setCorrectionModal(null);
                        handleCellSave(correctionModal.rowIndex, correctionModal.columnIndex, correctionModal.value, reason);
                    }}
                    onClose={() => setCorrectionModal(null)}
                    confirmLabel="Save"
                />
            )}

            {mappingCorrectionModal && (
                <CorrectionReasonModal
                    isOpen={true}
                    title="Correction Required"
                    message="Please provide a reason for updating the column mapping:"
                    onConfirm={(reason) => {
                        const { columnIndex, fieldKey } = mappingCorrectionModal;
                        setMappingCorrectionModal(null);
                        handleMapColumn(columnIndex, fieldKey, reason);
                    }}
                    onClose={() => setMappingCorrectionModal(null)}
                    confirmLabel="Save"
                />
            )}

            {deleteRowModal && (
                <CorrectionReasonModal
                    isOpen={true}
                    title="Delete Row(s)"
                    message="Please provide a reason for deleting the selected row(s):"
                    onConfirm={(reason) => {
                        setDeleteRowModal(null);
                        handleDeleteSelected(reason);
                    }}
                    onClose={() => setDeleteRowModal(null)}
                    confirmLabel="Delete"
                />
            )}

            {confirmationModalOpen && (
                <TableConfirmationModal
                    table={table}
                    errorCount={errorCount}
                    isConfirming={isConfirming}
                    onConfirm={handleFinalConfirm}
                    onCancel={() => setConfirmationModalOpen(false)}
                />
            )}
        </div>
    );
}
