'use client';

import { useCallback, useState } from 'react';
import {
  createTable,
  fetchTable,
  deleteTable as deleteTableApi,
  detectTableSuggestions,
  ignoreTableSuggestion,
  convertTableSuggestion,
  type CreateTablePayload,
  type FullTableResponse,
  type Table,
  type TableSuggestion,
} from '@/app/lib/api/tables';
import { notifySuccess, notifyError } from '@/app/lib/notifications';
import type { Notification } from '@/app/components/NotificationToast';
import type { Baseline, Segment } from '../types';

interface UseTableManagementProps {
  baseline: Baseline | null;
  attachmentId: string | undefined;
  addNotification: (n: Notification) => void;
  loadBaseline: () => Promise<void>;
  loadSuggestions: () => Promise<void>;
  setTableSuggestions: React.Dispatch<React.SetStateAction<TableSuggestion[]>>;
}

export function useTableManagement({
  baseline,
  attachmentId,
  addNotification,
  loadBaseline,
  loadSuggestions,
  setTableSuggestions,
}: UseTableManagementProps) {
  const [activeTable, setActiveTable] = useState<FullTableResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'fields' | 'tables'>('fields');

  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const [isTableCreationOpen, setIsTableCreationOpen] = useState(false);
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [deleteTableModal, setDeleteTableModal] = useState<Table | null>(null);

  const [detectingTables, setDetectingTables] = useState(false);
  const [isTablePreviewOpen, setIsTablePreviewOpen] = useState(false);
  const [previewSuggestion, setPreviewSuggestion] = useState<TableSuggestion | null>(null);
  const [convertingSuggestionId, setConvertingSuggestionId] = useState<string | null>(null);

  const loadTableDetail = useCallback(async (tableId: string) => {
    setTableLoading(true);
    try {
      const data = await fetchTable(tableId);
      setActiveTable(data);
      setSidebarTab('tables');
    } catch (err: any) {
      addNotification(notifyError('Failed to load table', err.message));
    } finally {
      setTableLoading(false);
    }
  }, [addNotification]);

  const handleToggleSegmentSelection = useCallback((id: string) => {
    setSelectedSegmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllSegments = useCallback((all: boolean) => {
    if (all && baseline?.segments) {
      setSelectedSegmentIds(new Set(baseline.segments.filter(s => s.id).map(s => s.id as string)));
    } else {
      setSelectedSegmentIds(new Set());
    }
  }, [baseline]);

  const handleCreateTable = useCallback(async (payload: CreateTablePayload) => {
    if (!baseline) return;
    setIsCreatingTable(true);
    try {
      await createTable(baseline.id, payload);
      setIsTableCreationOpen(false);
      setSelectedSegmentIds(new Set());
      addNotification(notifySuccess(
        'Table created',
        payload.tableLabel ? `Table "${payload.tableLabel}" created` : 'Table created successfully',
      ));
      await loadBaseline();
    } catch (err: any) {
      throw err;
    } finally {
      setIsCreatingTable(false);
    }
  }, [baseline, addNotification, loadBaseline]);

  const handleDeleteTable = useCallback((table: Table) => {
    setDeleteTableModal(table);
  }, []);

  const confirmDeleteTable = useCallback(async () => {
    if (!deleteTableModal) return;
    try {
      await deleteTableApi(deleteTableModal.id);
      addNotification(notifySuccess('Table deleted', 'Table removed successfully'));
      if (activeTable?.table.id === deleteTableModal.id) {
        setActiveTable(null);
      }
      await loadBaseline();
    } catch (err: any) {
      addNotification(notifyError('Delete failed', err.message));
    } finally {
      setDeleteTableModal(null);
    }
  }, [deleteTableModal, addNotification, activeTable, loadBaseline]);

  const handleIgnoreTableSuggestion = useCallback(async (suggestion: TableSuggestion) => {
    try {
      await ignoreTableSuggestion(suggestion.id);
      setTableSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      addNotification(notifySuccess('Suggestion ignored', 'Table suggestion has been removed.'));
    } catch (err: any) {
      addNotification(notifyError('Action failed', err.message));
    }
  }, [addNotification, setTableSuggestions]);

  const handleDetectTables = useCallback(async () => {
    if (!attachmentId || detectingTables) return;
    setDetectingTables(true);
    try {
      await detectTableSuggestions(attachmentId);
      await loadSuggestions();
      addNotification(notifySuccess('Detection Complete', 'Table detection completed successfully.'));
    } catch (err: any) {
      addNotification(notifyError('Detection Failed', err.message || 'Failed to detect tables'));
    } finally {
      setDetectingTables(false);
    }
  }, [attachmentId, detectingTables, loadSuggestions, addNotification]);

  const handlePreviewTableSuggestion = useCallback((suggestion: TableSuggestion) => {
    setPreviewSuggestion(suggestion);
    setIsTablePreviewOpen(true);
  }, []);

  const handleConvertTableSuggestion = useCallback(async (suggestion: TableSuggestion) => {
    if (convertingSuggestionId) return;
    setConvertingSuggestionId(suggestion.id);
    try {
      const result = await convertTableSuggestion(suggestion.id);
      if (result.success && result.tableId) {
        addNotification(notifySuccess('Table Converted', 'Suggested table has been successfully created.'));
        setIsTablePreviewOpen(false);
        setPreviewSuggestion(null);
        await loadBaseline();
        await loadSuggestions();
        await loadTableDetail(result.tableId);
      }
    } catch (err: any) {
      addNotification(notifyError('Conversion Failed', err.message || 'Failed to convert table suggestion'));
    } finally {
      setConvertingSuggestionId(null);
    }
  }, [addNotification, loadBaseline, loadSuggestions, loadTableDetail, convertingSuggestionId]);

  return {
    activeTable,
    setActiveTable,
    tableLoading,
    sidebarTab,
    setSidebarTab,
    selectedSegmentIds,
    isTableCreationOpen,
    setIsTableCreationOpen,
    isCreatingTable,
    deleteTableModal,
    setDeleteTableModal,
    detectingTables,
    isTablePreviewOpen,
    setIsTablePreviewOpen,
    previewSuggestion,
    convertingSuggestionId,
    loadTableDetail,
    handleToggleSegmentSelection,
    handleSelectAllSegments,
    handleCreateTable,
    handleDeleteTable,
    confirmDeleteTable,
    handleIgnoreTableSuggestion,
    handleDetectTables,
    handlePreviewTableSuggestion,
    handleConvertTableSuggestion,
  };
}
