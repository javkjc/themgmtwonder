/**
 * Shared constants for the application
 */

// Predefined categories
export const CATEGORIES = ['Work', 'Personal', 'Health', 'Finance', 'Learning', 'Other'] as const;

export type Category = typeof CATEGORIES[number];

// Category colors for calendar events
export const CATEGORY_COLORS: Record<string, string> = {
  Work: '#3b82f6',      // blue
  Personal: '#8b5cf6',  // purple
  Health: '#10b981',    // green
  Finance: '#f59e0b',   // amber
  Learning: '#ec4899',  // pink
  Other: '#6b7280',     // gray
};

// Default color for events without category
export const DEFAULT_EVENT_COLOR = '#3b82f6';

// Task stage definitions
export const TASK_STAGE_KEYS = ['backlog', 'in_progress', 'blocked', 'done'] as const;
export type TaskStageKey = typeof TASK_STAGE_KEYS[number];
export const DEFAULT_TASK_STAGE_KEY: TaskStageKey = TASK_STAGE_KEYS[0];

// Duration limits (in minutes)
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 1440; // 24 hours
export const DEFAULT_DURATION_MIN = 30;

// Enforce duration configuration guards
if (DEFAULT_DURATION_MIN < MIN_DURATION_MIN) {
  throw new Error(`Invalid duration config: DEFAULT_DURATION_MIN (${DEFAULT_DURATION_MIN}) must be >= MIN_DURATION_MIN (${MIN_DURATION_MIN})`);
}
if (DEFAULT_DURATION_MIN > MAX_DURATION_MIN) {
  throw new Error(`Invalid duration config: DEFAULT_DURATION_MIN (${DEFAULT_DURATION_MIN}) must be <= MAX_DURATION_MIN (${MAX_DURATION_MIN})`);
}

// Duration presets for quick selection (must be within min/max bounds)
export const DURATION_PRESETS = [15, 30, 60];

// Validate presets are within bounds
DURATION_PRESETS.forEach(preset => {
  if (preset < MIN_DURATION_MIN || preset > MAX_DURATION_MIN) {
    throw new Error(`Invalid duration preset: ${preset} is outside bounds [${MIN_DURATION_MIN}, ${MAX_DURATION_MIN}]`);
  }
});

// Maximum todos to fetch per page
export const TODOS_PAGE_LIMIT = 50;
