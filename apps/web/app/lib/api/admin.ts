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

export interface MlPerformanceGateStatus {
    onlineGateMet: boolean;
    onlineDelta: number;
    onlineSuggestionCount: number;
}

export interface MlPerformanceModel {
    id: string;
    modelName: string;
    version: string;
    trainedAt: string;
    isActive: boolean;
    suggestions: number;
    accepted: number;
    acceptanceRate: number;
    gateStatus: MlPerformanceGateStatus;
}

export interface MlPerformanceTrendPoint {
    weekStart: string;
    suggestions: number;
    accepted: number;
    acceptanceRate: number;
}

export interface MlConfidenceHistogramBand {
    band: string;
    count: number;
}

export interface MlPerformanceRecommendation {
    type: 'promote_candidate';
    candidateVersionId: string;
    candidateVersion: string;
    activeVersionId: string;
    activeVersion: string;
    acceptanceDelta: number;
    candidateSuggestions: number;
}

export interface MlPerformance {
    activeModel: MlPerformanceModel | null;
    candidateModel: MlPerformanceModel | null;
    models: MlPerformanceModel[];
    trend: MlPerformanceTrendPoint[];
    confidenceHistogram: MlConfidenceHistogramBand[];
    recommendation?: MlPerformanceRecommendation;
}

export async function fetchMlPerformance(startDate?: string, endDate?: string): Promise<MlPerformance> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetchJson(`/admin/ml/performance${query}`);
}

export async function activateMlModel(version: string): Promise<{ ok: boolean; activeVersion: string }> {
    return apiFetchJson('/admin/ml/models/activate', {
        method: 'POST',
        body: JSON.stringify({ version }),
    });
}
