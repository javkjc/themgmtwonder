'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetchJson } from '../lib/api';

export type EligibleParent = {
  id: string;
  title: string;
  done: boolean;
};

/**
 * Hook to fetch tasks that can be parents.
 * A task can be a parent if:
 * - It belongs to the user
 * - It is not already a child (parentId is null)
 * - It is not the task being edited (excludeId)
 */
export function useEligibleParents(userId: string | null, excludeId?: string | null) {
  const [eligibleParents, setEligibleParents] = useState<EligibleParent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEligibleParents = useCallback(async () => {
    if (!userId) {
      setEligibleParents([]);
      return;
    }

    setLoading(true);
    try {
      // Fetch all user tasks (active only, not already children)
      const todos = await apiFetchJson('/todos?done=false&limit=200');
      const eligible = Array.isArray(todos)
        ? todos
            .filter((t: any) => !t.parentId && t.id !== excludeId)
            .map((t: any) => ({
              id: t.id,
              title: t.title,
              done: t.done,
            }))
        : [];
      setEligibleParents(eligible);
    } catch (e) {
      setEligibleParents([]);
    } finally {
      setLoading(false);
    }
  }, [userId, excludeId]);

  useEffect(() => {
    fetchEligibleParents();
  }, [fetchEligibleParents]);

  return { eligibleParents, loading, refresh: fetchEligibleParents };
}
