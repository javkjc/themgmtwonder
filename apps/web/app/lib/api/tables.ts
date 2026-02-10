import { apiFetchJson } from '../api';

export interface Table {
    id: string;
    baselineId: string;
    tableIndex: number;
    tableLabel: string | null;
    status: 'draft' | 'confirmed';
    rowCount: number;
    columnCount: number;
    confirmedAt: string | null;
    confirmedBy: string | null;
    confirmedByEmail?: string | null;
    baselineUtilizedAt?: string | null;
    baselineUtilizationType?: string | null;
    baselineUtilizationMetadata?: Record<string, any> | null;
    createdAt: string;
    updatedAt: string;
    errorCount?: number;
}

export interface Cell {
    id: string;
    tableId: string;
    rowIndex: number;
    columnIndex: number;
    cellValue: string | null;
    validationStatus: 'pending' | 'valid' | 'invalid';
    errorText: string | null;
    correctionFrom: string | null;
    correctionReason: string | null;
    updatedAt: string;
}

export interface ColumnMapping {
    id: string;
    tableId: string;
    columnIndex: number;
    fieldKey: string;
}

export interface FullTableResponse {
    table: Table;
    cells: Cell[][];
    columnMappings: ColumnMapping[];
}

export interface CreateTablePayload {
    rowCount: number;
    columnCount: number;
    tableLabel?: string;
    cellValues?: (string | null)[][];
}

export async function createTable(
    baselineId: string,
    payload: CreateTablePayload
): Promise<Table> {
    return apiFetchJson(`/baselines/${baselineId}/tables`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function fetchTablesForBaseline(
    baselineId: string
): Promise<Table[]> {
    return apiFetchJson(`/baselines/${baselineId}/tables`, {
        method: 'GET',
    });
}

export async function fetchTable(tableId: string): Promise<FullTableResponse> {
    return apiFetchJson(`/tables/${tableId}`, {
        method: 'GET',
    });
}

export async function deleteTable(tableId: string): Promise<void> {
    await apiFetchJson(`/tables/${tableId}`, {
        method: 'DELETE',
    });
}

export async function updateCell(
    tableId: string,
    rowIndex: number,
    columnIndex: number,
    value: string,
    correctionReason?: string
): Promise<Cell> {
    return apiFetchJson(`/tables/${tableId}/cells/${rowIndex}/${columnIndex}`, {
        method: 'PUT',
        body: JSON.stringify({ value, correctionReason }),
    });
}

export async function deleteRow(
    tableId: string,
    rowIndex: number,
    reason: string
): Promise<void> {
    await apiFetchJson(`/tables/${tableId}/rows/${rowIndex}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
    });
}

export async function assignColumn(
    tableId: string,
    columnIndex: number,
    fieldKey: string,
    correctionReason?: string
): Promise<void> {
    await apiFetchJson(`/tables/${tableId}/columns/${columnIndex}/assign`, {
        method: 'POST',
        body: JSON.stringify({ fieldKey, correctionReason }),
    });
}

export async function confirmTable(tableId: string): Promise<Table> {
    return apiFetchJson(`/tables/${tableId}/confirm`, {
        method: 'POST',
    });
}
