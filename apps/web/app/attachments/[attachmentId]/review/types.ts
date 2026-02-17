import type { Notification } from '@/app/components/NotificationToast';
import type {
  Baseline,
  Segment,
  Assignment,
  AssignPayload,
  DeleteAssignmentPayload,
} from '@/app/lib/api/baselines';
import type {
  OcrField,
  OcrCorrectionHistoryItem,
  OcrResultsWithCorrectionsResponse,
  OcrManualFieldPayload,
} from '@/app/lib/api/ocr';
import type {
  FullTableResponse,
  Table,
  TableSuggestion,
  CreateTablePayload,
} from '@/app/lib/api/tables';
import type { Me } from '@/app/types';

export type {
  Baseline,
  Segment,
  Assignment,
  AssignPayload,
  DeleteAssignmentPayload,
  OcrField,
  OcrCorrectionHistoryItem,
  OcrResultsWithCorrectionsResponse,
  OcrManualFieldPayload,
  FullTableResponse,
  Table,
  TableSuggestion,
  CreateTablePayload,
  Me,
  Notification,
};

export type ResetLocalField = {
  key: string;
  version: number;
};

export type CorrectionPendingAction = {
  type: 'upsert' | 'delete';
  fieldKey: string;
  value?: string;
  sourceSegmentId?: string;
} | null;

export type ValidationPendingAction = {
  fieldKey: string;
  fieldLabel: string;
  value: string;
  sourceSegmentId?: string;
  validationError: string;
  suggestedCorrection?: string;
} | null;

export type FieldChangeLogEntry = {
  id: string;
  timestamp: number;
  label: string;
  detail?: string;
  target?: { fieldKey: string };
};

export type SidebarTab = 'fields' | 'tables';
export type MobileTab = 'document' | 'text' | 'fields';
