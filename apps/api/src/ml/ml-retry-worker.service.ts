import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  attachmentOcrOutputs,
  extractedTextSegments,
  extractionRetryJobs,
} from '../db/schema';
import { fieldLibrary } from '../field-library/schema';
import { MathReconciliationService } from './math-reconciliation.service';
import { normalizeFieldValue } from './field-value-normalizer';

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

@Injectable()
export class MlRetryWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MlRetryWorkerService.name);
  private readonly mlServiceUrl: string;
  private readonly retryIntervalMs = 5000;
  private readonly maxMathRetries = 1;
  private readonly requestTimeoutMs = 15000;
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(
    private readonly dbs: DbService,
    private readonly configService: ConfigService,
    private readonly mathReconciliationService: MathReconciliationService,
  ) {
    this.mlServiceUrl =
      this.configService.get<string>('ML_SERVICE_URL') || 'http://ml-service:5000';
  }

  onModuleInit(): void {
    const enabled =
      String(this.configService.get<string>('ML_MATH_RETRY_ENABLED') ?? 'false')
        .trim()
        .toLowerCase() === 'true';
    if (!enabled) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runTick();
    }, this.retryIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runTick(): Promise<void> {
    if (this.tickInFlight) {
      return;
    }
    this.tickInFlight = true;

    try {
      const [job] = await this.dbs.db
        .select()
        .from(extractionRetryJobs)
        .where(eq(extractionRetryJobs.status, 'PENDING'))
        .orderBy(asc(extractionRetryJobs.createdAt))
        .limit(1);

      if (!job) {
        return;
      }

      if (job.retryCount >= this.maxMathRetries) {
        await this.markFailed(
          job.id,
          `retry_count_guard_exceeded:${job.retryCount}`,
          job.retryCount,
        );
        return;
      }

      await this.dbs.db
        .update(extractionRetryJobs)
        .set({
          status: 'RUNNING',
          retryCount: job.retryCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(extractionRetryJobs.id, job.id));

      await this.processRunningJob(job.id);
    } catch (error) {
      this.logger.error(
        `retry_worker_tick_failed ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.tickInFlight = false;
    }
  }

  private async processRunningJob(jobId: string): Promise<void> {
    const [job] = await this.dbs.db
      .select()
      .from(extractionRetryJobs)
      .where(and(eq(extractionRetryJobs.id, jobId), eq(extractionRetryJobs.status, 'RUNNING')))
      .limit(1);

    if (!job) {
      return;
    }

    try {
      if (job.retryCount >= this.maxMathRetries + 1) {
        await this.markFailed(
          job.id,
          `retry_count_guard_exceeded:${job.retryCount}`,
          job.retryCount,
        );
        return;
      }

      const [currentOcr] = await this.dbs.db
        .select({
          id: attachmentOcrOutputs.id,
          documentTypeId: attachmentOcrOutputs.documentTypeId,
          extractionPath: attachmentOcrOutputs.extractionPath,
          metadata: attachmentOcrOutputs.metadata,
        })
        .from(attachmentOcrOutputs)
        .where(
          and(
            eq(attachmentOcrOutputs.attachmentId, job.attachmentId),
            eq(attachmentOcrOutputs.isCurrent, true),
          ),
        )
        .limit(1);

      if (!currentOcr) {
        throw new Error('current OCR output not found for retry job');
      }

      const sourceSegments = await this.dbs.db
        .select({
          id: extractedTextSegments.id,
          text: extractedTextSegments.text,
          boundingBox: extractedTextSegments.boundingBox,
          pageNumber: extractedTextSegments.pageNumber,
          confidence: extractedTextSegments.confidence,
        })
        .from(extractedTextSegments)
        .where(eq(extractedTextSegments.attachmentOcrOutputId, currentOcr.id));

      const failingYMin = this.parseNumeric(job.failingYMin, 0);
      const failingYMax = this.parseNumeric(job.failingYMax, 1);

      const filteredSegments = sourceSegments.filter((segment) => {
        const bbox = this.toBoundingBox(segment.boundingBox);
        if (!bbox) return false;
        return bbox.y >= failingYMin && bbox.y <= failingYMax;
      });

      if (filteredSegments.length === 0) {
        throw new Error('no OCR segments in failing y-band');
      }

      const serializeSegments = filteredSegments.map((segment) => ({
        text: segment.text,
        boundingBox: this.toBoundingBox(segment.boundingBox),
        pageNumber: segment.pageNumber ?? 0,
        zone: 'unknown',
      }));

      const pageWidth = this.parsePageDimension(currentOcr.metadata, 'pageWidth');
      const pageHeight = this.parsePageDimension(currentOcr.metadata, 'pageHeight');

      const serializedText = await this.serializeForRetry(serializeSegments, pageWidth);
      const focusedSystemMessage = `The following fields failed math reconciliation: ${job.failingFieldKeys.join(', ')}. Re-examine only the provided sub-document region and return corrected values.`;

      const retryFields = await this.loadRetryFields(job.failingFieldKeys);
      if (retryFields.length === 0) {
        throw new Error('failing fields not found in field library');
      }

      const suggestions = await this.requestRetrySuggestions({
        baselineId: job.baselineId,
        documentTypeId: currentOcr.documentTypeId ?? undefined,
        segments: filteredSegments.map((segment) => ({
          id: segment.id,
          text: segment.text,
          boundingBox: this.toBoundingBox(segment.boundingBox) ?? undefined,
          pageNumber: segment.pageNumber ?? 0,
          confidence: this.parseNumeric(segment.confidence, 0),
        })),
        fields: retryFields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.characterType ?? 'text',
        })),
        pageWidth,
        pageHeight,
        pageType: currentOcr.extractionPath === 'text_layer' ? 'digital' : 'scanned',
        ragExamples: [
          {
            serializedText: `${focusedSystemMessage}\n\n${serializedText}`,
            confirmedFields: {},
          },
        ],
      });

      const valueByField = new Map<string, string>();
      const mathInputs: Array<{
        fieldKey: string;
        normalizedValue: string | null;
        pageNumber: number | null;
        boundingBox: BoundingBox | null;
      }> = [];
      const fieldTypeByKey = new Map(
        retryFields.map((field) => [field.fieldKey, field.characterType ?? 'text']),
      );

      for (const suggestion of suggestions) {
        const rawValue = String(suggestion.suggestedValue ?? '').trim();
        if (!rawValue) {
          continue;
        }
        const fieldType = fieldTypeByKey.get(suggestion.fieldKey) ?? 'text';
        const norm = normalizeFieldValue({ rawValue, fieldType });
        valueByField.set(suggestion.fieldKey, rawValue);
        mathInputs.push({
          fieldKey: suggestion.fieldKey,
          normalizedValue: norm.normalizedValue,
          pageNumber: null,
          boundingBox: this.toBoundingBox(suggestion.boundingBox),
        });
      }

      const mathResult = await this.mathReconciliationService.reconcile(
        currentOcr.documentTypeId ?? null,
        mathInputs,
      );

      let mathPasses = true;
      for (const fieldKey of job.failingFieldKeys) {
        const patch = mathResult.get(fieldKey);
        const value = valueByField.get(fieldKey);
        if (!value) {
          mathPasses = false;
          break;
        }
        if (patch?.validationOverride === 'math_reconciliation_failed') {
          mathPasses = false;
          break;
        }
      }

      if (mathPasses) {
        const finalValues = Object.fromEntries(valueByField.entries());
        await this.dbs.db
          .update(extractionRetryJobs)
          .set({
            status: 'COMPLETED',
            finalValues,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(extractionRetryJobs.id, job.id));
        return;
      }

      await this.markFailed(job.id, 'math_reconciliation_failed_after_retry', job.retryCount);
    } catch (error) {
      await this.markFailed(
        job.id,
        error instanceof Error ? error.message : String(error),
        job.retryCount,
      );
    }
  }

  private async markFailed(
    jobId: string,
    message: string,
    retryCount: number,
  ): Promise<void> {
    await this.dbs.db
      .update(extractionRetryJobs)
      .set({
        status: 'RECONCILIATION_FAILED',
        errorMessage: message,
        retryCount: Math.max(retryCount, 1),
        updatedAt: new Date(),
      })
      .where(eq(extractionRetryJobs.id, jobId));
  }

  private async loadRetryFields(fieldKeys: string[]): Promise<
    Array<{
      fieldKey: string;
      label: string;
      characterType: string | null;
    }>
  > {
    if (fieldKeys.length === 0) {
      return [];
    }

    return this.dbs.db
      .select({
        fieldKey: fieldLibrary.fieldKey,
        label: fieldLibrary.label,
        characterType: fieldLibrary.characterType,
      })
      .from(fieldLibrary)
      .where(
        and(
          eq(fieldLibrary.status, 'active'),
          inArray(fieldLibrary.fieldKey, fieldKeys),
        ),
      );
  }

  private async serializeForRetry(
    segments: Array<{
      text: string;
      boundingBox: BoundingBox | null;
      pageNumber: number;
      zone: string;
    }>,
    pageWidth: number,
  ): Promise<string> {
    const payload = await this.postMlEndpoint('/ml/serialize', {
      segments,
      pageWidth,
    });
    if (typeof payload?.serializedText !== 'string') {
      throw new Error('serialize payload missing serializedText');
    }
    return payload.serializedText;
  }

  private async requestRetrySuggestions(payload: {
    baselineId: string;
    documentTypeId?: string;
    segments: Array<{
      id: string;
      text: string;
      boundingBox?: BoundingBox;
      pageNumber: number;
      confidence: number;
    }>;
    fields: Array<{ fieldKey: string; label: string; fieldType: string }>;
    pageWidth: number;
    pageHeight: number;
    pageType: 'digital' | 'scanned';
    ragExamples: Array<{ serializedText: string; confirmedFields: Record<string, unknown> }>;
  }): Promise<Array<{ fieldKey: string; suggestedValue: string | null; boundingBox?: unknown }>> {
    const response = await this.postMlEndpoint('/ml/suggest-fields', payload);
    const suggestions = response?.suggestions;
    if (!Array.isArray(suggestions)) {
      throw new Error('suggest-fields payload missing suggestions');
    }
    return suggestions as Array<{
      fieldKey: string;
      suggestedValue: string | null;
      boundingBox?: unknown;
    }>;
  }

  private async postMlEndpoint(
    endpoint: '/ml/serialize' | '/ml/suggest-fields',
    payload: unknown,
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(`${this.mlServiceUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`${endpoint} http status ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseNumeric(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }

  private toBoundingBox(value: unknown): BoundingBox | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    const x = this.parseNumeric(candidate.x, Number.NaN);
    const y = this.parseNumeric(candidate.y, Number.NaN);
    const width = this.parseNumeric(candidate.width, Number.NaN);
    const height = this.parseNumeric(candidate.height, Number.NaN);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return null;
    }
    return { x, y, width, height };
  }

  private parsePageDimension(
    metadata: string | null,
    key: 'pageWidth' | 'pageHeight',
  ): number {
    if (!metadata) {
      return 1000;
    }
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>;
      const value = parsed[key] ?? parsed[key === 'pageWidth' ? 'page_width' : 'page_height'];
      const numeric = this.parseNumeric(value, 1000);
      return numeric > 0 ? numeric : 1000;
    } catch {
      return 1000;
    }
  }
}
