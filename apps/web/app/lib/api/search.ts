import { apiFetchJson } from '../api';

export interface SearchResult {
    baselineId: string | null;
    attachmentId: string | null;
    similarity: number;
    confirmedAt: string;
    documentTypeId: string | null;
    fieldPreview: { fieldKey: string; value: string }[];
}

export interface SearchResponse {
    results: SearchResult[];
}

export async function fetchExtractionsSearch(
    query: string,
    filters?: {
        documentType?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
    }
): Promise<SearchResponse> {
    const params = new URLSearchParams();
    params.append('q', query);

    if (filters?.documentType) params.append('documentType', filters.documentType);
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    if (filters?.limit) params.append('limit', filters.limit.toString());

    return apiFetchJson(`/search/extractions?${params.toString()}`);
}
