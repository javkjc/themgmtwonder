import { apiFetchJson } from '../api';

export type BaselineStatus = 'draft' | 'reviewed' | 'confirmed' | 'archived';

export type BaselineUtilizationType =
  | 'record_created'
  | 'process_committed'
  | 'data_exported'
  | null;

export interface AssignmentValidation {
  valid: boolean;
  error?: string;
  suggestedCorrection?: string;
}

export interface Assignment {
  id: string;
  fieldKey: string;
  assignedValue: string | null;
  sourceSegmentId: string | null;
  assignedBy: string;
  assignedAt: string;
  correctedFrom: string | null;
  correctionReason: string | null;
  validation?: AssignmentValidation;
  suggestionConfidence?: number | null;
  suggestionAccepted?: boolean | null;
  modelVersionId?: string | null;
}

export interface Segment {
  id: string;
  text: string;
  confidence: string | null;
  boundingBox: any;
  pageNumber: number | null;
}

import { Table } from './tables';

export interface Baseline {
  id: string;
  attachmentId: string;
  status: BaselineStatus;
  confirmedAt: string | null;
  confirmedBy: string | null;
  utilizedAt: string | null;
  utilizationType: BaselineUtilizationType;
  utilizationMetadata?: Record<string, any> | null;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  assignments?: Assignment[];
  segments?: Segment[];
  tables?: Table[];
}

export interface AssignPayload {
  fieldKey: string;
  assignedValue: string;
  sourceSegmentId?: string;
  correctionReason?: string;
  confirmInvalid?: boolean;
  suggestionAccepted?: boolean;
  correctedFrom?: string;
  suggestionConfidence?: number;
  modelVersionId?: string;
}

export interface AssignmentUpsertResponse {
  assignment: Assignment;
  validation: AssignmentValidation;
}

export interface GenerateSuggestionsResponse {
  suggestedAssignments: Array<{
    fieldKey: string;
    assignedValue: string;
    confidence: number;
    sourceSegmentId: string | null;
  }>;
  modelVersionId: string | null;
  suggestionCount: number;
}

export async function upsertAssignment(
  baselineId: string,
  payload: AssignPayload,
): Promise<AssignmentUpsertResponse> {
  return apiFetchJson(`/baselines/${baselineId}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface DeleteAssignmentResponse {
  deleted: boolean;
}

export interface DeleteAssignmentPayload {
  reason?: string;
  suggestionRejected?: boolean;
  suggestionConfidence?: number;
  modelVersionId?: string;
}

export async function deleteAssignment(
  baselineId: string,
  fieldKey: string,
  payload?: DeleteAssignmentPayload | string | null,
): Promise<DeleteAssignmentResponse> {
  const body = typeof payload === 'string'
    ? { reason: payload }
    : payload || {};

  return apiFetchJson(`/baselines/${baselineId}/assign/${fieldKey}`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}

export async function fetchBaselineForAttachment(
  attachmentId: string,
): Promise<Baseline | null> {
  return apiFetchJson(`/attachments/${attachmentId}/baseline`, {
    method: 'GET',
  });
}

export async function listAssignments(baselineId: string): Promise<Assignment[]> {
  return apiFetchJson(`/baselines/${baselineId}/assignments`, {
    method: 'GET',
  }) as Promise<Assignment[]>;
}

export async function createDraftBaseline(
  attachmentId: string,
): Promise<Baseline> {
  return apiFetchJson(`/attachments/${attachmentId}/baseline/draft`, {
    method: 'POST',
  });
}

export async function markBaselineReviewed(
  baselineId: string,
): Promise<Baseline> {
  return apiFetchJson(`/baselines/${baselineId}/review`, {
    method: 'POST',
  });
}

export async function confirmBaseline(baselineId: string): Promise<Baseline> {
  return apiFetchJson(`/baselines/${baselineId}/confirm`, {
    method: 'POST',
  });
}

export async function generateSuggestions(
  baselineId: string,
): Promise<GenerateSuggestionsResponse> {
  return apiFetchJson(`/baselines/${baselineId}/suggestions/generate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
