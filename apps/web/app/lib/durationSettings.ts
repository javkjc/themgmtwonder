/**
 * Duration settings management
 * Fetches configurable duration limits from the API
 */

import { CSRF_HEADER_NAME, getCsrfToken } from './api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export type DurationSettings = {
  minDurationMin: number;
  maxDurationMin: number;
  defaultDurationMin: number;
};

// Default fallback values
const DEFAULT_SETTINGS: DurationSettings = {
  minDurationMin: 5,
  maxDurationMin: 1440,
  defaultDurationMin: 30,
};

// In-memory cache
let cachedSettings: DurationSettings | null = null;

function buildHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const csrf = getCsrfToken();
  if (csrf) {
    headers[CSRF_HEADER_NAME] = csrf;
  }
  return headers;
}

export async function getDurationSettings(): Promise<DurationSettings> {
  // Return cached if available
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/settings/duration`, {
      credentials: 'include',
      headers: buildHeaders(),
    });

    if (!response.ok) {
      console.warn('Failed to fetch duration settings, using defaults');
      return DEFAULT_SETTINGS;
    }

    const settings = await response.json();
    cachedSettings = settings;
    return settings;
  } catch (error) {
    console.error('Error fetching duration settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function updateDurationSettings(
  settings: Partial<DurationSettings>
): Promise<DurationSettings> {
  try {
    const response = await fetch(`${API_BASE_URL}/settings/duration`, {
      method: 'PUT',
      credentials: 'include',
      headers: buildHeaders(),
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error('Failed to update duration settings');
    }

    const updated = await response.json();
    cachedSettings = updated; // Update cache
    return updated;
  } catch (error) {
    console.error('Error updating duration settings:', error);
    throw error;
  }
}

// Clear cache (useful for logout or settings changes)
export function clearDurationSettingsCache() {
  cachedSettings = null;
}
