import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  extractionBaselines,
  extractedTextSegments,
  attachmentOcrOutputs,
  baselineFieldAssignments,
  mlModelVersions,
  extractionModels,
  auditLogs,
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

export interface SuggestionSummary {
  suggestedAssignments: Array<{
    fieldKey: string;
    assignedValue: string;
    confidence: number;
    sourceSegmentId: string;
    pageNumber?: number | null;
    zone?: string;
    boundingBox?: Record<string, number> | null;
    extractionMethod?: string;
    finalScore?: number;
    validationOverride?: string | null;
  }>;
  modelVersionId: string;
  suggestionCount: number;
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

@Injectable()
export class FieldSuggestionService {
  private readonly logger = new Logger(FieldSuggestionService.name);
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_REQUESTS_PER_HOUR = 1000;

  constructor(
    private readonly dbs: DbService,
    private readonly mlService: MlService,
    private readonly auditService: AuditService,
    private readonly authService: AuthorizationService,
    private readonly validator: FieldAssignmentValidatorService,
    private readonly configService: ConfigService,
    private readonly mathReconciliationService: MathReconciliationService,
  ) { }

  async generateSuggestions(
    baselineId: string,
    userId: string,
  ): Promise<SuggestionSummary> {
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
    const activeFields = await this.dbs.db
      .select()
      .from(fieldLibrary)
      .where(eq(fieldLibrary.status, 'active'));

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

    const mlPayload = {
      baselineId,
      pageWidth,
      pageHeight,
      pageType,
      segments: segments.map((s) => {
        const segment: any = {
          id: s.id,
          text: s.text,
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
        characterType: f.characterType,
      })),
      threshold: 0.75,
      pairCandidates: [],
      segmentContext: [],
      modelVersionId: selectedModel.id,
      filePath: selectedModel.filePath,
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

    // 7. Use selected model version record
    const modelVersionId = selectedModel.id;

    // 8. Load existing assignments
    const existingAssignments = await this.dbs.db
      .select()
      .from(baselineFieldAssignments)
      .where(eq(baselineFieldAssignments.baselineId, baselineId));

    // 9. Filter suggestions: only suggest for unassigned fields or fields without manual value
    const filteredRaw = rawSuggestions.filter((s) => {
      const existing = existingAssignments.find(
        (a) => a.fieldKey === s.fieldKey,
      );
      if (!existing) return true;

      const hasManualValue =
        existing.suggestionConfidence === null &&
        existing.assignedValue !== null &&
        String(existing.assignedValue).trim() !== '';

      if (hasManualValue) {
        return false;
      }

      return true;
    });

    const fieldByKey = new Map(activeFields.map((f) => [f.fieldKey, f]));
    const segmentById = new Map(segments.map((s) => [s.id, s]));

    // 10. Run DSPP + type validation + weighted FinalScore per suggestion (Steps 3-5 of I3)
    const processedSuggestions: ProcessedSuggestion[] = [];

    for (const rawSug of filteredRaw) {
      const segment = segmentById.get(rawSug.segmentId);
      if (!segment) continue;

      const segmentText = segment.text ?? '';
      if (!segmentText.trim()) continue;

      const field = fieldByKey.get(rawSug.fieldKey);
      if (!field) continue;

      const processed = processSuggestion(
        {
          segmentId: rawSug.segmentId,
          fieldKey: rawSug.fieldKey,
          confidence: rawSug.confidence,
          zone: rawSug.zone ?? 'unknown',
          boundingBox: rawSug.boundingBox ?? null,
          extractionMethod: rawSug.extractionMethod ?? 'layoutlmv3',
        },
        {
          text: segmentText,
          confidence:
            segment.confidence !== null && segment.confidence !== undefined
              ? Number(segment.confidence)
              : null,
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

    // 12. I5 post-aggregation multi-page conflict scan
    const processedForPersistence = this.applyMultiPageFieldConflictPolicy(
      processedSuggestions,
      segmentById,
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
      const sourceSegment = segmentById.get(processed.segmentId);
      const pageNumber = sourceSegment?.pageNumber ?? null;

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
        normalizationError,
        finalScore,
      };

      if (mathPatch) {
        llmReasoningWithNorm.mathReconciliation = mathPatch.mathReconciliation;
        if (mathPatch.mathDelta) {
          llmReasoningWithNorm.mathDelta = mathPatch.mathDelta;
        }
        if (mathPatch.validationOverride) {
          llmReasoningWithNorm.validationOverride = mathPatch.validationOverride;
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
        totalSegments: segments.length,
        totalFields: activeFields.length,
        pageWidth,
        pageHeight,
        pageType,
      },
    });

    return {
      suggestedAssignments,
      modelVersionId,
      suggestionCount: suggestedAssignments.length,
    };
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
      const segment = segmentById.get(s.segmentId);
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

    const recentLogs = await this.dbs.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.userId, userId),
          eq(auditLogs.action, 'ml.suggest.generate'),
          gte(auditLogs.createdAt, oneHourAgo),
        ),
      );

    if (recentLogs.length >= this.MAX_REQUESTS_PER_HOUR) {
      const oldestLog = recentLogs[0];
      const retryAfterMs =
        this.RATE_LIMIT_WINDOW_MS -
        (Date.now() - oldestLog.createdAt.getTime());
      const retryMinutes = Math.ceil(retryAfterMs / 60000);

      throw new HttpException(
        {
          message: 'Rate limit exceeded. Please try again later.',
          retryAfterMinutes: retryMinutes,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private isAbTestEnabled(): boolean {
    return (
      String(this.configService.get<string>('ML_MODEL_AB_TEST') ?? 'false')
        .trim()
        .toLowerCase() === 'true'
    );
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

