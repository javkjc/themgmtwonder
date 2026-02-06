import { apiFetchJson } from '../api';

export type BaselineStatus = 'draft' | 'reviewed' | 'confirmed' | 'archived';

export type BaselineUtilizationType =
  | 'record_created'
  | 'process_committed'
  | 'data_exported'
  | null;

export interface Assignment {
  id: string;
  fieldKey: string;
  assignedValue: string | null;
  sourceSegmentId: string | null;
  assignedBy: string;
  assignedAt: string;
  correctedFrom: string | null;
  correctionReason: string | null;
}

export interface Segment {
  id: string;
  text: string;
  confidence: string | null;
  boundingBox: any;
  pageNumber: number | null;
}

export interface Baseline {
  id: string;
  attachmentId: string;
  status: BaselineStatus;
  confirmedAt: string | null;
  confirmedBy: string | null;
  utilizedAt: string | null;
  utilizationType: BaselineUtilizationType;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  assignments?: Assignment[];
  segments?: Segment[];
}

export interface AssignPayload {
  fieldKey: string;
  assignedValue: string;
  sourceSegmentId?: string;
  correctionReason?: string;
}

export async function upsertAssignment(baselineId: string, payload: AssignPayload): Promise<any> {
  return apiFetchJson(`/baselines/${baselineId}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteAssignment(baselineId: string, fieldKey: string, reason?: string | null): Promise<any> {
  const payload = reason ? { correctionReason: reason } : {};
  return apiFetchJson(`/baselines/${baselineId}/assign/${fieldKey}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export async function fetchBaselineForAttachment(
  attachmentId: string,
): Promise<Baseline | null> {
  return apiFetchJson(`/attachments/${attachmentId}/baseline`, {
    method: 'GET',
  });
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
