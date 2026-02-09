import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import {
    baselineTables,
    baselineTableCells,
    baselineTableColumnMappings,
    extractionBaselines,
    fieldLibrary,
} from '../db/schema';
import { eq, and, gt, desc, sql, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { FieldAssignmentValidatorService } from './field-assignment-validator.service';

@Injectable()
export class TableManagementService {
    constructor(
        private readonly dbs: DbService,
        private readonly auditService: AuditService,
        private readonly validator: FieldAssignmentValidatorService,
    ) { }

    /**
     * Create a new table
     * 
     * @param baselineId - The baseline to attach the table to
     * @param userId - User creating the table
     * @param options - Table creation options (label, initial data)
     */
    async createTable(
        baselineId: string,
        userId: string,
        options: {
            label?: string;
            cellValues: string[][]; // row-major: [row0_col0, row0_col1], [row1_col0, ...]
        },
    ): Promise<any> {
        return await this.dbs.db.transaction(async (tx) => {
            // 1. Verify baseline valid and editable
            const [baseline] = await tx
                .select()
                .from(extractionBaselines)
                .where(eq(extractionBaselines.id, baselineId))
                .limit(1);

            if (!baseline) {
                throw new NotFoundException('Baseline not found');
            }

            // Guard: Baseline must be draft or reviewed
            if (['confirmed', 'archived'].includes(baseline.status)) {
                throw new BadRequestException(
                    `Cannot create table: baseline is ${baseline.status}`
                );
            }

            // Guard: Utilization lockout
            if (baseline.utilizedAt) {
                throw new ForbiddenException('Baseline is locked due to utilization');
            }

            // 2. Calculate table index
            const [lastTable] = await tx
                .select({ tableIndex: baselineTables.tableIndex })
                .from(baselineTables)
                .where(eq(baselineTables.baselineId, baselineId))
                .orderBy(desc(baselineTables.tableIndex))
                .limit(1);

            const nextIndex = (lastTable?.tableIndex ?? -1) + 1;

            // 3. Determine dimensions from input
            const rowCount = options.cellValues.length;
            const columnCount = rowCount > 0 ? options.cellValues[0].length : 0;

            if (rowCount < 1 || columnCount < 1) {
                throw new BadRequestException('Table must have at least 1 row and 1 column');
            }

            if (rowCount > 1000 || columnCount > 50) {
                throw new BadRequestException('Table size exceeds limit (1000 rows x 50 columns)');
            }

            if (rowCount * columnCount > 50000) {
                throw new BadRequestException('Table size exceeds limit (50,000 cells)');
            }

            // 4. Create Table Record
            const [table] = await tx
                .insert(baselineTables)
                .values({
                    baselineId,
                    tableIndex: nextIndex,
                    tableLabel: options.label || `Table ${nextIndex + 1}`,
                    status: 'draft',
                    rowCount,
                    columnCount,
                })
                .returning();

            // 5. Insert Cells (Batching if necessary)
            const cellsToInsert: any[] = [];
            for (let r = 0; r < rowCount; r++) {
                const row = options.cellValues[r];
                // Validate consistency (optional, but good)
                if (row.length !== columnCount) {
                    throw new BadRequestException(`Row ${r} has inconsistent column count`);
                }

                for (let c = 0; c < columnCount; c++) {
                    const val = row[c];
                    if (val !== null && val !== undefined && val !== '' && val.length > 5000) {
                        throw new BadRequestException('Cell value exceeds 5000 characters');
                    }

                    cellsToInsert.push({
                        tableId: table.id,
                        rowIndex: r,
                        columnIndex: c,
                        cellValue: val ?? null,
                        validationStatus: 'valid', // Default valid (unmapped)
                    });
                }
            }

            if (cellsToInsert.length > 0) {
                // Batch insert (Drizzle can handle decent size, but let's be safe with 1000 chunks)
                const batchSize = 1000;
                for (let i = 0; i < cellsToInsert.length; i += batchSize) {
                    await tx.insert(baselineTableCells).values(cellsToInsert.slice(i, i + batchSize));
                }
            }

            // 6. Audit Log
            await this.auditService.log({
                userId,
                action: 'table.create',
                module: 'table',
                resourceType: 'table',
                resourceId: table.id,
                details: {
                    baselineId,
                    label: table.tableLabel,
                    rowCount,
                    columnCount,
                },
            });

            return table;
        });
    }

    /**
     * Map a column to a field definition
     */
    async assignColumnToField(
        tableId: string,
        columnIndex: number,
        fieldKey: string,
        userId: string,
    ): Promise<any> {
        return await this.dbs.db.transaction(async (tx) => {
            // 1. Verify table and baseline status
            const tableWithBaseline = await this.getTableWithBaseline(tx, tableId);
            const { table, baseline } = tableWithBaseline;

            this.ensureEditable(table, baseline);

            if (columnIndex < 0 || columnIndex >= table.columnCount) {
                throw new BadRequestException(`Invalid column index: ${columnIndex}`);
            }

            // 2. Verify field exists
            const [field] = await tx
                .select()
                .from(fieldLibrary)
                .where(eq(fieldLibrary.fieldKey, fieldKey))
                .limit(1);

            if (!field) {
                throw new NotFoundException(`Field not found: ${fieldKey}`);
            }

            if (field.status !== 'active') {
                throw new BadRequestException(`Field is not active: ${fieldKey}`);
            }

            // 3. Update/Insert Mapping
            await tx
                .insert(baselineTableColumnMappings)
                .values({
                    tableId,
                    columnIndex,
                    fieldKey,
                })
                .onConflictDoUpdate({
                    target: [baselineTableColumnMappings.tableId, baselineTableColumnMappings.columnIndex],
                    set: { fieldKey },
                });

            // 4. Validate all cells in the column
            // Fetch cells
            const cells = await tx
                .select()
                .from(baselineTableCells)
                .where(
                    and(
                        eq(baselineTableCells.tableId, tableId),
                        eq(baselineTableCells.columnIndex, columnIndex)
                    )
                );

            // Re-validate each
            for (const cell of cells) {
                const validation = this.validator.validate(
                    field.characterType,
                    cell.cellValue,
                    field.characterLimit
                );

                await tx
                    .update(baselineTableCells)
                    .set({
                        validationStatus: validation.valid ? 'valid' : 'invalid',
                        errorText: validation.error || null,
                        // validationSuggestion not in schema for table cells
                    })
                    .where(eq(baselineTableCells.id, cell.id));
            }

            // 5. Audit
            await this.auditService.log({
                userId,
                action: 'table.column.assign',
                module: 'table',
                resourceType: 'table',
                resourceId: tableId,
                details: {
                    columnIndex,
                    fieldKey,
                    fieldLabel: field.label,
                },
            });

            return { success: true };
        });
    }

    /**
     * Update a single cell value
     */
    async updateCell(
        tableId: string,
        rowIndex: number,
        columnIndex: number,
        value: string,
        userId: string,
        correctionReason?: string,
    ): Promise<any> {
        return await this.dbs.db.transaction(async (tx) => {
            const { table, baseline } = await this.getTableWithBaseline(tx, tableId);
            this.ensureEditable(table, baseline);

            // Fetch current cell (if exists)
            const [currentCell] = await tx
                .select()
                .from(baselineTableCells)
                .where(
                    and(
                        eq(baselineTableCells.tableId, tableId),
                        eq(baselineTableCells.rowIndex, rowIndex),
                        eq(baselineTableCells.columnIndex, columnIndex)
                    )
                )
                .limit(1);

            // Check if overwrite requires reason
            const isOverwrite = currentCell && currentCell.cellValue !== null && currentCell.cellValue !== '';
            if (isOverwrite && !correctionReason) {
                throw new BadRequestException('Correction reason is required when overwriting an existing value');
            }

            // Check if column is mapped
            const [mapping] = await tx
                .select()
                .from(baselineTableColumnMappings)
                .leftJoin(fieldLibrary, eq(baselineTableColumnMappings.fieldKey, fieldLibrary.fieldKey))
                .where(
                    and(
                        eq(baselineTableColumnMappings.tableId, tableId),
                        eq(baselineTableColumnMappings.columnIndex, columnIndex)
                    )
                )
                .limit(1);

            const field = mapping?.field_library;

            // Validate
            let validationStatus = 'valid';
            let errorText: string | null = null;
            let validationSuggestion = null;

            if (field) {
                const result = this.validator.validate(field.characterType, value, field.characterLimit);
                validationStatus = result.valid ? 'valid' : 'invalid';
                errorText = result.error || null;
                // validationSuggestion = result.suggestedCorrection || null;
            } else {
                // Basic length check for unmapped cells (hard limit)
                if (value && value.length > 5000) {
                    throw new BadRequestException('Cell value exceeds 5000 characters');
                }
            }

            // Upsert cell
            await tx
                .insert(baselineTableCells)
                .values({
                    tableId,
                    rowIndex,
                    columnIndex,
                    cellValue: value,
                    validationStatus: validationStatus as any,
                    errorText,
                    // validationSuggestion,
                    correctionReason: isOverwrite ? correctionReason : null,
                    correctionFrom: isOverwrite ? currentCell.cellValue : null,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [baselineTableCells.tableId, baselineTableCells.rowIndex, baselineTableCells.columnIndex],
                    set: {
                        cellValue: value,
                        validationStatus: validationStatus as any,
                        errorText,
                        // validationSuggestion,
                        correctionReason: isOverwrite ? correctionReason : null,
                        correctionFrom: isOverwrite ? currentCell.cellValue : null,
                        updatedAt: new Date(),
                    },
                });

            // Audit
            await this.auditService.log({
                userId,
                action: 'table.cell.update',
                module: 'table',
                resourceType: 'table',
                resourceId: tableId,
                details: {
                    rowIndex,
                    columnIndex,
                    hasMapping: !!field,
                    validationStatus,
                },
            });
        });
    }

    /**
     * Delete a row
     */
    async deleteRow(
        tableId: string,
        rowIndex: number,
        userId: string,
        reason: string,
    ): Promise<any> {
        if (!reason) {
            throw new BadRequestException('Reason required to delete row');
        }

        return await this.dbs.db.transaction(async (tx) => {
            const { table, baseline } = await this.getTableWithBaseline(tx, tableId);
            this.ensureEditable(table, baseline);

            if (rowIndex < 0 || rowIndex >= table.rowCount) {
                throw new BadRequestException(`Invalid row index: ${rowIndex}`);
            }

            // 1. Delete cells in the row
            await tx
                .delete(baselineTableCells)
                .where(
                    and(
                        eq(baselineTableCells.tableId, tableId),
                        eq(baselineTableCells.rowIndex, rowIndex)
                    )
                );

            // 2. Shift subsequent rows up (rowIndex - 1)
            // We need to do this carefully. 
            // SQL: UPDATE baseline_table_cells SET row_index = row_index - 1 WHERE table_id = ? AND row_index > ?
            // Drizzle doesn't support raw SQL updates easily in typesafe way without `sql`; 
            // but we can use generic update with where clause.
            // Note: Update order matters if we had unique constraints that might collide transiently, 
            // but since we deleted the target row, moving items INTO it should be fine.
            // Actually, we are moving > rowIndex to rowIndex-1. 
            // (k) -> (k-1).
            // We should process from lowest to highest index to avoid collision? 
            // Indices are unique (tableId, rowIndex, columnIndex).
            // If we have row 5 and row 6. Delete 5. Update 6->5. 
            // If we update 6->5, it's fine because 5 is gone.
            // If we update 7->6, it's fine because 6 moved to 5.
            // So we can do a single update statement usually.

            // HOWEVER, unique constraint is (tableId, rowIndex, columnIndex).
            // Efficient shift:
            // Fetch all cells with row > rowIndex
            // This could be many cells.
            // Better to use SQL update if possible or loop.
            // Since Drizzle abstracts SQL, let's try direct update.

            // To be safe against unique constraint violations during update (if DB checks per row),
            // usually it's safe if deferred or unrelated. PostreSQL checks per row.
            // If we update set row_index = row_index - 1 where row_index > X.
            // Row 6 becomes 5. 5 is empty. OK.
            // Row 7 becomes 6. 6 was just moved? No, update happens based on snapshot usually?
            // Actually, `UPDATE table SET row_index = row_index - 1 WHERE row_index > ?` works in Postgres safely.

            // In Drizzle:
            await tx
                .update(baselineTableCells)
                .set({ rowIndex: sql`${baselineTableCells.rowIndex} - 1` })
                .where(
                    and(
                        eq(baselineTableCells.tableId, tableId),
                        gt(baselineTableCells.rowIndex, rowIndex)
                    )
                );

            // 3. Decrement table row count
            await tx
                .update(baselineTables)
                .set({ rowCount: sql`${baselineTables.rowCount} - 1` })
                .where(eq(baselineTables.id, tableId));

            // Audit
            await this.auditService.log({
                userId,
                action: 'table.row.delete',
                module: 'table',
                resourceType: 'table',
                resourceId: tableId,
                details: {
                    rowIndex,
                    reason,
                },
            });
        });
    }

    /**
     * Confirm a table
     */
    async confirmTable(tableId: string, userId: string): Promise<any> {
        return await this.dbs.db.transaction(async (tx) => {
            const { table, baseline } = await this.getTableWithBaseline(tx, tableId);

            // Cannot confirm if already confirmed
            if (table.status === 'confirmed') {
                return table; // idempotent
            }

            this.ensureEditable(table, baseline);

            // selectCount returns { count: number }[] usually but depends on adapter
            // In Drizzle helper:
            // Actually `selectCount` logic varies. Let's use count()
            // Wait, Drizzle `select({ count: count() })` is the modern way.
            // Let's use simple select with limit 1 to see if ANY invalid cell exists.
            const [invalid] = await tx
                .select()
                .from(baselineTableCells)
                .where(
                    and(
                        eq(baselineTableCells.tableId, tableId),
                        eq(baselineTableCells.validationStatus, 'invalid')
                    )
                )
                .limit(1);

            if (invalid) {
                throw new BadRequestException('Cannot confirm table with invalid cells. Please fix errors first.');
            }

            // Confirm
            const [confirmed] = await tx
                .update(baselineTables)
                .set({
                    status: 'confirmed',
                    confirmedAt: new Date(),
                    confirmedBy: userId,
                })
                .where(eq(baselineTables.id, tableId))
                .returning();

            // Audit
            await this.auditService.log({
                userId,
                action: 'table.confirm',
                module: 'table',
                resourceType: 'table',
                resourceId: tableId,
                details: {
                    tableLabel: table.tableLabel,
                },
            });

            return confirmed;
        });
    }

    /**
     * Delete a table
     */
    async deleteTable(tableId: string, userId: string): Promise<any> {
        return await this.dbs.db.transaction(async (tx) => {
            const { table, baseline } = await this.getTableWithBaseline(tx, tableId);
            this.ensureEditable(table, baseline);

            await tx.delete(baselineTables).where(eq(baselineTables.id, tableId));
            return { success: true };
        });
    }

    /**
     * Get full table details with 2D cell grid
     */
    async getTableDetails(tableId: string) {
        const [table] = await this.dbs.db
            .select()
            .from(baselineTables)
            .where(eq(baselineTables.id, tableId))
            .limit(1);

        if (!table) {
            throw new NotFoundException('Table not found');
        }

        const cellsFlat = await this.dbs.db
            .select()
            .from(baselineTableCells)
            .where(eq(baselineTableCells.tableId, tableId))
            .orderBy(baselineTableCells.rowIndex, baselineTableCells.columnIndex);

        const mappings = await this.dbs.db
            .select()
            .from(baselineTableColumnMappings)
            .where(eq(baselineTableColumnMappings.tableId, tableId))
            .orderBy(baselineTableColumnMappings.columnIndex);

        // Reconstruct 2D array
        const cells: (typeof cellsFlat[0])[][] = [];

        // Optimize reconstruction since we know data is ordered by row, col
        let flatIndex = 0;
        for (let r = 0; r < table.rowCount; r++) {
            const row: typeof cellsFlat[0][] = [];
            for (let c = 0; c < table.columnCount; c++) {
                if (flatIndex < cellsFlat.length) {
                    const cell = cellsFlat[flatIndex];
                    // Verify alignment (sanity check)
                    if (cell.rowIndex === r && cell.columnIndex === c) {
                        row.push(cell);
                        flatIndex++;
                    } else {
                        // Should not happen if DB is consistent
                        row.push({
                            id: 'missing',
                            tableId: table.id,
                            rowIndex: r,
                            columnIndex: c,
                            cellValue: '',
                            validationStatus: 'valid',
                            errorText: null,
                            correctionFrom: null,
                            correctionReason: null,
                            updatedAt: new Date()
                        });
                    }
                } else {
                    row.push({
                        id: 'missing',
                        tableId: table.id,
                        rowIndex: r,
                        columnIndex: c,
                        cellValue: '',
                        validationStatus: 'valid',
                        errorText: null,
                        correctionFrom: null,
                        correctionReason: null,
                        updatedAt: new Date()
                    });
                }
            }
            cells.push(row);
        }

        return {
            table,
            cells,
            columnMappings: mappings,
        };
    }

    /**
     * List tables for a baseline with mapping summaries
     */
    async listTablesForBaseline(baselineId: string) {
        const tables = await this.dbs.db
            .select()
            .from(baselineTables)
            .where(eq(baselineTables.baselineId, baselineId))
            .orderBy(baselineTables.tableIndex);

        if (tables.length === 0) {
            return [];
        }

        const tableIds = tables.map(t => t.id);

        const mappings = await this.dbs.db
            .select()
            .from(baselineTableColumnMappings)
            .where(inArray(baselineTableColumnMappings.tableId, tableIds));

        // Group mappings by tableId
        const mappingsByTable = mappings.reduce((acc, m) => {
            if (!acc[m.tableId]) {
                acc[m.tableId] = [];
            }
            acc[m.tableId].push(m);
            return acc;
        }, {} as Record<string, typeof mappings>);

        return tables.map(t => ({
            ...t,
            columnMappings: mappingsByTable[t.id] || [],
        }));
    }

    // --- Helpers ---

    private async getTableWithBaseline(tx: any, tableId: string) {
        // Since we can't easily join in one query and map to objects with Drizzle without verbose relations setup in query builder,
        // we'll simpler fetch table then baseline.

        const [table] = await tx
            .select()
            .from(baselineTables)
            .where(eq(baselineTables.id, tableId))
            .limit(1);

        if (!table) {
            throw new NotFoundException('Table not found');
        }

        const [baseline] = await tx
            .select()
            .from(extractionBaselines)
            .where(eq(extractionBaselines.id, table.baselineId))
            .limit(1);

        if (!baseline) {
            throw new NotFoundException('Baseline for table not found');
        }

        return { table, baseline };
    }

    private ensureEditable(table: any, baseline: any) {
        if (baseline.utilizedAt) {
            throw new ForbiddenException('Baseline is locked due to utilization');
        }
        if (baseline.status === 'archived') {
            throw new BadRequestException('Baseline is archived');
        }
        if (baseline.status === 'confirmed') {
            throw new BadRequestException('Baseline is confirmed and cannot be modified');
        }
        if (table.status === 'confirmed') {
            throw new BadRequestException('Table is already confirmed and cannot be modified');
        }
    }
}
