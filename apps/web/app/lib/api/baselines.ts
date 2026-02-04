import { apiFetchJson } from '../api';

export type BaselineStatus = 'draft' | 'reviewed' | 'confirmed' | 'archived';

export type BaselineUtilizationType =
  | 'record_created'
  | 'workflow_committed'
  | 'data_exported'
  | null;

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
