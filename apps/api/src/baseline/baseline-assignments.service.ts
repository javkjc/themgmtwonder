import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';
import {
  attachmentOcrOutputs,
  aliasRules,
  attachments,
  baselineFieldAssignments,
  baselineTables,
  correctionEvents,
  extractionTrainingExamples,
  extractedTextSegments,
  extractionBaselines,
  ocrResults,
} from '../db/schema';
import { fieldLibrary } from '../field-library/schema';
import { AuditService } from '../audit/audit.service';
import { FieldAssignmentValidatorService } from './field-assignment-validator.service';
import { FieldLibraryService } from '../field-library/field-library.service';
import { AssignBaselineFieldDto } from './dto/assign-baseline-field.dto';
import { DeleteAssignmentDto } from './dto/delete-assignment.dto';
import { ReviewManifestDto, type SimilarContextEntryDto } from './dto/review-manifest.dto';
import { AuthorizationService } from '../common/authorization.service';
import { BaselineManagementService } from './baseline-management.service';
import { normalizeFieldValue } from '../ml/field-value-normalizer';

type BaselineContext = {
  id: string;
  attachmentId: string;
  status: string;
  utilizationType: string | null;
  utilizedAt: Date | null;
  ownerId: string;
};

type BoundingBox = { x: number; y: number; width: number; height: number };

@Injectable()
export class BaselineAssignmentsService {
  private readonly logger = new Logger(BaselineAssignmentsService.name);
  private readonly DEFAULT_AUTOCONFIRM_THRESHOLD = 0.9;
  private readonly DEFAULT_VERIFY_THRESHOLD = 0.7;
  private cachedTierThresholds:
    | { autoConfirmThreshold: number; verifyThreshold: number }
    | null = null;

  constructor(
    private readonly dbs: DbService,
    private readonly auditService: AuditService,
    private readonly validator: FieldAssignmentValidatorService,
    private readonly fieldLibraryService: FieldLibraryService,
    private readonly authService: AuthorizationService,
    private readonly baselineManagementService: BaselineManagementService,
    private readonly configService: ConfigService,
  ) { }

  async getAggregatedBaseline(attachmentId: string, userId: string) {
    await this.authService.ensureUserOwnsAttachment(userId, attachmentId);

    // 1. Find Latest Non-Archived Baseline
    // After re-retrieval, a new draft is created while confirmed baseline may still exist.
    // We want the LATEST non-archived baseline (most recent createdAt) for the review page.
    const allBaselines = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(eq(extractionBaselines.attachmentId, attachmentId))
      .orderBy(desc(extractionBaselines.createdAt))
      .limit(10);

    // Find first non-archived baseline (will be the most recent)
    let baselineRecord = allBaselines.find((b) => b.status !== 'archived');

    // 2. Find Current OCR Output & Segments
    const [currentOcr] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, attachmentId),
          eq(attachmentOcrOutputs.isCurrent, true),
        ),
      )
      .limit(1);

    if (!baselineRecord && !currentOcr) {
      return null;
    }

    if (!baselineRecord && currentOcr) {
      baselineRecord = await this.baselineManagementService.createDraftBaseline(
        attachmentId,
        userId,
      );
    }

    if (
      baselineRecord &&
      currentOcr &&
      baselineRecord.createdAt < currentOcr.createdAt
    ) {
      baselineRecord = await this.baselineManagementService.createDraftBaseline(
        attachmentId,
        userId,
      );
    }

    if (!baselineRecord) {
      return null;
    }

    // 3. Fetch Assignments
    const assignments = await this.listAssignments(baselineRecord.id, userId);

    let segments: any[] = [];
    if (currentOcr) {
      segments = await this.dbs.db
        .select()
        .from(extractedTextSegments)
        .where(eq(extractedTextSegments.attachmentOcrOutputId, currentOcr.id))
        .orderBy(
          extractedTextSegments.pageNumber,
          extractedTextSegments.createdAt,
        );

      segments = segments.map((segment) => ({
        ...segment,
        confidence:
          segment.confidence === null || segment.confidence === undefined
            ? null
            : Number(segment.confidence),
        boundingBox: segment.boundingBox as BoundingBox | null,
        pageNumber: segment.pageNumber ?? 1,
      }));

      if (!segments.length && (currentOcr.extractedText ?? '').trim()) {
        segments = await this.backfillSegmentsFromText(
          currentOcr.id,
          currentOcr.extractedText ?? '',
        );
      }

      // Fallback: If assignments are empty and this is a draft, try to backfill from OCR results
      if (baselineRecord.status === 'draft' && assignments.length === 0) {
        const backfilled = await this.backfillAssignmentsFromOcrResults(
          currentOcr.id,
          baselineRecord.id,
          userId,
        );
        if (backfilled.length > 0) {
          assignments.push(...backfilled);
        }
      }
    }

    const tables = await this.dbs.db
      .select()
      .from(baselineTables)
      .where(eq(baselineTables.baselineId, baselineRecord.id))
      .orderBy(baselineTables.tableIndex);

    // Attach baseline utilization fields to each table for UI display
    const tablesWithUtilization = tables.map((table) => ({
      ...table,
      baselineUtilizedAt: baselineRecord.utilizedAt,
      baselineUtilizationType: baselineRecord.utilizationType,
      baselineUtilizationMetadata: baselineRecord.utilizationMetadata,
    }));

    return {
      ...baselineRecord,
      assignments,
      segments,
      tables: tablesWithUtilization,
      currentOcrId: currentOcr?.id || null,
    };
  }

  async listAssignments(baselineId: string, userId: string) {
    const context = await this.authService.ensureUserOwnsBaseline(
      userId,
      baselineId,
    );

    const rows = await this.dbs.db
      .select({
        id: baselineFieldAssignments.id,
        fieldKey: baselineFieldAssignments.fieldKey,
        assignedValue: baselineFieldAssignments.assignedValue,
        sourceSegmentId: baselineFieldAssignments.sourceSegmentId,
        assignedBy: baselineFieldAssignments.assignedBy,
        assignedAt: baselineFieldAssignments.assignedAt,
        correctedFrom: baselineFieldAssignments.correctedFrom,
        correctionReason: baselineFieldAssignments.correctionReason,
        validationValid: baselineFieldAssignments.validationValid,
        validationError: baselineFieldAssignments.validationError,
        validationSuggestion: baselineFieldAssignments.validationSuggestion,
        // ML suggestion metadata (v8.8 - C3)
        suggestionConfidence: baselineFieldAssignments.suggestionConfidence,
        suggestionAccepted: baselineFieldAssignments.suggestionAccepted,
        modelVersionId: baselineFieldAssignments.modelVersionId,
        // Spatial + validation fields (v8.10 - I3)
        confidenceScore: baselineFieldAssignments.confidenceScore,
        zone: baselineFieldAssignments.zone,
        boundingBox: baselineFieldAssignments.boundingBox,
        extractionMethod: baselineFieldAssignments.extractionMethod,
        llmReviewed: baselineFieldAssignments.llmReviewed,
        llmReasoning: baselineFieldAssignments.llmReasoning,
        // I4 — Value Normalization
        normalizedValue: baselineFieldAssignments.normalizedValue,
        normalizationError: baselineFieldAssignments.normalizationError,
      })
      .from(baselineFieldAssignments)
      .where(eq(baselineFieldAssignments.baselineId, baselineId));

    return rows.map((row) => ({
      ...row,
      validation:
        row.validationValid !== null
          ? {
            valid: row.validationValid,
            error: row.validationError ?? undefined,
            suggestedCorrection: row.validationSuggestion ?? undefined,
          }
          : undefined,
      suggestionConfidence:
        row.suggestionConfidence === null ||
          row.suggestionConfidence === undefined
          ? null
          : Number(row.suggestionConfidence),
      confidenceScore:
        row.confidenceScore === null || row.confidenceScore === undefined
          ? null
          : Number(row.confidenceScore),
      tier: this.deriveTier(
        row.confidenceScore === null || row.confidenceScore === undefined
          ? null
          : Number(row.confidenceScore),
      ),
      llmReasoning:
        row.llmReasoning !== null && row.llmReasoning !== undefined
          ? (() => {
            try {
              return JSON.parse(row.llmReasoning);
            } catch {
              return row.llmReasoning;
            }
          })()
          : null,
    }));
  }

  async bulkConfirmSuggestions(baselineId: string, userId: string) {
    const context = await this.ensureBaselineEditable(baselineId, userId);
    if (context.status === 'confirmed') {
      throw new BadRequestException('Cannot bulk-confirm suggestions on an already confirmed baseline');
    }
    const { autoConfirmThreshold } = this.getTierThresholds();

    const updatedRows = await this.dbs.db
      .update(baselineFieldAssignments)
      .set({
        suggestionAccepted: true,
      })
      .where(
        and(
          eq(baselineFieldAssignments.baselineId, baselineId),
          gte(
            baselineFieldAssignments.confidenceScore,
            autoConfirmThreshold.toFixed(4),
          ),
          isNull(baselineFieldAssignments.suggestionAccepted),
        ),
      )
      .returning({ id: baselineFieldAssignments.id });

    await this.auditService.log({
      userId,
      action: 'baseline.suggestions.bulk-confirm',
      module: 'baseline',
      resourceType: 'baseline',
      resourceId: baselineId,
      details: {
        baselineId,
        autoConfirmThreshold,
        count: updatedRows.length,
      },
    });

    return { count: updatedRows.length };
  }

  async assembleReviewManifest(
    baselineId: string,
    userId: string,
  ): Promise<ReviewManifestDto> {
    const context = await this.authService.ensureUserOwnsBaseline(
      userId,
      baselineId,
    );

    const rows = await this.dbs.db
      .select({
        fieldKey: baselineFieldAssignments.fieldKey,
        suggestedValue: baselineFieldAssignments.assignedValue,
        confidenceScore: baselineFieldAssignments.confidenceScore,
        zone: baselineFieldAssignments.zone,
        boundingBox: baselineFieldAssignments.boundingBox,
        extractionMethod: baselineFieldAssignments.extractionMethod,
        suggestionAccepted: baselineFieldAssignments.suggestionAccepted,
        sourcePageNumber: extractedTextSegments.pageNumber,
      })
      .from(baselineFieldAssignments)
      .leftJoin(
        extractedTextSegments,
        eq(baselineFieldAssignments.sourceSegmentId, extractedTextSegments.id),
      )
      .where(eq(baselineFieldAssignments.baselineId, baselineId));

    const fields = rows
      .map((row) => {
        const confidenceScore =
          row.confidenceScore === null || row.confidenceScore === undefined
            ? null
            : Number(row.confidenceScore);
        const boundingBox = (row.boundingBox ?? null) as BoundingBox | null;
        return {
          fieldKey: row.fieldKey,
          suggestedValue: row.suggestedValue ?? null,
          confidenceScore,
          tier: this.deriveTier(confidenceScore),
          zone: row.zone ?? null,
          boundingBox,
          pageNumber: row.sourcePageNumber ?? 1,
          extractionMethod: row.extractionMethod ?? null,
          suggestionAccepted: row.suggestionAccepted ?? null,
        };
      })
      .sort((a, b) => {
        if (a.boundingBox && b.boundingBox) {
          if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
          return a.boundingBox.y - b.boundingBox.y;
        }
        if (a.boundingBox && !b.boundingBox) return -1;
        if (!a.boundingBox && b.boundingBox) return 1;
        return a.fieldKey.localeCompare(b.fieldKey);
      });

    const tierCounts: ReviewManifestDto['tierCounts'] = {
      flag: 0,
      verify: 0,
      auto_confirm: 0,
    };
    for (const field of fields) {
      if (field.tier === 'flag') tierCounts.flag += 1;
      if (field.tier === 'verify') tierCounts.verify += 1;
      if (field.tier === 'auto_confirm') tierCounts.auto_confirm += 1;
    }

    const segmentRows = await this.dbs.db
      .select({
        pageNumber: extractedTextSegments.pageNumber,
      })
      .from(extractedTextSegments)
      .innerJoin(
        attachmentOcrOutputs,
        eq(
          extractedTextSegments.attachmentOcrOutputId,
          attachmentOcrOutputs.id,
        ),
      )
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, context.attachmentId),
          eq(attachmentOcrOutputs.isCurrent, true),
          isNotNull(extractedTextSegments.pageNumber),
        ),
      );

    const pageCount = segmentRows.length
      ? Math.max(...segmentRows.map((r) => r.pageNumber ?? 1))
      : Math.max(1, ...fields.map((field) => field.pageNumber || 1), 1);

    const similarContext: Record<string, SimilarContextEntryDto[]> = {};
    for (const field of fields) {
      similarContext[field.fieldKey] = await this.getSimilarContextForField(
        baselineId,
        field.fieldKey,
        field.suggestedValue,
      );
    }

    return {
      baselineId,
      attachmentId: context.attachmentId,
      pageCount,
      fields,
      similarContext,
      tierCounts,
    };
  }

  async upsertAssignment(
    baselineId: string,
    dto: AssignBaselineFieldDto,
    userId: string,
  ) {
    const context = await this.ensureBaselineEditable(baselineId, userId);
    const field = await this.fieldLibraryService.getFieldByKey(dto.fieldKey);

    const validation = this.validator.validate(
      field.characterType,
      dto.assignedValue,
      field.characterLimit,
    );

    // If validation fails and user hasn't confirmed, require explicit confirmation
    if (!validation.valid && !dto.confirmInvalid) {
      throw new BadRequestException({
        message: 'Validation failed - explicit confirmation required',
        validation,
        requiresConfirmation: true,
      });
    }

    // I4: Run field value normalizer for manual assignments (after type validation)
    // We pass the raw user-provided value to the normalizer.
    // We no longer overwrite assignedValue with auto-normalization results from validation,
    // as per the I4 requirement to preserve the raw string.
    const normResult = normalizeFieldValue({
      rawValue: dto.assignedValue ?? null,
      fieldType: field.characterType,
    });

    const [existing] = await this.dbs.db
      .select()
      .from(baselineFieldAssignments)
      .where(
        and(
          eq(baselineFieldAssignments.baselineId, baselineId),
          eq(baselineFieldAssignments.fieldKey, dto.fieldKey),
        ),
      )
      .limit(1);

    const providedReason = dto.correctionReason?.trim();
    const isOverwrite = !!existing;

    const valueChanged = existing
      ? (existing.assignedValue ?? null) !== (dto.assignedValue ?? null)
      : false;

    if (context.status === 'reviewed' && isOverwrite) {
      if (!providedReason || providedReason.length < 10) {
        throw new BadRequestException(
          'correctionReason (min 10 chars) is required when overwriting an assignment in reviewed status',
        );
      }
    } else if (providedReason && providedReason.length < 10) {
      throw new BadRequestException(
        'correctionReason must be at least 10 characters when provided',
      );
    }

    const correctedFromValue = isOverwrite
      ? (existing?.assignedValue ?? null)
      : null;
    const correctionReasonValue =
      context.status === 'reviewed' && (isOverwrite || providedReason)
        ? (providedReason ?? null)
        : (providedReason ?? null);

    // ML suggestion metadata handling (v8.8 - C3)
    // Convert confidence to string for decimal column
    const suggestionConfidence =
      dto.suggestionConfidence !== undefined &&
        dto.suggestionConfidence !== null
        ? String(dto.suggestionConfidence)
        : (existing?.suggestionConfidence ?? null);
    const existingModelVersionId = existing?.modelVersionId ?? null;
    const isClearedSuggestionPlaceholder =
      existing?.assignedValue === null &&
      existing?.suggestionAccepted === false &&
      existingModelVersionId !== null;
    let suggestionAccepted: boolean | null;
    let modelVersionId: string | null;
    if (dto.suggestionAccepted === true) {
      suggestionAccepted = true;
      modelVersionId = dto.modelVersionId ?? existingModelVersionId;
    } else if (dto.suggestionAccepted === false) {
      suggestionAccepted = false;
      modelVersionId = dto.modelVersionId ?? existingModelVersionId;
    } else if (dto.suggestionAccepted === null) {
      suggestionAccepted = null;
      modelVersionId = null;
    } else if (dto.modelVersionId !== undefined) {
      suggestionAccepted = existing?.suggestionAccepted ?? null;
      modelVersionId = dto.modelVersionId;
    } else if (isClearedSuggestionPlaceholder) {
      suggestionAccepted = null;
      modelVersionId = null;
    } else if (
      existingModelVersionId !== null ||
      existing?.suggestionAccepted !== null
    ) {
      suggestionAccepted = false;
      modelVersionId = existingModelVersionId;
    } else {
      suggestionAccepted = null;
      modelVersionId = null;
    }

    const [assignment] = await this.dbs.db
      .insert(baselineFieldAssignments)
      .values({
        baselineId,
        fieldKey: dto.fieldKey,
        assignedValue: dto.assignedValue ?? null,
        sourceSegmentId: dto.sourceSegmentId ?? null,
        assignedBy: userId,
        assignedAt: new Date(),
        correctedFrom: correctedFromValue,
        correctionReason: correctionReasonValue,
        validationValid: validation.valid,
        validationError: validation.error ?? null,
        validationSuggestion: validation.suggestedCorrection ?? null,
        // ML suggestion metadata (v8.8 - C3)
        suggestionConfidence: suggestionConfidence,
        suggestionAccepted: suggestionAccepted,
        modelVersionId: modelVersionId,
        // I4 — Value Normalization
        normalizedValue: normResult.normalizedValue,
        normalizationError: normResult.normalizationError,
      })
      .onConflictDoUpdate({
        target: [
          baselineFieldAssignments.baselineId,
          baselineFieldAssignments.fieldKey,
        ],
        set: {
          assignedValue: dto.assignedValue ?? null,
          sourceSegmentId: dto.sourceSegmentId ?? null,
          assignedBy: userId,
          assignedAt: new Date(),
          correctedFrom: correctedFromValue,
          correctionReason: correctionReasonValue,
          validationValid: validation.valid,
          validationError: validation.error ?? null,
          validationSuggestion: validation.suggestedCorrection ?? null,
          // ML suggestion metadata (v8.8 - C3)
          suggestionConfidence: suggestionConfidence,
          suggestionAccepted: suggestionAccepted,
          modelVersionId: modelVersionId,
          // I4 — Value Normalization
          normalizedValue: normResult.normalizedValue,
          normalizationError: normResult.normalizationError,
        },
      })
      .returning();

    const savedBoundingBox = assignment.boundingBox;
    const savedZone = assignment.zone;
    const savedExtractionMethod = assignment.extractionMethod;
    const savedAssignedValue = assignment.assignedValue;
    if (
      savedBoundingBox !== null &&
      savedZone !== null &&
      savedExtractionMethod !== null &&
      savedAssignedValue !== null
    ) {
      await this.dbs.db.insert(extractionTrainingExamples).values({
        baselineId: assignment.baselineId as string,
        fieldKey: assignment.fieldKey as string,
        assignedValue: savedAssignedValue as string,
        zone: savedZone,
        boundingBox: savedBoundingBox,
        extractionMethod: savedExtractionMethod as string,
        confidence: assignment.confidenceScore,
        isSynthetic: false,
      });
    }

    await this.recordCorrectionEventIfNeeded({
      assignment,
      baselineId,
      attachmentId: context.attachmentId,
      userId,
    });

    await this.auditService.log({
      userId,
      action: 'baseline.assignment.upsert',
      module: 'baseline',
      resourceType: 'baseline_field',
      resourceId: baselineId,
      details: {
        baselineId,
        assignmentId: assignment.id,
        fieldKey: assignment.fieldKey,
        assignedBy: userId,
        correctedFrom: assignment.correctedFrom,
        correctionReason: assignment.correctionReason,
        // ML suggestion metadata (v8.8 - C3)
        suggestionAccepted: assignment.suggestionAccepted,
        modelVersionId: assignment.modelVersionId,
      },
    });

    return { assignment, validation };
  }

  async deleteAssignment(
    baselineId: string,
    fieldKey: string,
    userId: string,
    dto?: DeleteAssignmentDto,
  ) {
    const context = await this.ensureBaselineEditable(baselineId, userId);

    const [existing] = await this.dbs.db
      .select()
      .from(baselineFieldAssignments)
      .where(
        and(
          eq(baselineFieldAssignments.baselineId, baselineId),
          eq(baselineFieldAssignments.fieldKey, fieldKey),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Assignment not found');
    }

    const trimmedReason = dto?.reason?.trim();
    if (context.status === 'reviewed') {
      if (!trimmedReason || trimmedReason.length < 10) {
        throw new BadRequestException(
          'correctionReason (min 10 chars) is required to delete an assignment in reviewed status',
        );
      }
    } else if (trimmedReason && trimmedReason.length < 10) {
      throw new BadRequestException(
        'correctionReason must be at least 10 characters when provided',
      );
    }

    if (dto?.suggestionRejected) {
      const suggestionConfidence =
        dto.suggestionConfidence !== undefined &&
          dto.suggestionConfidence !== null
          ? String(dto.suggestionConfidence)
          : (existing.suggestionConfidence ?? null);
      const modelVersionId = dto.modelVersionId ?? existing.modelVersionId;

      const [assignment] = await this.dbs.db
        .insert(baselineFieldAssignments)
        .values({
          baselineId,
          fieldKey,
          assignedValue: null,
          sourceSegmentId: null,
          assignedBy: userId,
          assignedAt: new Date(),
          correctedFrom: existing.assignedValue ?? null,
          correctionReason: trimmedReason ?? null,
          validationValid: null,
          validationError: null,
          validationSuggestion: null,
          suggestionConfidence,
          suggestionAccepted: false,
          modelVersionId: modelVersionId ?? null,
        })
        .onConflictDoUpdate({
          target: [
            baselineFieldAssignments.baselineId,
            baselineFieldAssignments.fieldKey,
          ],
          set: {
            assignedValue: null,
            sourceSegmentId: null,
            assignedBy: userId,
            assignedAt: new Date(),
            correctedFrom: existing.assignedValue ?? null,
            correctionReason: trimmedReason ?? null,
            validationValid: null,
            validationError: null,
            validationSuggestion: null,
            suggestionConfidence,
            suggestionAccepted: false,
            modelVersionId: modelVersionId ?? null,
          },
        })
        .returning();

      await this.auditService.log({
        userId,
        action: 'baseline.assignment.upsert',
        module: 'baseline',
        resourceType: 'baseline_field',
        resourceId: baselineId,
        details: {
          baselineId,
          assignmentId: assignment.id,
          fieldKey,
          assignedBy: userId,
          correctedFrom: existing.assignedValue ?? null,
          correctionReason: trimmedReason ?? null,
          suggestionAccepted: assignment.suggestionAccepted,
          modelVersionId: assignment.modelVersionId,
        },
      });

      return { deleted: true };
    }

    await this.dbs.db
      .delete(baselineFieldAssignments)
      .where(
        and(
          eq(baselineFieldAssignments.baselineId, baselineId),
          eq(baselineFieldAssignments.fieldKey, fieldKey),
        ),
      );

    await this.auditService.log({
      userId,
      action: 'baseline.assignment.delete',
      module: 'baseline',
      resourceType: 'baseline_field',
      resourceId: baselineId,
      details: {
        baselineId,
        assignmentId: existing.id,
        fieldKey,
        assignedBy: userId,
        correctedFrom: existing.assignedValue ?? null,
        correctionReason: trimmedReason ?? null,
        // ML suggestion rejection metadata (v8.8 - C3)
        suggestionRejected: dto?.suggestionRejected ?? null,
        suggestionConfidence:
          dto?.suggestionConfidence ?? existing.suggestionConfidence ?? null,
        modelVersionId: dto?.modelVersionId ?? existing.modelVersionId ?? null,
      },
    });

    return { deleted: true };
  }

  private async ensureBaselineEditable(
    baselineId: string,
    userId: string,
  ): Promise<BaselineContext> {
    const context = await this.authService.ensureUserOwnsBaseline(
      userId,
      baselineId,
    );

    if (context.status === 'confirmed') {
      await this.auditService.log({
        userId,
        action: 'security.policy_violation' as any,
        module: 'baseline',
        resourceType: 'baseline',
        resourceId: baselineId,
        details: {
          reason: 'immutable_confirmed',
          status: context.status,
          attemptedAction: 'baseline.assignment.modify',
        },
      });
      throw new ForbiddenException('Baseline is immutable in confirmed status');
    }

    if (context.status === 'archived') {
      await this.auditService.log({
        userId,
        action: 'security.policy_violation' as any,
        module: 'baseline',
        resourceType: 'baseline',
        resourceId: baselineId,
        details: {
          reason: 'immutable_archived',
          status: context.status,
          attemptedAction: 'baseline.assignment.modify',
        },
      });
      throw new BadRequestException('Cannot modify an archived baseline');
    }

    if (context.utilizationType || context.utilizedAt) {
      await this.auditService.log({
        userId,
        action: 'baseline.assignment.denied',
        module: 'baseline',
        resourceType: 'baseline',
        resourceId: baselineId,
        details: {
          reason: 'utilized',
          utilizationType: context.utilizationType,
        },
      });
      await this.auditService.log({
        userId,
        action: 'security.policy_violation' as any,
        module: 'baseline',
        resourceType: 'baseline',
        resourceId: baselineId,
        details: {
          reason: 'immutable_utilized',
          utilizationType: context.utilizationType,
          attemptedAction: 'baseline.assignment.modify',
        },
      });
      throw new ForbiddenException(
        'Baseline has been utilized and cannot be modified',
      );
    }

    return context;
  }

  private async backfillSegmentsFromText(
    attachmentOcrOutputId: string,
    extractedText: string,
  ) {
    const lines = extractedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return [];
    }

    const rows = await this.dbs.db
      .insert(extractedTextSegments)
      .values(
        lines.map((text) => ({
          attachmentOcrOutputId,
          text,
          confidence: null,
          boundingBox: null,
          pageNumber: 1,
          createdAt: new Date(),
        })),
      )
      .returning();

    return rows;
  }
  private async backfillAssignmentsFromOcrResults(
    attachmentOcrOutputId: string,
    baselineId: string,
    userId: string,
  ) {
    const results = await this.dbs.db
      .select()
      .from(ocrResults)
      .where(eq(ocrResults.attachmentOcrOutputId, attachmentOcrOutputId));

    if (results.length === 0) return [];

    const libraryFields = await this.dbs.db
      .select()
      .from(fieldLibrary)
      .where(eq(fieldLibrary.status, 'active'));

    const validKeys = new Set(libraryFields.map((f) => f.fieldKey));

    const toInsert = results
      .filter((r) => validKeys.has(r.fieldName))
      .map((r) => ({
        baselineId,
        fieldKey: r.fieldName,
        assignedValue: r.fieldValue,
        assignedBy: userId,
      }));

    if (toInsert.length === 0) return [];

    await this.dbs.db
      .insert(baselineFieldAssignments)
      .values(toInsert)
      .onConflictDoNothing();

    // Refresh assignments list
    return this.listAssignments(baselineId, userId);
  }

  private deriveTier(
    confidenceScore: number | null,
  ): 'auto_confirm' | 'verify' | 'flag' | null {
    if (confidenceScore === null || Number.isNaN(confidenceScore)) {
      return null;
    }

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

  private async getSimilarContextForField(
    baselineId: string,
    fieldKey: string,
    suggestedValue: string | null,
  ): Promise<SimilarContextEntryDto[]> {
    const rows = await this.dbs.db
      .select({
        assignedValue: baselineFieldAssignments.assignedValue,
        confirmedAt: extractionBaselines.confirmedAt,
        createdAt: extractionBaselines.createdAt,
      })
      .from(baselineFieldAssignments)
      .innerJoin(
        extractionBaselines,
        eq(baselineFieldAssignments.baselineId, extractionBaselines.id),
      )
      .where(
        and(
          eq(baselineFieldAssignments.fieldKey, fieldKey),
          eq(extractionBaselines.status, 'confirmed'),
          ne(extractionBaselines.id, baselineId),
          isNotNull(baselineFieldAssignments.assignedValue),
        ),
      )
      .orderBy(desc(extractionBaselines.confirmedAt))
      .limit(60);

    return rows
      .map((row) => {
        const value = row.assignedValue ?? '';
        const date = row.confirmedAt ?? row.createdAt ?? null;
        return {
          value,
          confirmedAt: date ? this.formatLocalDate(date) : '',
          similarity: this.computeTextSimilarity(suggestedValue ?? '', value),
        };
      })
      .filter((row) => row.value.trim().length > 0)
      .sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity;
        return a.confirmedAt < b.confirmedAt ? 1 : -1;
      })
      .slice(0, 3);
  }

  private formatLocalDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private computeTextSimilarity(source: string, target: string): number {
    const left = source.trim().toLowerCase();
    const right = target.trim().toLowerCase();
    if (!left && !right) return 1;
    if (!left || !right) return 0;
    if (left === right) return 1;

    const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
    const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
    const intersectionSize = [...leftTokens].filter((t) =>
      rightTokens.has(t),
    ).length;
    const unionSize = new Set([...leftTokens, ...rightTokens]).size;
    if (!unionSize) return 0;
    return Number((intersectionSize / unionSize).toFixed(4));
  }

  private async recordCorrectionEventIfNeeded(params: {
    assignment: typeof baselineFieldAssignments.$inferSelect;
    baselineId: string;
    attachmentId: string;
    userId: string;
  }): Promise<void> {
    const { assignment, baselineId, attachmentId, userId } = params;
    if (
      assignment.correctedFrom === null ||
      assignment.correctedFrom === undefined ||
      assignment.suggestionAccepted !== false
    ) {
      return;
    }
    if (assignment.assignedValue === null || assignment.assignedValue === undefined) {
      return;
    }

    const vendorId = await this.resolveVendorIdForCorrection(
      baselineId,
      attachmentId,
    );
    if (!vendorId) {
      return;
    }

    await this.dbs.db.insert(correctionEvents).values({
      vendorId,
      fieldKey: assignment.fieldKey,
      rawOcrValue: assignment.correctedFrom,
      correctedValue: assignment.assignedValue,
      baselineId,
      userId,
    });

    const [countRow] = await this.dbs.db
      .select({ count: sql<number>`count(*)::int` })
      .from(correctionEvents)
      .where(
        and(
          eq(correctionEvents.vendorId, vendorId),
          eq(correctionEvents.fieldKey, assignment.fieldKey),
          eq(correctionEvents.rawOcrValue, assignment.correctedFrom),
        ),
      );
    const correctionCount = Number(countRow?.count ?? 0);

    this.logger.log(
      `correction.event.recorded vendorId=${vendorId} fieldKey=${assignment.fieldKey} correctionCount=${correctionCount}`,
    );

    if (correctionCount < 3) {
      return;
    }

    const [rule] = await this.dbs.db
      .insert(aliasRules)
      .values({
        vendorId,
        fieldKey: assignment.fieldKey,
        rawPattern: assignment.correctedFrom,
        correctedValue: assignment.assignedValue,
        status: 'proposed',
        correctionEventCount: correctionCount,
        proposedAt: new Date(),
        approvedAt: null,
        approvedBy: null,
      })
      .onConflictDoUpdate({
        target: [aliasRules.vendorId, aliasRules.fieldKey, aliasRules.rawPattern],
        set: {
          correctedValue: assignment.assignedValue,
          status: 'proposed',
          correctionEventCount: correctionCount,
          proposedAt: new Date(),
          approvedAt: null,
          approvedBy: null,
        },
      })
      .returning({ id: aliasRules.id });

    this.logger.log(
      `alias.rule.proposed ruleId=${rule?.id ?? 'unknown'} vendorId=${vendorId} fieldKey=${assignment.fieldKey}`,
    );
  }

  private async resolveVendorIdForCorrection(
    baselineId: string,
    attachmentId: string,
  ): Promise<string | null> {
    const [baseline] = await this.dbs.db
      .select({
        utilizationMetadata: extractionBaselines.utilizationMetadata,
      })
      .from(extractionBaselines)
      .where(eq(extractionBaselines.id, baselineId))
      .limit(1);

    const [currentOcr] = await this.dbs.db
      .select({
        metadata: attachmentOcrOutputs.metadata,
      })
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, attachmentId),
          eq(attachmentOcrOutputs.isCurrent, true),
        ),
      )
      .limit(1);

    const candidates: unknown[] = [
      this.extractVendorFromUnknown(baseline?.utilizationMetadata),
      this.extractVendorFromUnknown(this.parseJsonValue(currentOcr?.metadata)),
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
}
