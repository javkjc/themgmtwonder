export type ReviewTier = 'auto_confirm' | 'verify' | 'flag';

export type ReviewManifestFieldDto = {
  fieldKey: string;
  suggestedValue: string | null;
  confidenceScore: number | null;
  tier: ReviewTier | null;
  zone: string | null;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  pageNumber: number;
  extractionMethod: string | null;
  suggestionAccepted: boolean | null;
};

export type SimilarContextEntryDto = {
  value: string;
  confirmedAt: string;
  similarity: number;
};

export type ReviewManifestDto = {
  baselineId: string;
  attachmentId: string;
  pageCount: number;
  fields: ReviewManifestFieldDto[];
  similarContext: Record<string, SimilarContextEntryDto[]>;
  tierCounts: {
    flag: number;
    verify: number;
    auto_confirm: number;
  };
};
