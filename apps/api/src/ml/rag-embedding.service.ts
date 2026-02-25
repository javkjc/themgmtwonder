import { Logger } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DbService } from '../db/db.service';
import {
  attachmentOcrOutputs,
  baselineEmbeddings,
  baselineFieldAssignments,
  extractionBaselines,
  extractedTextSegments,
} from '../db/schema';

type QualityGate = 'math_pass' | 'zero_corrections' | 'admin';

type SerializeSegment = {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  pageNumber: number;
  zone: string;
};

export class RagEmbeddingService {
  private readonly logger = new Logger(RagEmbeddingService.name);
  private readonly mlServiceUrl =
    process.env.ML_SERVICE_URL ?? 'http://ml-service:5000';
  private readonly ollamaEmbeddingsUrl = 'http://ollama:11434/api/embeddings';
  private readonly timeoutMs = 5000;

  constructor(
    private readonly dbs: DbService,
    private readonly auditService: AuditService,
  ) {}

  async embedOnConfirm(baselineId: string): Promise<void> {
    const [baseline] = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(eq(extractionBaselines.id, baselineId))
      .limit(1);

    if (!baseline) {
      this.logger.warn(`rag.embed.skipped baselineId=${baselineId} reason=not_found`);
      return;
    }

    const assignments = await this.dbs.db
      .select({
        fieldKey: baselineFieldAssignments.fieldKey,
        assignedValue: baselineFieldAssignments.assignedValue,
        suggestionAccepted: baselineFieldAssignments.suggestionAccepted,
        llmReasoning: baselineFieldAssignments.llmReasoning,
        zone: baselineFieldAssignments.zone,
        boundingBox: baselineFieldAssignments.boundingBox,
        sourceSegmentId: baselineFieldAssignments.sourceSegmentId,
      })
      .from(baselineFieldAssignments)
      .where(eq(baselineFieldAssignments.baselineId, baselineId));

    const qualityGate = this.resolveQualityGate(baseline, assignments);
    if (!qualityGate) {
      this.logger.log(
        `rag.embed.skipped baselineId=${baselineId} reason=quality_gate_failed`,
      );
      return;
    }

    const [currentOcr] = await this.dbs.db
      .select({
        id: attachmentOcrOutputs.id,
        documentTypeId: attachmentOcrOutputs.documentTypeId,
        metadata: attachmentOcrOutputs.metadata,
      })
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, baseline.attachmentId),
          eq(attachmentOcrOutputs.isCurrent, true),
        ),
      )
      .limit(1);

    if (!currentOcr?.documentTypeId) {
      this.logger.log(
        `rag.embed.skipped baselineId=${baselineId} reason=missing_document_type`,
      );
      return;
    }

    const sourceSegmentIds = assignments
      .map((a) => a.sourceSegmentId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const sourceSegmentsById = new Map<string, number>();
    if (sourceSegmentIds.length > 0) {
      const sourceSegments = await this.dbs.db
        .select({
          id: extractedTextSegments.id,
          pageNumber: extractedTextSegments.pageNumber,
        })
        .from(extractedTextSegments)
        .where(inArray(extractedTextSegments.id, sourceSegmentIds));

      for (const segment of sourceSegments) {
        sourceSegmentsById.set(segment.id, segment.pageNumber ?? 1);
      }
    }

    const serializeSegments: SerializeSegment[] = assignments
      .filter(
        (assignment) =>
          typeof assignment.assignedValue === 'string' &&
          assignment.assignedValue.trim().length > 0,
      )
      .map((assignment) => ({
        text: assignment.assignedValue!,
        boundingBox: this.toBoundingBox(assignment.boundingBox),
        pageNumber: assignment.sourceSegmentId
          ? (sourceSegmentsById.get(assignment.sourceSegmentId) ?? 1)
          : 1,
        zone: assignment.zone ?? 'unknown',
      }));

    if (serializeSegments.length === 0) {
      this.logger.log(
        `rag.embed.skipped baselineId=${baselineId} reason=no_serializable_fields`,
      );
      return;
    }

    const pageWidth = this.parsePageWidth(currentOcr.metadata);
    const serializedText = await this.serializeWithMlService(
      serializeSegments,
      pageWidth,
    );

    if (!serializedText.trim()) {
      this.logger.log(
        `rag.embed.skipped baselineId=${baselineId} reason=empty_serialized_text`,
      );
      return;
    }

    const embedding = await this.embedWithOllama(serializedText);
    if (embedding.length !== 768) {
      this.logger.warn(
        `rag.embed.skipped baselineId=${baselineId} reason=embedding_dimension_mismatch dim=${embedding.length}`,
      );
      return;
    }

    const existingRows = await this.dbs.db
      .select({ id: baselineEmbeddings.id })
      .from(baselineEmbeddings)
      .where(eq(baselineEmbeddings.documentTypeId, currentOcr.documentTypeId));

    if (existingRows.length >= 5) {
      const [oldestNonGold] = await this.dbs.db
        .select({
          id: baselineEmbeddings.id,
        })
        .from(baselineEmbeddings)
        .where(
          and(
            eq(baselineEmbeddings.documentTypeId, currentOcr.documentTypeId),
            eq(baselineEmbeddings.goldStandard, false),
          ),
        )
        .orderBy(asc(baselineEmbeddings.createdAt))
        .limit(1);

      if (!oldestNonGold) {
        this.logger.log(
          `rag.embed.skipped baselineId=${baselineId} reason=volume_cap_only_gold documentTypeId=${currentOcr.documentTypeId}`,
        );
        return;
      }

      await this.dbs.db
        .delete(baselineEmbeddings)
        .where(eq(baselineEmbeddings.id, oldestNonGold.id));
    }

    const confirmedFields = Object.fromEntries(
      assignments.map((assignment) => [
        assignment.fieldKey,
        assignment.assignedValue ?? null,
      ]),
    );

    await this.dbs.db.insert(baselineEmbeddings).values({
      baselineId,
      documentTypeId: currentOcr.documentTypeId,
      embedding,
      serializedText,
      confirmedFields,
      isSynthetic: false,
      goldStandard:
        (baseline as Record<string, unknown>).goldStandard === true ||
        (baseline as Record<string, unknown>).gold_standard === true,
      qualityGate,
      createdAt: new Date(),
    });

    await this.auditService.log({
      userId: baseline.confirmedBy ?? null,
      action: 'rag.embed.stored' as any,
      module: 'ml',
      resourceType: 'baseline',
      resourceId: baselineId,
      details: {
        baselineId,
        documentTypeId: currentOcr.documentTypeId,
        qualityGate,
      },
    });

    this.logger.log(
      `rag.embed.stored baselineId=${baselineId} documentTypeId=${currentOcr.documentTypeId} qualityGate=${qualityGate}`,
    );
  }

  private resolveQualityGate(
    baseline: typeof extractionBaselines.$inferSelect,
    assignments: Array<{
      suggestionAccepted: boolean | null;
      llmReasoning: string | null;
    }>,
  ): QualityGate | null {
    const baselineAsRecord = baseline as Record<string, unknown>;
    const isGoldAdmin =
      baselineAsRecord.goldStandard === true ||
      baselineAsRecord.gold_standard === true;

    if (isGoldAdmin) {
      return 'admin';
    }

    const hasMathPass = assignments.some((assignment) => {
      if (!assignment.llmReasoning) {
        return false;
      }
      try {
        const parsed = JSON.parse(assignment.llmReasoning) as Record<
          string,
          unknown
        >;
        return parsed.mathReconciliation === 'pass';
      } catch {
        return false;
      }
    });

    if (hasMathPass) {
      return 'math_pass';
    }

    const hasAnyAssignments = assignments.length > 0;
    const zeroCorrections =
      hasAnyAssignments &&
      assignments.every((assignment) => assignment.suggestionAccepted === true);

    if (zeroCorrections) {
      return 'zero_corrections';
    }

    return null;
  }

  private parsePageWidth(metadata: string | null): number {
    if (!metadata) {
      return 1000;
    }

    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>;
      const value = parsed.pageWidth ?? parsed.page_width;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    } catch {
      return 1000;
    }

    return 1000;
  }

  private toBoundingBox(
    value: unknown,
  ): { x: number; y: number; width: number; height: number } | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    const x = candidate.x;
    const y = candidate.y;
    const width = candidate.width;
    const height = candidate.height;

    if (
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof width === 'number' &&
      typeof height === 'number'
    ) {
      return { x, y, width, height };
    }

    return null;
  }

  private async serializeWithMlService(
    segments: SerializeSegment[],
    pageWidth: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.mlServiceUrl}/ml/serialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments,
          pageWidth,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`serialize http status ${response.status}`);
      }

      const payload = (await response.json()) as { serializedText?: unknown };
      if (typeof payload.serializedText !== 'string') {
        throw new Error('serialize payload missing serializedText');
      }

      return payload.serializedText;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async embedWithOllama(serializedText: string): Promise<number[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.ollamaEmbeddingsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: serializedText,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`embedding http status ${response.status}`);
      }

      const payload = (await response.json()) as { embedding?: unknown };
      if (!Array.isArray(payload.embedding)) {
        throw new Error('embedding payload malformed');
      }

      return payload.embedding.filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
