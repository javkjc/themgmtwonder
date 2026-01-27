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
