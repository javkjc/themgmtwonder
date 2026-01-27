'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetchJson, isUnauthorized } from '../lib/api';

export type ScheduledEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
};

/**
 * Fetches scheduled events for today (used for availability suggestions).
 * Lightweight alternative to full calendar event fetching.
 */
export function useScheduledEvents(userId: string | null): ScheduledEvent[] {
  const [events, setEvents] = useState<ScheduledEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    if (!userId) {
      setEvents([]);
      return;
    }

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    try {
      const data = await apiFetchJson(
        `/todos?scheduledAfter=${start.toISOString()}&scheduledBefore=${end.toISOString()}`
      );
      if (Array.isArray(data)) {
        const mapped: ScheduledEvent[] = data
          .filter((t: any) => t.startAt)
          .map((t: any) => ({
            id: t.id,
            title: t.title,
            start: new Date(t.startAt),
            end: new Date(new Date(t.startAt).getTime() + (t.durationMin || 30) * 60000),
          }));
        setEvents(mapped);
      }
    } catch (e: any) {
      if (!isUnauthorized(e)) {
        // Silently fail - suggestions just won't show
      }
    }
  }, [userId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Listen for todo updates from other pages
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'todoUpdate') {
        fetchEvents();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [fetchEvents]);

  return events;
}
