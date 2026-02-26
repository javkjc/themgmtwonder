import { apiFetchJson } from '../api';

export interface AliasRule {
  id: string;
  vendorId: string;
  fieldKey: string;
  rawPattern: string;
  correctedValue: string;
  status: 'proposed' | 'active' | 'rejected';
  correctionEventCount: number;
  proposedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

export async function fetchAliasRules(
  status: 'proposed' | 'active' | 'rejected' = 'proposed',
): Promise<AliasRule[]> {
  return apiFetchJson(`/admin/rules?status=${status}`);
}

export async function approveAliasRule(
  id: string,
): Promise<{ ok: boolean; rule: AliasRule }> {
  return apiFetchJson(`/admin/rules/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function rejectAliasRule(
  id: string,
): Promise<{ ok: boolean; rule: AliasRule }> {
  return apiFetchJson(`/admin/rules/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
