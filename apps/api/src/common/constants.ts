/**
 * Shared constants for the API
 *
 * IMPORTANT: Duration limits must be kept in sync with frontend constants
 * (apps/web/app/lib/constants.ts)
 */

// Duration limits (in minutes)
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 1440; // 24 hours
export const DEFAULT_DURATION_MIN = 30;

// Enforce duration configuration guards
if (DEFAULT_DURATION_MIN < MIN_DURATION_MIN) {
  throw new Error(
    `Invalid duration config: DEFAULT_DURATION_MIN (${DEFAULT_DURATION_MIN}) must be >= MIN_DURATION_MIN (${MIN_DURATION_MIN})`,
  );
}
if (DEFAULT_DURATION_MIN > MAX_DURATION_MIN) {
  throw new Error(
    `Invalid duration config: DEFAULT_DURATION_MIN (${DEFAULT_DURATION_MIN}) must be <= MAX_DURATION_MIN (${MAX_DURATION_MIN})`,
  );
}

// Task stage/status definitions (future-proof and audit-friendly)
export const TASK_STAGE_KEYS = [
  'backlog',
  'in_progress',
  'blocked',
  'done',
] as const;
export type TaskStageKey = (typeof TASK_STAGE_KEYS)[number];
export const DEFAULT_TASK_STAGE_KEY: TaskStageKey = TASK_STAGE_KEYS[0];

// Table validation limits
export const TABLE_LIMITS = {
  MAX_ROWS: 1000,
  MAX_COLUMNS: 50,
  MAX_CELLS: 50000,
  MAX_CELL_LENGTH: 5000,
} as const;

// Baseline validation limits
export const BASELINE_LIMITS = {
  MIN_CORRECTION_REASON_LENGTH: 10,
} as const;

/**
 * Validates table dimensions against configured limits
 * @throws {BadRequestException} if dimensions are invalid or exceed limits
 */
export function validateTableDimensions(rowCount: number, columnCount: number): void {
  const { BadRequestException } = require('@nestjs/common');

  if (rowCount < 1 || columnCount < 1) {
    throw new BadRequestException('Table must have at least 1 row and 1 column');
  }

  // Check cell count first (more specific error)
  if (rowCount * columnCount > TABLE_LIMITS.MAX_CELLS) {
    throw new BadRequestException(
      `Table exceeds maximum cell count (${TABLE_LIMITS.MAX_CELLS} cells)`
    );
  }

  if (rowCount > TABLE_LIMITS.MAX_ROWS || columnCount > TABLE_LIMITS.MAX_COLUMNS) {
    throw new BadRequestException(
      `Table size exceeds limits (max ${TABLE_LIMITS.MAX_ROWS} rows × ${TABLE_LIMITS.MAX_COLUMNS} columns)`
    );
  }
}

/**
 * Validates cell value length
 * @throws {BadRequestException} if cell value exceeds maximum length
 */
export function validateCellValue(value: string | null | undefined): void {
  const { BadRequestException } = require('@nestjs/common');

  if (value !== null && value !== undefined && value !== '' && value.length > TABLE_LIMITS.MAX_CELL_LENGTH) {
    throw new BadRequestException(
      `Cell value exceeds maximum length of ${TABLE_LIMITS.MAX_CELL_LENGTH} characters`
    );
  }
}

/**
 * Validates correction reason length
 * @throws {BadRequestException} if reason is too short
 */
export function validateCorrectionReason(reason: string): void {
  const { BadRequestException } = require('@nestjs/common');

  if (reason.length < BASELINE_LIMITS.MIN_CORRECTION_REASON_LENGTH) {
    throw new BadRequestException(
      `Correction reason must be at least ${BASELINE_LIMITS.MIN_CORRECTION_REASON_LENGTH} characters`
    );
  }
}
