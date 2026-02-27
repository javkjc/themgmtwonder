import { apiFetchJson } from '../api';

export interface ConfirmOcrPayload {
  editedExtractedText?: string;
}

/**
 * Confirm a draft OCR output.
 * Calls POST /ocr/:ocrId/confirm
 */
export async function confirmOcrOutput(ocrId: string, payload: ConfirmOcrPayload = {}) {
  return apiFetchJson(`/ocr/${ocrId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Archive a confirmed OCR output.
 * Calls POST /ocr/:ocrId/archive
 */
export async function archiveOcrOutput(ocrId: string, archiveReason: string) {
  return apiFetchJson(`/ocr/${ocrId}/archive`, {
    method: 'POST',
    body: JSON.stringify({ archiveReason }),
  });
}

// ============================
// v8 Evidence Review (Task 5)
// ============================

export interface OcrCorrectionHistoryItem {
  id: string;
  ocrResultId?: string;
  correctedBy: string;
  originalValue: string | null;
  correctedValue: string;
  correctionReason: string | null;
  createdAt: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrField {
  id: string;
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'currency' | null;
  originalValue: string | null;
  currentValue: string | null;
  confidence: number | null;
  boundingBox: BoundingBox | null;
  pageNumber: number | null;
  isCorrected: boolean;
  correctionHistory?: OcrCorrectionHistoryItem[]; // depending on backend shape
  latestCorrectionAt?: string | null;
}

export interface OcrManualFieldPayload {
  fieldName: string;
  fieldValue: string;
  fieldType: 'text' | 'number' | 'date' | 'currency';
  reason: string;
}

export interface OcrResultsWithCorrectionsResponse {
  attachmentId: string;
  attachment: {
    id: string;
    filename: string;
    mimeType: string;
    todoId: string;
  };
  rawOcr: {
    id: string;
    extractedText: string;
    status: string;
    createdAt: string;
  } | null;
  documentTypeId?: string | null;
  utilizationType?: string | null;
  parsedFields: OcrField[];
}


/**
 * Get OCR results (parsed fields + correction history) for an attachment.
 * Calls GET /attachments/:attachmentId/ocr/results
 */
export async function fetchAttachmentOcrResults(
  attachmentId: string
): Promise<OcrResultsWithCorrectionsResponse> {
  return apiFetchJson(`/attachments/${attachmentId}/ocr/results`, {
    method: 'GET',
  });
}

/**
 * Create a correction for an OCR result field.
 * Calls POST /ocr-results/:ocrResultId/corrections
 */
export async function createOcrCorrection(
  ocrResultId: string,
  payload: { correctedValue: string; correctionReason?: string }
): Promise<OcrCorrectionHistoryItem> {
  return apiFetchJson(`/ocr-results/${ocrResultId}/corrections`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch correction history for an OCR result.
 * Calls GET /ocr-results/:ocrResultId/corrections
 */
export async function fetchOcrCorrectionHistory(
  ocrResultId: string
): Promise<OcrCorrectionHistoryItem[]> {
  return apiFetchJson(`/ocr-results/${ocrResultId}/corrections`, {
    method: 'GET',
  });
}

export interface AttachmentOcrOutput {
  id: string;
  attachmentId: string;
  extractedText: string | null;
  status: 'draft' | 'confirmed' | 'archived';
  processingStatus: 'pending' | 'completed' | 'failed';
  utilizationType: string | null;
  createdAt: string;
}

/**
 * Fetch current confirmed OCR output for an attachment.
 * Calls GET /attachments/:attachmentId/ocr/current
 */
export async function fetchCurrentConfirmedOcr(
  attachmentId: string
): Promise<AttachmentOcrOutput | null> {
  return apiFetchJson(`/attachments/${attachmentId}/ocr/current`, {
    method: 'GET',
  });
}

/**
 * Check redo eligibility for an attachment.
 * Calls GET /attachments/:attachmentId/ocr/redo-eligibility
 */
export async function fetchOcrRedoEligibility(
  attachmentId: string
): Promise<{
  allowed: boolean;
  reason?: string;
  currentOcr?: AttachmentOcrOutput | null;
}> {
  return apiFetchJson(`/attachments/${attachmentId}/ocr/redo-eligibility`, {
    method: 'GET',
  });
}

/**
 * Manually add a structured field to an OCR output.
 * Calls POST /ocr/:ocrId/fields
 */
export async function createManualOcrField(
  ocrId: string,
  payload: OcrManualFieldPayload,
): Promise<OcrField> {
  return apiFetchJson(`/ocr/${ocrId}/fields`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Manually delete a structured field from an OCR output.
 * Calls DELETE /ocr-results/:fieldId
 */
export async function deleteOcrField(
  fieldId: string,
  reason: string
): Promise<{ success: boolean }> {
  return apiFetchJson(`/ocr-results/${fieldId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}
