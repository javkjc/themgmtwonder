/**
 * React hook for consuming duration settings from the API
 * Provides runtime-configurable min/max/default duration values
 */

import { useState, useEffect } from 'react';
import { getDurationSettings, type DurationSettings } from '../lib/durationSettings';

// Fallback defaults (used until settings are loaded)
const FALLBACK_SETTINGS: DurationSettings = {
  minDurationMin: 5,
  maxDurationMin: 1440,
  defaultDurationMin: 30,
};

export function useDurationSettings() {
  const [settings, setSettings] = useState<DurationSettings>(FALLBACK_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const fetchedSettings = await getDurationSettings();
        if (mounted) {
          setSettings(fetchedSettings);
        }
      } catch (error) {
        console.error('Failed to load duration settings:', error);
        // Keep fallback settings on error
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    ...settings,
    isLoading,
  };
}
