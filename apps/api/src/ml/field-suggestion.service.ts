import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  extractionBaselines,
  extractedTextSegments,
  attachmentOcrOutputs,
  baselineFieldAssignments,
  extractionRetryJobs,
  mlModelVersions,
  extractionModels,
  auditLogs,
  documentTypeFields,
} from '../db/schema';
import { fieldLibrary } from '../field-library/schema';
import { MlService } from './ml.service';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../common/authorization.service';
import { FieldAssignmentValidatorService } from '../baseline/field-assignment-validator.service';
import {
  processSuggestion,
  detectConflictingZones,
  ProcessedSuggestion,
} from './field-type-validator';
import { normalizeFieldValue } from './field-value-normalizer';
import { MathReconciliationService } from './math-reconciliation.service';
import {
  RagRetrievedExample,
  RagRetrievalService,
} from './rag-retrieval.service';
import { AliasEngineService } from './alias-engine.service';

export interface SuggestionSummary {
  suggestedAssignments: Array<{
    fieldKey: string;
    assignedValue: string;
    confidence: number;
    tier: 'auto_confirm' | 'verify' | 'flag';
    sourceSegmentId: string | null;
    pageNumber?: number | null;
    zone?: string;
    boundingBox?: Record<string, number> | null;
    extractionMethod?: string;
    finalScore?: number;
    validationOverride?: string | null;
  }>;
  modelVersionId: string;
  suggestionCount: number;
  status?: 'preliminary';
  retryJobId?: string;
  failingFieldKeys?: string[];
}

type AbGroup = 'A' | 'B';

interface SelectedModel {
  id: string;
  version: string;
  filePath: string;
  abGroup: AbGroup;
}

interface ProcessedSuggestionWithPage extends ProcessedSuggestion {
  pageNumber: number | null;
}

interface PreparedSuggestionForPersistence {
  processed: ProcessedSuggestion;
  assignedValue: string;
  pageNumber: number | null;
  normalizedValue: string | null;
  normalizationError: string | null;
}

type SegmentForMl = typeof extractedTextSegments.$inferSelect & {
  aliasApplied?: boolean;
};

@Injectable()
export class FieldSuggestionService {
  private readonly logger = new Logger(FieldSuggestionService.name);
  private isOllamaBusy = false;
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_REQUESTS_PER_HOUR = 1000;
  private readonly DEFAULT_AUTOCONFIRM_THRESHOLD = 0.9;
  private readonly DEFAULT_VERIFY_THRESHOLD = 0.7;
  private readonly requestTimeoutMs = 5000;
  private readonly mlServiceUrl: string;
  private cachedTierThresholds:
    | { autoConfirmThreshold: number; verifyThreshold: number }
    | null = null;

  constructor(
    private readonly dbs: DbService,
    private readonly mlService: MlService,
    private readonly auditService: AuditService,
    private readonly authService: AuthorizationService,
    private readonly validator: FieldAssignmentValidatorService,
    private readonly configService: ConfigService,
    private readonly mathReconciliationService: MathReconciliationService,
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly aliasEngineService: AliasEngineService,
  ) {
    this.mlServiceUrl =
      this.configService.get<string>('ML_SERVICE_URL') ||
      'http://ml-service:5000';
  }

  async generateSuggestions(
    baselineId: string,
    userId: string,
    prefetchOnly = false,
  ): Promise<SuggestionSummary> {
    if (!prefetchOnly) {
      let waited = 0;
      while (this.isOllamaBusy && waited < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        waited += 500;
      }
      if (this.isOllamaBusy) {
        throw new HttpException(
          'Service is busy processing another request',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.isOllamaBusy = true;
    }

    try {
      // 1. Verify ownership and baseline status
      const context = await this.authService.ensureUserOwnsBaseline(
        userId,
        baselineId,
      );

      if (context.status === 'archived') {
        throw new BadRequestException(
          'Cannot generate suggestions for archived baseline',
        );
      }

      if (context.utilizationType || context.utilizedAt) {
        throw new BadRequestException(
          'Cannot generate suggestions for utilized baseline',
        );
      }

      if (context.status === 'confirmed') {
        throw new BadRequestException(
          'Cannot generate suggestions for a confirmed baseline',
        );
      }

      // 2. Rate limit check
      await this.enforceRateLimit(userId);

      // 3. Load baseline segments
      const [baseline] = await this.dbs.db
        .select()
        .from(extractionBaselines)
        .where(eq(extractionBaselines.id, baselineId))
        .limit(1);

      if (!baseline) {
        throw new NotFoundException('Baseline not found');
      }

      const [currentOcr] = await this.dbs.db
        .select()
        .from(attachmentOcrOutputs)
        .where(
          and(
            eq(attachmentOcrOutputs.attachmentId, baseline.attachmentId),
            eq(attachmentOcrOutputs.isCurrent, true),
          ),
        )
        .limit(1);

      if (!currentOcr) {
        throw new NotFoundException('No OCR output found for this baseline');
      }

      const segments = await this.dbs.db
        .select()
        .from(extractedTextSegments)
        .where(eq(extractedTextSegments.attachmentOcrOutputId, currentOcr.id));

      if (segments.length === 0) {
        this.logger.warn('No segments found for baseline', { baselineId });
        return {
          suggestedAssignments: [],
          modelVersionId: 'none',
          suggestionCount: 0,
        };
      }

      // 4. Load active fields
      let activeFields: any[];
      if (currentOcr.documentTypeId) {
        const rows = await this.dbs.db
          .select({ field: fieldLibrary })
          .from(documentTypeFields)
          .innerJoin(
            fieldLibrary,
            eq(documentTypeFields.fieldKey, fieldLibrary.fieldKey),
          )
          .where(
            and(
              eq(documentTypeFields.documentTypeId, currentOcr.documentTypeId),
              eq(fieldLibrary.status, 'active'),
            ),
          )
          .orderBy(documentTypeFields.sortOrder);
        activeFields = rows.map((r) => r.field);
      } else {
        activeFields = await this.dbs.db
          .select()
          .from(fieldLibrary)
          .where(eq(fieldLibrary.status, 'active'));
      }

      if (activeFields.length === 0) {
        this.logger.warn('No active fields in field library');
        return {
          suggestedAssignments: [],
          modelVersionId: 'none',
          suggestionCount: 0,
        };
      }

      // 5. Resolve active model (Step 1 of I3: extraction_models first, fallback to ml_model_versions)
      const selectedModel = await this.selectModelForBaseline(baselineId);

      // 6. Extract page metadata from OCR output metadata for ML request (Step 2 of I3)
      const ocrMeta = this.parseOcrMetadata(currentOcr.metadata);
      const pageWidth: number = ocrMeta.pageWidth ?? 1000;
      const pageHeight: number = ocrMeta.pageHeight ?? 1000;
      const pageType: 'digital' | 'scanned' =
        currentOcr.extractionPath === 'text_layer' ? 'digital' : 'scanned';

      const vendorId = this.resolveVendorId(baseline, currentOcr);
      const segmentsForMl: SegmentForMl[] = vendorId
        ? await this.aliasEngineService.applyAliases(segments, vendorId)
        : segments;
      const serializedText = await this.serializeCurrentDocument(
        segmentsForMl,
        pageWidth,
      );
      const ragExamples = await this.ragRetrievalService.retrieve(
        serializedText,
        currentOcr.documentTypeId,
      );
      this.logger.log(
        `rag.retrieval.used retrievedCount=${ragExamples.length} documentTypeId=${currentOcr.documentTypeId ?? 'null'}`,
      );

      const mlPayload = {
        baselineId,
        documentTypeId: currentOcr.documentTypeId,
        pageWidth,
        pageHeight,
        pageType,
        segments: segmentsForMl.map((s) => {
          const segment: any = {
            id: s.id,
            text: s.text,
            confidence:
              s.confidence === null || s.confidence === undefined
                ? null
                : Number(s.confidence),
            aliasApplied: Boolean(s.aliasApplied),
          };
          if (s.boundingBox) {
            segment.boundingBox = s.boundingBox;
          }
          if (s.pageNumber) {
            segment.pageNumber = s.pageNumber;
          }
          return segment;
        }),
        fields: activeFields.map((f) => ({
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.characterType,
        })),
        ragExamples,
      };

      const mlResult = await this.mlService.suggestFields(mlPayload);

      if (!mlResult.ok || !mlResult.data) {
        this.logger.error('ML service failed', {
          baselineId,
          error: mlResult.error,
        });
        // Graceful degradation: return empty suggestions
        return {
          suggestedAssignments: [],
          modelVersionId: 'none',
          suggestionCount: 0,
        };
      }

      const rawSuggestions = mlResult.data;
      const llmQwenReasoning = mlResult.reasoning ?? null;

      // 7. Use selected model version record
      const modelVersionId = selectedModel.id;

      // 8. Load existing assignments
      const existingAssignments = await this.dbs.db
        .select()
        .from(baselineFieldAssignments)
        .where(eq(baselineFieldAssignments.baselineId, baselineId));

      // 9. Filter suggestions: skip null values and manually-assigned fields.
      //    Qwen returns a suggestion per field — null suggestedValue means the
      //    model found nothing for that field, so drop it.
      const filteredRaw = rawSuggestions.filter((s: any) => {
        if (!s.suggestedValue || !String(s.suggestedValue).trim()) return false;

        const existing = existingAssignments.find(
          (a) => a.fieldKey === s.fieldKey,
        );
        if (!existing) return true;

        const hasManualValue =
          existing.suggestionConfidence === null &&
          existing.assignedValue !== null &&
          String(existing.assignedValue).trim() !== '';

        return !hasManualValue;
      });

      const fieldByKey = new Map(activeFields.map((f) => [f.fieldKey, f]));

      // 10. Run DSPP + type validation + weighted FinalScore per suggestion (Steps 3-5 of I3).
      //     Qwen response shape: { fieldKey, suggestedValue, zone, boundingBox,
      //     extractionMethod, rawOcrConfidence, ragAgreement, modelConfidence: null }.
      //     There is no segmentId — the contributing segment was identified inside ml-service.
      //     sourceSegmentId is stored as null; the FK column is nullable.
      const processedSuggestions: ProcessedSuggestion[] = [];

      for (const rawSug of filteredRaw) {
        const field = fieldByKey.get((rawSug as any).fieldKey);
        if (!field) continue;

        const suggestedValue = String((rawSug as any).suggestedValue ?? '').trim();
        if (!suggestedValue) continue;

        const processed = processSuggestion(
          {
            segmentId: null,
            fieldKey: (rawSug as any).fieldKey,
            confidence: (rawSug as any).rawOcrConfidence ?? 0.0,
            ragAgreement: (rawSug as any).ragAgreement ?? 0.0,
            zone: (rawSug as any).zone ?? 'unknown',
            boundingBox: (rawSug as any).boundingBox ?? null,
            extractionMethod: (rawSug as any).extractionMethod ?? 'qwen-1.5b-rag',
          },
          {
            text: suggestedValue,
            confidence: (rawSug as any).rawOcrConfidence ?? null,
          },
          {
            fieldKey: field.fieldKey,
            characterType: field.characterType,
          },
        );

        processedSuggestions.push(processed);
      }

      // 11. Conflicting field detection (Step 6 of I3)
      detectConflictingZones(processedSuggestions);

      // 12. I5: multi-page conflict scan — Qwen suggestions have no source segment,
      //     so pageNumber is always null. Conflicts across pages cannot be detected
      //     without segment provenance; policy is a no-op for Qwen suggestions.
      const processedForPersistence = this.applyMultiPageFieldConflictPolicy(
        processedSuggestions,
        new Map(), // empty — no segment lookup needed; Qwen suggestions are per-field not per-segment
      );

      // 13. Drop any suggestion whose finalScore was zeroed by type validation or
      //     conflict detection — these are known-bad matches and should not be
      //     persisted or shown to the user. Manual drag-to-assign captures ground
      //     truth for those fields instead.
      const validSuggestions = processedForPersistence.filter(
        (s) => s.finalScore > 0,
      );

      // Normalize first (I4), then run math reconciliation (I6), then persist.
      const suggestedAssignments: SuggestionSummary['suggestedAssignments'] = [];
      const preparedSuggestions: PreparedSuggestionForPersistence[] = [];

      for (const processed of validSuggestions) {
        // Preserve the raw OCR value for human review, do not use cleanedValue as assignedValue.
        const assignedValue = processed.originalValue;
        // Qwen suggestions have no source segment — pageNumber is not available.
        const pageNumber: number | null = null;

        const field = fieldByKey.get(processed.fieldKey);
        const normResult = normalizeFieldValue({
          rawValue: assignedValue,
          fieldType: field?.characterType ?? 'text',
        });

        if (normResult.normalizationError) {
          this.logger.warn(
            `Normalization error for fieldKey=${processed.fieldKey} type=${field?.characterType}: ${normResult.normalizationError}`,
          );
        }

        preparedSuggestions.push({
          processed,
          assignedValue,
          pageNumber,
          normalizedValue: normResult.normalizedValue,
          normalizationError: normResult.normalizationError,
        });
      }

      const mathReconciliation = await this.mathReconciliationService.reconcile(
        currentOcr.documentTypeId,
        preparedSuggestions.map((item) => ({
          fieldKey: item.processed.fieldKey,
          normalizedValue: item.normalizedValue,
        })),
      );

      for (const item of preparedSuggestions) {
        const { processed, assignedValue, pageNumber, normalizedValue, normalizationError } = item;
        const mathPatch = mathReconciliation.get(processed.fieldKey);
        const finalScore = mathPatch?.confidenceScore ?? processed.finalScore;
        const finalValidationOverride: string | null =
          mathPatch?.validationOverride ?? processed.validationOverride;

        const llmReasoningWithNorm: Record<string, unknown> = {
          ...processed.llmReasoning,
          qwenReasoning: llmQwenReasoning,
          normalizationError,
          finalScore,
          ragAgreement: this.resolveRagAgreement(
            processed.fieldKey,
            normalizedValue,
            assignedValue,
            ragExamples,
          ),
          ragRetrievedCount: ragExamples.length,
        };

        if (mathPatch) {
          llmReasoningWithNorm.mathReconciliation = mathPatch.mathReconciliation;
          if (mathPatch.mathDelta) {
            llmReasoningWithNorm.mathDelta = mathPatch.mathDelta;
          }
          if (mathPatch.validationOverride) {
            llmReasoningWithNorm.validationOverride = mathPatch.validationOverride;
          }
          if (mathPatch.failingCheck) {
            llmReasoningWithNorm.failingCheck = mathPatch.failingCheck;
          }
          if (mathPatch.failingRowY !== undefined) {
            llmReasoningWithNorm.failingRowY = mathPatch.failingRowY;
          }
          if (mathPatch.failingYMin !== undefined) {
            llmReasoningWithNorm.failingYMin = mathPatch.failingYMin;
          }
          if (mathPatch.failingYMax !== undefined) {
            llmReasoningWithNorm.failingYMax = mathPatch.failingYMax;
          }
          if (mathPatch.taxRateSuspicious) {
            llmReasoningWithNorm.taxRateSuspicious = true;
          }
        }

        await this.dbs.db
          .insert(baselineFieldAssignments)
          .values({
            baselineId,
            fieldKey: processed.fieldKey,
            assignedValue,
            sourceSegmentId: processed.segmentId,
            assignedBy: userId,
            assignedAt: new Date(),
            suggestionConfidence: processed.confidence.toFixed(2),
            suggestionAccepted: null,
            modelVersionId,
            confidenceScore: finalScore.toFixed(4),
            zone: processed.zone,
            boundingBox: processed.boundingBox as any,
            extractionMethod: processed.extractionMethod,
            llmReasoning: JSON.stringify(llmReasoningWithNorm),
            normalizedValue,
            normalizationError,
          })
          .onConflictDoUpdate({
            target: [
              baselineFieldAssignments.baselineId,
              baselineFieldAssignments.fieldKey,
            ],
            set: {
              assignedValue,
              sourceSegmentId: processed.segmentId,
              assignedBy: userId,
              assignedAt: new Date(),
              suggestionConfidence: processed.confidence.toFixed(2),
              suggestionAccepted: null,
              modelVersionId,
              confidenceScore: finalScore.toFixed(4),
              zone: processed.zone,
              boundingBox: processed.boundingBox as any,
              extractionMethod: processed.extractionMethod,
              llmReasoning: JSON.stringify(llmReasoningWithNorm),
              normalizedValue,
              normalizationError,
            },
          });

        suggestedAssignments.push({
          fieldKey: processed.fieldKey,
          assignedValue,
          confidence: processed.confidence,
          tier: this.deriveTier(finalScore),
          sourceSegmentId: processed.segmentId,
          pageNumber,
          zone: processed.zone,
          boundingBox: processed.boundingBox,
          extractionMethod: processed.extractionMethod,
          finalScore,
          validationOverride: finalValidationOverride,
        });
      }

      // 14. Log audit event
      await this.auditService.log({
        userId,
        action: 'ml.suggest.generate',
        module: 'ml',
        resourceType: 'baseline',
        resourceId: baselineId,
        details: {
          baselineId,
          abGroup: selectedModel.abGroup,
          modelVersionId,
          modelVersion: selectedModel.version,
          count: suggestedAssignments.length,
          totalSegments: segmentsForMl.length,
          totalFields: activeFields.length,
          pageWidth,
          pageHeight,
          pageType,
        },
      });

      const retryEnabled =
        String(this.configService.get<string>('ML_MATH_RETRY_ENABLED') ?? 'false')
          .trim()
          .toLowerCase() === 'true';
      const failingSuggestions = suggestedAssignments.filter(
        (assignment) =>
          assignment.validationOverride === 'math_reconciliation_failed',
      );

      let retryJobId: string | null = null;
      if (retryEnabled && failingSuggestions.length > 0) {
        const preliminaryValues: Record<string, string> = {};
        for (const assignment of suggestedAssignments) {
          preliminaryValues[assignment.fieldKey] = assignment.assignedValue;
        }

        const failingYCandidates: Array<{ y: number; height: number }> = [];
        for (const failing of failingSuggestions) {
          const boundingBox = failing.boundingBox as
            | { y?: unknown; height?: unknown }
            | null
            | undefined;
          const y =
            typeof boundingBox?.y === 'number' && Number.isFinite(boundingBox.y)
              ? boundingBox.y
              : null;
          const height =
            typeof boundingBox?.height === 'number' &&
              Number.isFinite(boundingBox.height)
              ? Math.max(0, boundingBox.height)
              : 0;
          if (y !== null) {
            failingYCandidates.push({ y, height });
          }
        }

        const rawYMin =
          failingYCandidates.length > 0
            ? Math.min(...failingYCandidates.map((candidate) => candidate.y))
            : 0;
        const rawYMax =
          failingYCandidates.length > 0
            ? Math.max(
              ...failingYCandidates.map(
                (candidate) => candidate.y + candidate.height,
              ),
            )
            : 1;

        const failingYMin = Math.max(0, rawYMin - 0.05);
        const failingYMax = Math.min(1, rawYMax + 0.05);

        const [createdRetryJob] = await this.dbs.db
          .insert(extractionRetryJobs)
          .values({
            attachmentId: baseline.attachmentId,
            baselineId,
            status: 'PENDING',
            failingFieldKeys: failingSuggestions.map(
              (suggestion) => suggestion.fieldKey,
            ),
            failingYMin: failingYMin.toFixed(4),
            failingYMax: failingYMax.toFixed(4),
            preliminaryValues,
            retryCount: 0,
            updatedAt: new Date(),
          })
          .returning({ id: extractionRetryJobs.id });

        retryJobId = createdRetryJob?.id ?? null;
      }

      if (retryJobId) {
        return {
          suggestedAssignments,
          modelVersionId,
          suggestionCount: suggestedAssignments.length,
          status: 'preliminary',
          retryJobId,
          failingFieldKeys: failingSuggestions.map(
            (suggestion) => suggestion.fieldKey,
          ),
        };
      }

      return {
        suggestedAssignments,
        modelVersionId,
        suggestionCount: suggestedAssignments.length,
      };
    } finally {
      if (!prefetchOnly) {
        this.isOllamaBusy = false;
      }
    }
  }

  async prefetchSuggestions(baselineId: string, userId: string): Promise<void> {
    const strategy = this.configService.get<string>('ML_PREFETCH_STRATEGY') ?? 'PAGE_LOAD';
    if (strategy === 'DISABLED') {
      this.logger.debug('prefetch.skipped.disabled', { baselineId });
      return;
    }

    if (this.isOllamaBusy) {
      this.logger.debug('prefetch.skipped.busy', { baselineId });
      return; // Silent skip — never queue, never error
    }
    // Check if suggestions already exist and are fresh
    const existing = await this.dbs.db.select()
      .from(baselineFieldAssignments)
      .where(eq(baselineFieldAssignments.baselineId, baselineId))
      .limit(1);
    if (existing.length > 0) {
      this.logger.debug('prefetch.skipped.already_exists', { baselineId });
      return;
    }
    try {
      this.isOllamaBusy = true;
      await this.generateSuggestions(baselineId, userId, true);
      this.logger.log('prefetch.complete', { baselineId });
    } catch (err: any) {
      this.logger.warn('prefetch.failed', { baselineId, error: err.message });
      // Swallow — prefetch failure must never surface to user
    } finally {
      this.isOllamaBusy = false;
    }
  }

  /**
   * Parse OCR output metadata JSON string for page dimensions.
   */
  private parseOcrMetadata(
    metadata: string | null | undefined,
  ): { pageWidth?: number; pageHeight?: number } {
    if (!metadata) return {};
    try {
      const parsed = JSON.parse(metadata);
      return {
        pageWidth: parsed.pageWidth ?? parsed.page_width ?? undefined,
        pageHeight: parsed.pageHeight ?? parsed.page_height ?? undefined,
      };
    } catch {
      return {};
    }
  }

  private applyMultiPageFieldConflictPolicy(
    suggestions: ProcessedSuggestion[],
    segmentById: Map<string, typeof extractedTextSegments.$inferSelect>,
  ): ProcessedSuggestion[] {
    const withPage: ProcessedSuggestionWithPage[] = suggestions.map((s) => {
      const segment = s.segmentId ? segmentById.get(s.segmentId) : undefined;
      return {
        ...s,
        pageNumber: segment?.pageNumber ?? null,
      };
    });

    const byField = new Map<string, ProcessedSuggestionWithPage[]>();
    for (const suggestion of withPage) {
      if (!byField.has(suggestion.fieldKey)) {
        byField.set(suggestion.fieldKey, []);
      }
      byField.get(suggestion.fieldKey)!.push(suggestion);
    }

    const resolved: ProcessedSuggestion[] = [];

    for (const [fieldKey, group] of byField) {
      if (group.length <= 1) {
        resolved.push(...group);
        continue;
      }

      const pageNumbers = Array.from(
        new Set(
          group
            .map((s) => s.pageNumber)
            .filter((page): page is number => typeof page === 'number'),
        ),
      );

      if (pageNumbers.length <= 1) {
        resolved.push(...group);
        continue;
      }

      const normalizedValues = Array.from(
        new Set(
          group.map((s) =>
            this.normalizeForPageConflictComparison(
              s.cleanedValue || s.originalValue || '',
            ),
          ),
        ),
      );

      if (normalizedValues.length > 1) {
        for (const suggestion of group) {
          suggestion.finalScore = 0.0;
          suggestion.validationOverride = 'conflicting_pages';
          suggestion.llmReasoning = {
            ...suggestion.llmReasoning,
            validationOverride: 'conflicting_pages',
            finalScore: 0.0,
          };
        }

        const distinctValues = Array.from(
          new Set(group.map((s) => String(s.originalValue ?? '').trim())),
        );
        const sortedPages = [...pageNumbers].sort((a, b) => a - b);

        this.logger.warn(
          `Multi-page conflict detected for fieldKey="${fieldKey}" pages=[${sortedPages.join(', ')}] values=[${distinctValues.join(' | ')}]`,
        );

        // Strategy A (strict): any disagreement is flagged and all occurrences are preserved.
        resolved.push(...group);
        continue;
      }

      let winner = group[0];
      for (const suggestion of group) {
        if (suggestion.finalScore > winner.finalScore) {
          winner = suggestion;
          continue;
        }

        if (
          suggestion.finalScore === winner.finalScore &&
          suggestion.confidence > winner.confidence
        ) {
          winner = suggestion;
        }
      }

      // Consistent value across pages: keep only the strongest occurrence.
      resolved.push(winner);
    }

    return resolved;
  }

  private normalizeForPageConflictComparison(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private async enforceRateLimit(userId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - this.RATE_LIMIT_WINDOW_MS);

    // Query 1: COUNT only — no JSONB payload fetched
    const countResult = await this.dbs.db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM audit_logs
      WHERE user_id = ${userId}
        AND action = 'ml.suggest.generate'
        AND created_at >= ${oneHourAgo}
    `);
    const countRow = (countResult.rows?.[0] ?? null) as
      | { count?: number | string }
      | null;
    const count = Number(countRow?.count ?? 0) || 0;

    if (count < this.MAX_REQUESTS_PER_HOUR) return;

    // Query 2: Only reached if limit exceeded
    const oldestResult = await this.dbs.db.execute(sql`
      SELECT created_at
      FROM audit_logs
      WHERE user_id = ${userId}
        AND action = 'ml.suggest.generate'
        AND created_at >= ${oneHourAgo}
      ORDER BY created_at ASC
      LIMIT 1
    `);
    const oldestRow = (oldestResult.rows?.[0] ?? null) as
      | { created_at?: Date }
      | null;
    const oldestCreatedAt = oldestRow?.created_at;
    const retryAfterMs = oldestCreatedAt
      ? this.RATE_LIMIT_WINDOW_MS - (Date.now() - oldestCreatedAt.getTime())
      : this.RATE_LIMIT_WINDOW_MS;
    const retryMinutes = Math.ceil(retryAfterMs / 60000);

    throw new HttpException(
      {
        message: 'Rate limit exceeded. Please try again later.',
        retryAfterMinutes: retryMinutes,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private isAbTestEnabled(): boolean {
    return (
      String(this.configService.get<string>('ML_MODEL_AB_TEST') ?? 'false')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  private resolveVendorId(
    baseline: typeof extractionBaselines.$inferSelect,
    currentOcr: typeof attachmentOcrOutputs.$inferSelect,
  ): string | null {
    const candidates: unknown[] = [
      this.extractVendorFromUnknown(baseline.utilizationMetadata),
      this.extractVendorFromUnknown(this.parseJsonValue(currentOcr.metadata)),
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const normalized = candidate.trim();
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private parseJsonValue(value: string | null | undefined): unknown {
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private extractVendorFromUnknown(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const source = value as Record<string, unknown>;
    const directKeys = [
      'vendorId',
      'vendor_id',
      'vendor',
      'vendorName',
      'vendor_name',
    ];
    for (const key of directKeys) {
      const directValue = source[key];
      if (typeof directValue === 'string' && directValue.trim()) {
        return directValue;
      }
    }

    const nestedVendor = source.vendor;
    if (nestedVendor && typeof nestedVendor === 'object') {
      const nestedSource = nestedVendor as Record<string, unknown>;
      for (const key of ['id', 'vendorId', 'vendor_id', 'name']) {
        const nestedValue = nestedSource[key];
        if (typeof nestedValue === 'string' && nestedValue.trim()) {
          return nestedValue;
        }
      }
    }

    return null;
  }

  private async serializeCurrentDocument(
    segments: SegmentForMl[],
    pageWidth: number,
  ): Promise<string> {
    const payload = {
      segments: segments.map((segment) => ({
        text: segment.text,
        boundingBox: (segment.boundingBox as
          | { x: number; y: number; width: number; height: number }
          | null) ?? null,
        pageNumber: segment.pageNumber ?? 1,
        zone: 'unknown',
      })),
      pageWidth,
    };

    try {
      const response = await this.postMlEndpoint('/ml/serialize', payload);
      if (typeof response?.serializedText !== 'string') {
        throw new Error('serialize payload missing serializedText');
      }
      return response.serializedText;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown serialize error';
      this.logger.warn(`rag.serialize.fallback reason=${message}`);
      return payload.segments.map((segment) => segment.text).join('\n');
    }
  }

  private resolveRagAgreement(
    fieldKey: string,
    normalizedValue: string | null,
    assignedValue: string,
    ragExamples: RagRetrievedExample[],
  ): number {
    if (ragExamples.length === 0) {
      return 0.0;
    }

    const candidate = this.normalizeRagComparisonValue(
      normalizedValue ?? assignedValue,
    );
    if (!candidate) {
      return 0.0;
    }

    for (const example of ragExamples) {
      const sourceValue = example.confirmedFields?.[fieldKey];
      if (typeof sourceValue !== 'string' || sourceValue.trim().length === 0) {
        continue;
      }
      if (this.normalizeRagComparisonValue(sourceValue) === candidate) {
        return 1.0;
      }
    }

    return 0.0;
  }

  private normalizeRagComparisonValue(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private async postMlEndpoint(
    endpoint: '/ml/serialize',
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

  private deriveTier(confidenceScore: number): 'auto_confirm' | 'verify' | 'flag' {
    const { autoConfirmThreshold, verifyThreshold } = this.getTierThresholds();
    if (confidenceScore >= autoConfirmThreshold) {
      return 'auto_confirm';
    }
    if (confidenceScore >= verifyThreshold) {
      return 'verify';
    }
    return 'flag';
  }

  private getTierThresholds(): {
    autoConfirmThreshold: number;
    verifyThreshold: number;
  } {
    if (this.cachedTierThresholds) {
      return this.cachedTierThresholds;
    }

    const autoConfirmThreshold = this.parseTierThreshold(
      'ML_TIER_AUTOCONFIRM',
      this.DEFAULT_AUTOCONFIRM_THRESHOLD,
    );
    const verifyThreshold = this.parseTierThreshold(
      'ML_TIER_VERIFY',
      this.DEFAULT_VERIFY_THRESHOLD,
    );

    if (verifyThreshold > autoConfirmThreshold) {
      this.logger.warn(
        `ML_TIER_VERIFY (${verifyThreshold}) is greater than ML_TIER_AUTOCONFIRM (${autoConfirmThreshold}); falling back to defaults (${this.DEFAULT_VERIFY_THRESHOLD}/${this.DEFAULT_AUTOCONFIRM_THRESHOLD})`,
      );
      this.cachedTierThresholds = {
        autoConfirmThreshold: this.DEFAULT_AUTOCONFIRM_THRESHOLD,
        verifyThreshold: this.DEFAULT_VERIFY_THRESHOLD,
      };
      return this.cachedTierThresholds;
    }

    this.cachedTierThresholds = { autoConfirmThreshold, verifyThreshold };
    return this.cachedTierThresholds;
  }

  private parseTierThreshold(key: string, defaultValue: number): number {
    const raw = this.configService.get<string>(key);
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      this.logger.warn(
        `${key} is not set; defaulting to ${defaultValue.toFixed(2)}`,
      );
      return defaultValue;
    }

    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
      this.logger.warn(
        `${key} is invalid (${raw}); defaulting to ${defaultValue.toFixed(2)}`,
      );
      return defaultValue;
    }

    return parsed;
  }

  private baselineHashParity(baselineId: string): 0 | 1 {
    const normalizedId = baselineId.replace(/-/g, '');
    if (!normalizedId) {
      return 0;
    }

    try {
      // UUIDs exceed Number safe range, so use bigint to preserve parity.
      const parsed = BigInt(`0x${normalizedId}`);
      return Number(parsed % 2n) as 0 | 1;
    } catch {
      return 0;
    }
  }

  private async selectModelForBaseline(baselineId: string): Promise<SelectedModel> {
    // Step 1 of I3: Resolve active model from extraction_models first,
    // fall back to ml_model_versions for backward compatibility.
    const modelA = await this.resolveActiveModel();
    const modelB = await this.resolveCandidateModel(modelA.modelName);
    const abTestEnabled = this.isAbTestEnabled();
    const parity = this.baselineHashParity(baselineId);
    const useCandidate = abTestEnabled && !!modelB && parity === 1;
    const selected = useCandidate ? modelB! : modelA;

    return {
      id: selected.id,
      version: selected.version,
      filePath: selected.filePath,
      abGroup: useCandidate ? 'B' : 'A',
    };
  }

  /**
   * Resolve the active model following I3 step 1:
   * 1. Check extraction_models where isActive=true
   * 2. Fall back to ml_model_versions where isActive=true
   * 3. Fall back to creating a legacy bootstrap record
   */
  private async resolveActiveModel(): Promise<{
    id: string;
    version: string;
    filePath: string;
    modelName: string;
  }> {
    // Primary: extraction_models (new table from F1)
    const [activeExtractionModel] = await this.dbs.db
      .select()
      .from(extractionModels)
      .where(eq(extractionModels.isActive, true))
      .orderBy(desc(extractionModels.trainedAt))
      .limit(1);

    if (activeExtractionModel) {
      this.logger.debug(
        `Resolved active model from extraction_models: ${activeExtractionModel.modelName} v${activeExtractionModel.version}`,
      );
      return {
        id: activeExtractionModel.id,
        version: activeExtractionModel.version,
        filePath: activeExtractionModel.filePath,
        modelName: activeExtractionModel.modelName,
      };
    }

    // Fallback: ml_model_versions (backward compatibility)
    const [activeMlModel] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(eq(mlModelVersions.isActive, true))
      .orderBy(desc(mlModelVersions.trainedAt))
      .limit(1);

    if (activeMlModel) {
      this.logger.debug(
        `Resolved active model from ml_model_versions (fallback): ${activeMlModel.modelName} v${activeMlModel.version}`,
      );
      return activeMlModel;
    }

    // Last resort: bootstrap legacy record
    return this.getOrCreateDefaultActiveModel();
  }

  private async resolveCandidateModel(modelName: string) {
    const [candidateModel] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(
        and(
          eq(mlModelVersions.modelName, modelName),
          eq(mlModelVersions.isActive, false),
        ),
      )
      .orderBy(desc(mlModelVersions.trainedAt))
      .limit(1);

    return candidateModel;
  }

  private async getOrCreateDefaultActiveModel() {
    // Fallback bootstrap record for legacy environments without an active model row.
    const modelName = 'layoutlmv3-base';
    const version = '1.0.0';

    const [existing] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(
        and(
          eq(mlModelVersions.modelName, modelName),
          eq(mlModelVersions.version, version),
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    // Create new active model version record.
    const [newModel] = await this.dbs.db
      .insert(mlModelVersions)
      .values({
        modelName,
        version,
        filePath: 'microsoft/layoutlmv3-base',
        metrics: { type: 'token_classification', architecture: 'layoutlmv3' },
        trainedAt: new Date(),
        isActive: true,
        createdBy: 'system',
      })
      .returning();

    return newModel;
  }
}
