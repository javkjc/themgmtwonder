'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetchJson, isUnauthorized } from '../lib/api';

export type AuditLog = {
  id: string;
  userId: string | null;
  actorType?: 'user' | 'system';
  userEmail?: string | null;
  action: string;
  module: string | null;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type UseAuditLogsOptions = {
  limit?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
  onUnauthorized?: () => void;
};

export function useAuditLogs(options: UseAuditLogsOptions = {}) {
  const { limit = 50, action, startDate, endDate, onUnauthorized } = options;

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchLogs = useCallback(async (reset = false) => {
    setLoading(true);
    setError(null);

    try {
      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(currentOffset));
      if (action) params.set('action', action);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const data = await apiFetchJson(`/audit?${params.toString()}`);
      const newLogs = Array.isArray(data) ? data : [];

      if (reset) {
        setLogs(newLogs);
        setOffset(newLogs.length);
      } else {
        setLogs((prev) => [...prev, ...newLogs]);
        setOffset((prev) => prev + newLogs.length);
      }

      setHasMore(newLogs.length === limit);
    } catch (e: any) {
      if (isUnauthorized(e)) {
        onUnauthorized?.();
      }
      setError(e?.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  }, [limit, action, startDate, endDate, offset, onUnauthorized]);

  const refresh = useCallback(() => {
    setOffset(0);
    fetchLogs(true);
  }, [fetchLogs]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchLogs(false);
    }
  }, [loading, hasMore, fetchLogs]);

  useEffect(() => {
    fetchLogs(true);
  }, [action, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    logs,
    loading,
    error,
    hasMore,
    refresh,
    loadMore,
  };
}
