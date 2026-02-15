import { apiFetchJson } from '../api';

export interface MlMetrics {
    acceptRate: number;
    modifyRate: number;
    clearRate: number;
    top1Accuracy: number;
    totalActed: number;
    fieldConfusion: Array<{
        fieldKey: string;
        accepted: number;
        modified: number;
        cleared: number;
        accuracy: number;
    }>;
}

export async function fetchMlMetrics(startDate?: string, endDate?: string): Promise<MlMetrics> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetchJson(`/admin/ml/metrics${query}`);
}
