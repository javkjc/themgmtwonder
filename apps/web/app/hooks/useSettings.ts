'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetchJson, isUnauthorized } from '../lib/api';

export type WorkingHours = {
  start: string;
  end: string;
};

export type UserSettings = {
  workingHours: WorkingHours;
  workingDays: number[];
};

const DEFAULT_SETTINGS: UserSettings = {
  workingHours: { start: '09:00', end: '17:00' },
  workingDays: [1, 2, 3, 4, 5],
};

export function useSettings(userId: string | null) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!userId) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiFetchJson('/settings');
      setSettings({
        workingHours: data.workingHours || DEFAULT_SETTINGS.workingHours,
        workingDays: Array.isArray(data.workingDays) ? data.workingDays : DEFAULT_SETTINGS.workingDays,
      });
    } catch (e: any) {
      if (isUnauthorized(e)) {
        setSettings(DEFAULT_SETTINGS);
      } else {
        setError(e?.message || 'Failed to fetch settings');
        setSettings(DEFAULT_SETTINGS);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    refresh: fetchSettings,
  };
}
