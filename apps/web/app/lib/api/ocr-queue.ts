import { apiFetchJson } from '../api';

export type OcrJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type OcrJob = {
  id: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  status: OcrJobStatus;
  requestedAt: string;
  startedAt: string | null;
  completedAt?: string | null;
  error?: string | null;
  todoId: string;
  todoTitle: string;
};

export async function fetchOcrJobs(): Promise<OcrJob[]> {
  const data = await apiFetchJson('/ocr/jobs', { method: 'GET' });
  return Array.isArray(data) ? (data as OcrJob[]) : [];
}

export async function dismissOcrJob(jobId: string) {
  return apiFetchJson(`/ocr/jobs/${jobId}/dismiss`, { method: 'POST' });
}

export async function cancelOcrJob(jobId: string) {
  return apiFetchJson(`/ocr/jobs/${jobId}/cancel`, { method: 'POST' });
}

export async function retryOcrJob(jobId: string) {
  return apiFetchJson(`/ocr/jobs/${jobId}/retry`, { method: 'POST' });
}
