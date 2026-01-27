/**
 * Date and time utility functions
 */

/**
 * Format a date to local date string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString();
}

/**
 * Format a date to local time string (HH:mm format)
 */
export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a date to local date and time string
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString();
}

/**
 * Format a date range with start and duration
 */
export function formatTimeRange(startAt: string, durationMin: number): string {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + durationMin * 60000);
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Convert ISO string to datetime-local input format (YYYY-MM-DDTHH:mm)
 */
export function toDateTimeLocal(isoString: string): string {
  const date = new Date(isoString);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

/**
 * Convert datetime-local input value to ISO string
 */
export function fromDateTimeLocal(dateTimeLocal: string): string {
  return new Date(dateTimeLocal).toISOString();
}

/**
 * Get current time rounded to next 30 minutes in datetime-local format
 */
export function getNextRounded30Min(): string {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

/**
 * Calculate end date from start and duration
 */
export function calculateEndDate(start: Date, durationMin: number): Date {
  return new Date(start.getTime() + durationMin * 60000);
}

/**
 * Format a date as relative time (e.g., "2 minutes ago", "1 hour ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  } else {
    return formatDate(date);
  }
}
