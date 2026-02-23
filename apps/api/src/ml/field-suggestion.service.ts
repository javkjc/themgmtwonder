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
  auditLogs,
} from '../db/schema';
import { fieldLibrary } from '../field-library/schema';
import { MlService } from './ml.service';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../common/authorization.service';
import { FieldAssignmentValidatorService } from '../baseline/field-assignment-validator.service';

export interface SuggestionSummary {
  suggestedAssignments: Array<{
    fieldKey: string;
    assignedValue: string;
    confidence: number;
    sourceSegmentId: string;
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
  ) {}

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

    // 5. Call ML service with bounding boxes and field types
    const selectedModel = await this.selectModelForBaseline(baselineId);

    const mlPayload = {
      baselineId,
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
      threshold: 0.5,
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

    const suggestions = mlResult.data;

    // 6. Use selected model version record
    const modelVersionId = selectedModel.id;

    // 7. Load existing assignments
    const existingAssignments = await this.dbs.db
      .select()
      .from(baselineFieldAssignments)
      .where(eq(baselineFieldAssignments.baselineId, baselineId));

    const existingFieldKeys = new Set(
      existingAssignments.map((a) => a.fieldKey),
    );

    // 8. Filter suggestions: only suggest for unassigned fields or fields without manual value
    const newSuggestions = suggestions.filter((s) => {
      const existing = existingAssignments.find(
        (a) => a.fieldKey === s.fieldKey,
      );
      if (!existing) return true;

      const hasManualValue =
        existing.suggestionConfidence === null &&
        existing.assignedValue !== null &&
        String(existing.assignedValue).trim() !== '';

      // Skip only if a manual value already exists
      if (hasManualValue) {
        return false;
      }

      return true;
    });

    const fieldByKey = new Map(activeFields.map((f) => [f.fieldKey, f]));

    // 9. Persist suggestions as assignments
    const suggestedAssignments: SuggestionSummary['suggestedAssignments'] = [];

    for (const suggestion of newSuggestions) {
      const segment = segments.find((s) => s.id === suggestion.segmentId);
      if (!segment) continue;

      const segmentText = segment.text ?? '';
      if (!segmentText.trim()) {
        continue;
      }

      const field = fieldByKey.get(suggestion.fieldKey);
      if (!field) continue;

      const validation = this.validator.validate(
        field.characterType,
        segmentText,
        field.characterLimit,
      );

      const normalizedValue =
        validation.valid && validation.suggestedCorrection
          ? validation.suggestedCorrection
          : segmentText;

      await this.dbs.db
        .insert(baselineFieldAssignments)
        .values({
          baselineId,
          fieldKey: suggestion.fieldKey,
          assignedValue: normalizedValue,
          sourceSegmentId: suggestion.segmentId,
          assignedBy: userId,
          assignedAt: new Date(),
          suggestionConfidence: suggestion.confidence.toFixed(2),
          suggestionAccepted: null, // Not yet accepted or rejected
          modelVersionId,
        })
        .onConflictDoUpdate({
          target: [
            baselineFieldAssignments.baselineId,
            baselineFieldAssignments.fieldKey,
          ],
          set: {
            assignedValue: normalizedValue,
            sourceSegmentId: suggestion.segmentId,
            assignedBy: userId,
            assignedAt: new Date(),
            suggestionConfidence: suggestion.confidence.toFixed(2),
            suggestionAccepted: null,
            modelVersionId,
          },
        });

      suggestedAssignments.push({
        fieldKey: suggestion.fieldKey,
        assignedValue: segment.text,
        confidence: suggestion.confidence,
        sourceSegmentId: suggestion.segmentId,
      });
    }

    // 10. Log audit event
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
      },
    });

    return {
      suggestedAssignments,
      modelVersionId,
      suggestionCount: suggestedAssignments.length,
    };
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

  private async resolveActiveModel() {
    const [activeModel] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(eq(mlModelVersions.isActive, true))
      .orderBy(desc(mlModelVersions.trainedAt))
      .limit(1);

    if (activeModel) {
      return activeModel;
    }

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
    const modelName = 'all-MiniLM-L6-v2';
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
        filePath: 'sentence-transformers/all-MiniLM-L6-v2',
        metrics: { type: 'embedding', dimensions: 384 },
        trainedAt: new Date(),
        isActive: true,
        createdBy: 'system',
      })
      .returning();

    return newModel;
  }
}
