/**
 * Shared type definitions extracted from database schema
 * These types provide type safety for service methods and eliminate the need for 'any' types
 */

import { todos, attachments, baselineTables, baselineTableCells, baselineTableColumnMappings, baselineFieldAssignments, extractedTextSegments } from '../db/schema';
import { extractionBaselines } from '../baseline/schema';

// === Todo Types ===
export type Todo = typeof todos.$inferSelect;
export type TodoInsert = typeof todos.$inferInsert;

// === Attachment Types ===
export type Attachment = typeof attachments.$inferSelect;
export type AttachmentInsert = typeof attachments.$inferInsert;

// === Baseline Types ===
export type Baseline = typeof extractionBaselines.$inferSelect;
export type BaselineInsert = typeof extractionBaselines.$inferInsert;

// === Table Types ===
export type Table = typeof baselineTables.$inferSelect;
export type TableInsert = typeof baselineTables.$inferInsert;

// === Cell Types ===
export type Cell = typeof baselineTableCells.$inferSelect;
export type CellInsert = typeof baselineTableCells.$inferInsert;

// === Column Mapping Types ===
export type ColumnMapping = typeof baselineTableColumnMappings.$inferSelect;
export type ColumnMappingInsert = typeof baselineTableColumnMappings.$inferInsert;

// === Field Assignment Types ===
export type Assignment = typeof baselineFieldAssignments.$inferSelect;
export type AssignmentInsert = typeof baselineFieldAssignments.$inferInsert;

// === Segment Types ===
export type Segment = typeof extractedTextSegments.$inferSelect;
export type SegmentInsert = typeof extractedTextSegments.$inferInsert;

// === Composite Types for Service Methods ===

/**
 * Table with complete details including cells and column mappings
 * Used as return type for table retrieval methods
 */
export interface TableWithDetails {
  table: Table;
  cells: Cell[][];
  columnMappings: ColumnMapping[];
}

/**
 * Baseline context with ownership information
 * Used by AuthorizationService for access control
 */
export interface BaselineContext {
  id: string;
  attachmentId: string;
  status: string;
  utilizationType: string | null;
  utilizedAt: Date | null;
  ownerId: string;
}

/**
 * Table context with full ownership chain
 * Used by AuthorizationService for table access control
 */
export interface TableContext {
  tableId: string;
  tableBaselineId: string;
  tableLabel: string | null;
  tableStatus: string;
  baselineId: string;
  baselineAttachmentId: string;
  baselineStatus: string;
  baselineUtilizationType: string | null;
  baselineUtilizedAt: Date | null;
  attachmentId: string;
  attachmentTodoId: string;
  todoId: string;
  todoUserId: string;
}

/**
 * Attachment with todo ownership information
 * Used by AuthorizationService for attachment access control
 */
export interface AttachmentWithOwnership {
  attachment: Attachment;
  todo: Todo;
}

/**
 * Options for creating a new table
 */
export interface CreateTableOptions {
  label?: string;
  cellValues: string[][];
  rowCount?: number;
  columnCount?: number;
}

/**
 * Validation result for field assignments
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestedCorrection?: string;
}

/**
 * Cell with validation information
 * Used for table cell management
 */
export interface CellWithValidation extends Cell {
  validation?: ValidationResult;
}
