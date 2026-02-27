import { Injectable, Logger } from '@nestjs/common';

interface ClassifyDocumentTypeResponse {
  ok: boolean;
  matchedName: string | null;
  confidence: number;
}

@Injectable()
export class DocumentClassifierService {
  private readonly logger = new Logger(DocumentClassifierService.name);
  private readonly mlServiceUrl = process.env.ML_SERVICE_URL ?? 'http://ml-service:5000';
  private readonly timeoutMs = 8000;

  async classifyDocumentType(
    text: string,
    documentTypeNames: string[],
  ): Promise<ClassifyDocumentTypeResponse> {
    const sanitizedNames = documentTypeNames
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const payload = {
      text: (text ?? '').slice(0, 800),
      documentTypeNames: sanitizedNames,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.mlServiceUrl}/ml/classify-document-type`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Document type classification request failed with status ${response.status}`,
        );
        return { ok: false, matchedName: null, confidence: 0 };
      }

      const body = (await response.json()) as Partial<ClassifyDocumentTypeResponse>;
      return {
        ok: Boolean(body.ok),
        matchedName:
          typeof body.matchedName === 'string' && body.matchedName.trim().length > 0
            ? body.matchedName
            : null,
        confidence:
          typeof body.confidence === 'number' && Number.isFinite(body.confidence)
            ? body.confidence
            : 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Document type classification request failed: ${errorMessage}`);
      return { ok: false, matchedName: null, confidence: 0 };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
