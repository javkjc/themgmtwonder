import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import { promises as fs } from 'fs';
import { DbService } from '../db/db.service';
import { AuditService, type AuditAction } from '../audit/audit.service';
import {
  attachmentOcrOutputs,
  attachments,
  extractedTextSegments,
  extractionBaselines,
  ocrResults,
  todos,
  baselineTables,
} from '../db/schema';
import { OcrParsingService } from './ocr-parsing.service';
import { OcrCorrectionsService } from './ocr-corrections.service';
import { CreateOcrFieldDto } from './dto/create-ocr-field.dto';

export type DerivedOcrStatus = 'complete' | 'failed';
type DerivedOcrProcessingStatus = 'completed' | 'failed';
export type OcrWorkerMeta = Record<string, unknown> | null;
export type OcrUtilizationType =
  | 'authoritative_record'
  | 'human_approval'
  | 'data_export';

type AttachmentOcrOutputRecord = typeof attachmentOcrOutputs.$inferSelect;

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrWorkerSegment = {
  text: string;
  confidence: number | null;
  boundingBox: BoundingBox | null;
  pageNumber: number;
};

type OcrWorkerPayload = {
  attachmentId: string;
  filePath: string;
  mimeType: string;
  filename?: string | null;
};

type OcrWorkerResult = {
  text: string;
  segments: OcrWorkerSegment[];
  meta: OcrWorkerMeta;
  workerHost: string;
};

function toMetadataObject(
  metadata?: Record<string, unknown> | string | null,
): Record<string, unknown> | null {
  if (metadata == null) {
    return null;
  }
  if (typeof metadata === 'object') {
    return metadata;
  }
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toWorkerMeta(
  metadataObject: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadataObject) {
    return null;
  }
  const candidate = metadataObject.workerMeta;
  return candidate && typeof candidate === 'object'
    ? (candidate as Record<string, unknown>)
    : null;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toOptionalInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

const utilizationSeverityRank: Record<OcrUtilizationType, number> = {
  data_export: 1,
  human_approval: 2,
  authoritative_record: 3,
};

const utilizationAuditEventMap: Record<OcrUtilizationType, string> = {
  authoritative_record: 'OCR_UTILIZED_RECORD',
  human_approval: 'OCR_UTILIZED_HUMAN_APPROVAL',
  data_export: 'OCR_UTILIZED_EXPORT',
};

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
    createdAt: Date;
  } | null;
  parsedFields: Array<{
    id: string;
    fieldName: string;
    originalValue: string;
    currentValue: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
    pageNumber: number | null;
    isCorrected: boolean;
    correctionCount: number;
    latestCorrectionAt: Date | null;
    correctionHistory: Array<{
      id: string;
      correctedBy: string;
      originalValue: string;
      correctedValue: string;
      correctionReason: string | null;
      createdAt: Date;
    }>;
  }>;
  utilizationType?: string | null;
}

@Injectable()
export class OcrService {
  constructor(
    private readonly dbs: DbService,
    private readonly auditService: AuditService,
    private readonly ocrParsingService: OcrParsingService,
    private readonly ocrCorrectionsService: OcrCorrectionsService,
  ) {}

  async createDerivedOutput({
    userId,
    attachmentId,
    extractedText,
    status,
    metadata,
    segments,
  }: {
    userId: string;
    attachmentId: string;
    extractedText: string;
    status: DerivedOcrStatus;
    metadata?: Record<string, unknown> | string | null;
    segments?: OcrWorkerSegment[] | null;
  }) {
    await this.ensureUserOwnsAttachment(userId, attachmentId);

    const processingStatus: DerivedOcrProcessingStatus =
      status === 'complete' ? 'completed' : 'failed';
    const metadataObject = toMetadataObject(metadata);
    const workerMeta = toWorkerMeta(metadataObject);
    const extractionPath = toOptionalString(workerMeta?.extractionPath);
    const preprocessingApplied =
      workerMeta &&
      Object.prototype.hasOwnProperty.call(workerMeta, 'preprocessingApplied')
        ? workerMeta.preprocessingApplied
        : null;
    const processingDurationMs = toOptionalInteger(workerMeta?.durationMs);

    await this.dbs.db
      .update(attachmentOcrOutputs)
      .set({ isCurrent: false })
      .where(eq(attachmentOcrOutputs.attachmentId, attachmentId));

    // Delete tables and reset all non-archived baselines when new OCR is created
    // Tables are tied to specific OCR extractions and must be recreated for new data
    const existingBaselines = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(
        and(
          eq(extractionBaselines.attachmentId, attachmentId),
          ne(extractionBaselines.status, 'archived'),
        ),
      );

    if (existingBaselines.length > 0) {
      const baselineIds = existingBaselines.map((b) => b.id);

      // Delete all tables from all baselines for this attachment
      // CASCADE delete will automatically remove cells and column mappings
      for (const baselineId of baselineIds) {
        await this.dbs.db
          .delete(baselineTables)
          .where(eq(baselineTables.baselineId, baselineId));
      }

      // Reset all baselines to draft status
      await this.dbs.db
        .update(extractionBaselines)
        .set({ status: 'draft' })
        .where(
          and(
            eq(extractionBaselines.attachmentId, attachmentId),
            ne(extractionBaselines.status, 'archived'),
          ),
        );

      // Log baseline resets
      for (const baseline of existingBaselines) {
        await this.auditService.log({
          action: 'baseline.reset_to_draft' as AuditAction,
          actorType: 'system',
          module: 'baseline' as any,
          resourceType: 'baseline',
          resourceId: baseline.id,
          details: {
            attachmentId,
            reason: 'New OCR extraction created',
            previousStatus: baseline.status,
            tablesDeleted: true,
          },
        });
      }
    }

    const [record] = await this.dbs.db
      .insert(attachmentOcrOutputs)
      .values({
        attachmentId,
        extractedText,
        metadata:
          metadata == null
            ? null
            : typeof metadata === 'string'
              ? metadata
              : JSON.stringify(metadata),
        extractionPath,
        preprocessingApplied,
        processingDurationMs,
        processingStatus,
        status: 'draft',
        isCurrent: true,
      })
      .returning();

    await this.replaceTextSegments(record.id, extractedText, segments ?? null);

    await this.auditService.log({
      action: 'OCR_DRAFT_CREATED',
      actorType: 'system',
      resourceType: 'attachment_ocr_output',
      resourceId: record.id,
      details: {
        attachmentId,
        extractedTextLength: extractedText?.length || 0,
      },
    });

    return record;
  }

  async extractFromWorker(payload: OcrWorkerPayload): Promise<OcrWorkerResult> {
    const workerHost = this.resolveWorkerHost();
    const controller = new AbortController();
    const OCR_TIMEOUT_MS = 90_000;
    const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
    try {
      let fileBuffer: Buffer;
      try {
        fileBuffer = await fs.readFile(payload.filePath);
      } catch {
        throw new InternalServerErrorException(
          'Unable to read attachment bytes for OCR',
        );
      }
      const start = fileBuffer.byteOffset;
      const end = start + fileBuffer.byteLength;
      const arrayBuffer = fileBuffer.buffer as ArrayBuffer;
      const bufferPart =
        start === 0 && end === arrayBuffer.byteLength
          ? arrayBuffer
          : arrayBuffer.slice(start, end);
      const fileBody = new Blob([bufferPart], {
        type: payload.mimeType ?? 'application/octet-stream',
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
      };
      if (payload.filename) {
        headers['x-filename'] = payload.filename;
      }
      if (payload.mimeType) {
        headers['x-mime-type'] = payload.mimeType;
      }

      const response = await fetch(`${workerHost}/ocr`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: fileBody,
      });

      const body = (await response.json().catch(() => null)) as {
        text?: string;
        segments?: unknown;
        meta?: unknown;
        error?: string;
        details?: string;
      } | null;

      if (!response.ok) {
        const message =
          (body && typeof body.error === 'string' && body.error) ||
          `OCR worker responded with ${response.status}`;
        const details =
          body && typeof body.details === 'string' ? body.details : undefined;
        const err = new Error(message);
        if (details) {
          (err as Error & { details?: string }).details = details;
        }
        throw err;
      }

      if (!body || typeof body.text !== 'string') {
        throw new Error('OCR worker returned an invalid response');
      }

      return {
        text: body.text,
        segments: this.normalizeWorkerSegments(body.segments),
        meta:
          body.meta && typeof body.meta === 'object'
            ? (body.meta as Record<string, unknown>)
            : null,
        workerHost,
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `OCR worker request timed out after ${OCR_TIMEOUT_MS / 1000} seconds`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async listByAttachment(userId: string, attachmentId: string) {
    await this.ensureUserOwnsAttachment(userId, attachmentId);

    return this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, attachmentId),
          eq(attachmentOcrOutputs.isCurrent, true),
        ),
      )
      .orderBy(desc(attachmentOcrOutputs.createdAt));
  }

  async getOutputForUser(userId: string, outputId: string) {
    const [output] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(eq(attachmentOcrOutputs.id, outputId))
      .limit(1);

    if (!output) {
      throw new NotFoundException('OCR output not found');
    }

    const attachment = await this.ensureUserOwnsAttachment(
      userId,
      output.attachmentId,
    );

    return {
      output,
      attachment,
    };
  }

  async getCurrentConfirmedOcr(attachmentId: string) {
    const [ocr] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, attachmentId),
          eq(attachmentOcrOutputs.status, 'confirmed'),
          eq(attachmentOcrOutputs.isCurrent, true),
        ),
      )
      .orderBy(
        desc(attachmentOcrOutputs.confirmedAt),
        desc(attachmentOcrOutputs.createdAt),
      )
      .limit(1);

    return ocr ?? null;
  }

  async getCurrentOcr(attachmentId: string) {
    const [ocr] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, attachmentId),
          eq(attachmentOcrOutputs.isCurrent, true),
        ),
      )
      .limit(1);

    return ocr ?? null;
  }

  async checkRedoEligibility(attachmentId: string): Promise<{
    allowed: boolean;
    reason?: string;
    currentOcr?: AttachmentOcrOutputRecord | null;
  }> {
    const currentOcr = await this.getCurrentConfirmedOcr(attachmentId);

    if (!currentOcr) {
      return { allowed: true };
    }

    if (!currentOcr.utilizationType) {
      return { allowed: true, currentOcr };
    }

    const reasons: Record<OcrUtilizationType, string> = {
      authoritative_record: 'Authoritative record created from this data',
      human_approval: 'Human approval committed',
      data_export: 'Data has been exported – must archive first',
    };

    const reason =
      reasons[currentOcr.utilizationType] ??
      'OCR has been utilized. Redo not allowed.';

    return {
      allowed: false,
      reason,
      currentOcr,
    };
  }

  async confirmOcrResult(
    ocrId: string,
    userId: string,
    editedExtractedText?: string,
  ) {
    const ocr = await this.dbs.db.query.attachmentOcrOutputs.findFirst({
      where: eq(attachmentOcrOutputs.id, ocrId),
    });

    if (!ocr) {
      throw new NotFoundException('OCR result not found');
    }

    await this.ensureUserOwnsAttachment(userId, ocr.attachmentId);

    if (ocr.status !== 'draft') {
      throw new BadRequestException(
        `Cannot confirm OCR output with status '${ocr.status}'`,
      );
    }

    if (ocr.processingStatus !== 'completed') {
      throw new BadRequestException(
        'Cannot confirm OCR output that was not successfully processed',
      );
    }

    const [existingConfirmed] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, ocr.attachmentId),
          eq(attachmentOcrOutputs.status, 'confirmed'),
          ne(attachmentOcrOutputs.id, ocrId),
        ),
      )
      .limit(1);

    if (existingConfirmed) {
      throw new BadRequestException(
        'Attachment already has a confirmed OCR result',
      );
    }

    const finalExtractedText =
      editedExtractedText !== undefined
        ? editedExtractedText
        : ocr.extractedText;

    const existingSegments =
      editedExtractedText === undefined
        ? (
            await this.dbs.db
              .select()
              .from(extractedTextSegments)
              .where(eq(extractedTextSegments.attachmentOcrOutputId, ocrId))
          ).map((segment) => ({
            text: segment.text,
            confidence:
              segment.confidence === null || segment.confidence === undefined
                ? null
                : Number(segment.confidence),
            boundingBox: segment.boundingBox as BoundingBox | null,
            pageNumber: segment.pageNumber ?? 1,
          }))
        : [];

    const [confirmedOcr] = await this.dbs.db
      .update(attachmentOcrOutputs)
      .set({
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmedBy: userId,
        extractedText: finalExtractedText,
      })
      .where(eq(attachmentOcrOutputs.id, ocrId))
      .returning();

    if (!confirmedOcr) {
      throw new InternalServerErrorException('Failed to confirm OCR output');
    }

    await this.replaceTextSegments(
      ocrId,
      finalExtractedText,
      editedExtractedText === undefined ? existingSegments : null,
    );

    await this.auditService.log({
      userId,
      actorType: 'user',
      action: 'OCR_CONFIRMED',
      resourceType: 'attachment_ocr_output',
      resourceId: ocrId,
      details: {
        attachmentId: ocr.attachmentId,
        wasEdited: editedExtractedText !== undefined,
        originalTextLength: ocr.extractedText?.length || 0,
        finalTextLength: finalExtractedText?.length || 0,
      },
    });

    return confirmedOcr;
  }

  async markOcrUtilized(
    ocrId: string,
    utilizationType: OcrUtilizationType,
    metadata?: Record<string, unknown>,
  ) {
    const ocr = await this.dbs.db.query.attachmentOcrOutputs.findFirst({
      where: eq(attachmentOcrOutputs.id, ocrId),
    });

    if (!ocr) {
      throw new NotFoundException('OCR result not found');
    }

    if (ocr.status !== 'confirmed') {
      throw new BadRequestException(
        `Cannot mark OCR output as utilized when status is '${ocr.status}'.`,
      );
    }

    const existingType = (ocr.utilizationType ??
      null) as OcrUtilizationType | null;
    if (existingType) {
      if (existingType === utilizationType) {
        return;
      }

      const existingSeverity = utilizationSeverityRank[existingType];
      const requestedSeverity = utilizationSeverityRank[utilizationType];

      if (requestedSeverity <= existingSeverity) {
        return;
      }
    }

    const finalMetadata = metadata ?? null;

    await this.dbs.db
      .update(attachmentOcrOutputs)
      .set({
        utilizedAt: new Date(),
        utilizationType,
        utilizationMetadata: finalMetadata,
      })
      .where(eq(attachmentOcrOutputs.id, ocrId));

    const auditAction = utilizationAuditEventMap[
      utilizationType
    ] as AuditAction;

    await this.auditService.log({
      actorType: 'system',
      action: auditAction,
      resourceType: 'attachment_ocr_output',
      resourceId: ocrId,
      details: {
        utilizationType,
        attachmentId: ocr.attachmentId,
        ...(metadata ?? {}),
      },
    });
  }

  /**
   * Manually add a structured field to an OCR output.
   * Treated as a correction-style mutation (requires reason).
   */
  async createManualField(
    ocrId: string,
    userId: string,
    dto: CreateOcrFieldDto,
  ) {
    const ocr = await this.dbs.db.query.attachmentOcrOutputs.findFirst({
      where: eq(attachmentOcrOutputs.id, ocrId),
    });

    if (!ocr) {
      throw new NotFoundException('OCR output not found');
    }

    await this.ensureUserOwnsAttachment(userId, ocr.attachmentId);

    if (ocr.status !== 'draft') {
      throw new BadRequestException(
        'Can only add fields to OCR outputs in Draft status',
      );
    }

    if (ocr.utilizationType) {
      throw new BadRequestException(
        `Cannot add fields to utilized extraction (utilization: ${ocr.utilizationType})`,
      );
    }

    const normalizedValue = dto.fieldValue.trim();
    const normalizedReason = dto.reason.trim();

    if (!normalizedValue) {
      throw new BadRequestException(
        'Field value cannot be empty or whitespace',
      );
    }

    if (!normalizedReason) {
      throw new BadRequestException('Reason cannot be empty or whitespace');
    }

    const [newField] = await this.dbs.db
      .insert(ocrResults)
      .values({
        attachmentOcrOutputId: ocrId,
        fieldName: dto.fieldName,
        fieldType: dto.fieldType,
        fieldValue: normalizedValue,
        confidence: '1.0000', // Manual fields have 100% confidence by definition
        createdAt: new Date(),
      })
      .returning();

    await this.ocrCorrectionsService.logManualFieldAddition(
      newField.id,
      normalizedValue,
      normalizedReason,
      userId,
    );

    await this.auditService.log({
      userId,
      actorType: 'user',
      action: 'ocr.field_added_manually',
      module: 'ocr',
      resourceType: 'ocr_result',
      resourceId: newField.id,
      details: {
        ocrId,
        fieldKey: dto.fieldName,
        fieldType: dto.fieldType,
        before: null,
        after: normalizedValue,
        reason: normalizedReason,
      },
    });

    return newField;
  }

  /**
   * Manually delete a structured field from an OCR output.
   */
  async deleteField(fieldId: string, userId: string, reason: string) {
    const [field] = await this.dbs.db
      .select()
      .from(ocrResults)
      .where(eq(ocrResults.id, fieldId))
      .limit(1);

    if (!field) {
      throw new NotFoundException('OCR field not found');
    }

    const ocr = await this.dbs.db.query.attachmentOcrOutputs.findFirst({
      where: eq(attachmentOcrOutputs.id, field.attachmentOcrOutputId),
    });

    if (!ocr) {
      throw new InternalServerErrorException('Orphaned OCR field');
    }

    await this.ensureUserOwnsAttachment(userId, ocr.attachmentId);

    // Blocked if utilized
    if (ocr.utilizationType) {
      throw new BadRequestException(
        `Cannot delete fields from utilized extraction (utilization: ${ocr.utilizationType})`,
      );
    }

    await this.dbs.db.delete(ocrResults).where(eq(ocrResults.id, fieldId));

    await this.auditService.log({
      userId,
      actorType: 'user',
      action: 'ocr.field_deleted_manually',
      module: 'ocr',
      resourceType: 'ocr_result',
      resourceId: fieldId,
      details: {
        ocrId: ocr.id,
        fieldName: field.fieldName,
        fieldValue: field.fieldValue,
        reason,
      },
    });

    return { success: true };
  }

  async archiveOcrResult(ocrId: string, userId: string, archiveReason: string) {
    const ocr = await this.dbs.db.query.attachmentOcrOutputs.findFirst({
      where: eq(attachmentOcrOutputs.id, ocrId),
    });

    if (!ocr) {
      throw new NotFoundException('OCR result not found');
    }

    await this.ensureUserOwnsAttachment(userId, ocr.attachmentId);

    if (ocr.status !== 'confirmed') {
      throw new BadRequestException(
        `Cannot archive OCR output with status '${ocr.status}'. Must be 'confirmed'.`,
      );
    }

    if (ocr.utilizationType !== 'data_export') {
      throw new BadRequestException(
        `Can only archive OCR with Category C utilization (data_export). ` +
          `Current utilization: ${ocr.utilizationType ?? 'none'}.`,
      );
    }

    const [archivedOcr] = await this.dbs.db
      .update(attachmentOcrOutputs)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        archivedBy: userId,
        archiveReason,
      })
      .where(eq(attachmentOcrOutputs.id, ocrId))
      .returning();

    if (!archivedOcr) {
      throw new InternalServerErrorException('Failed to archive OCR output');
    }

    await this.auditService.log({
      userId,
      actorType: 'user',
      action: 'OCR_ARCHIVED',
      resourceType: 'attachment_ocr_output',
      resourceId: ocrId,
      details: {
        attachmentId: ocr.attachmentId,
        archiveReason,
        previousUtilization: ocr.utilizationType,
      },
    });

    return archivedOcr;
  }

  async verifyUserOwnsAttachment(userId: string, attachmentId: string) {
    await this.ensureUserOwnsAttachment(userId, attachmentId);
  }

  /**
   * Get OCR results with correction history for an attachment.
   * Returns raw OCR output, parsed fields, and correction history.
   */
  async getOcrResultsWithCorrections(
    attachmentId: string,
    userId: string,
  ): Promise<OcrResultsWithCorrectionsResponse> {
    const attachment = await this.ensureUserOwnsAttachment(
      userId,
      attachmentId,
    );

    const rawOcrOutput = await this.getCurrentOcr(attachmentId);
    const parsedResults = rawOcrOutput
      ? await this.ocrParsingService.getOcrResultsByOutputId(rawOcrOutput.id)
      : [];

    const parsedFields = await Promise.all(
      parsedResults.map(async (result) => {
        const correctionHistory =
          await this.ocrCorrectionsService.getCorrectionHistory(result.id);
        const latestCorrection =
          correctionHistory[correctionHistory.length - 1];

        return {
          id: result.id,
          fieldName: result.fieldName,
          fieldType: result.fieldType ?? 'text',
          originalValue: result.fieldValue || '',
          currentValue:
            latestCorrection?.correctedValue || result.fieldValue || '',
          confidence: result.confidence
            ? parseFloat(result.confidence.toString())
            : 0,
          boundingBox: result.boundingBox as {
            x: number;
            y: number;
            width: number;
            height: number;
          } | null,
          pageNumber: result.pageNumber,
          isCorrected: correctionHistory.length > 0,
          correctionCount: correctionHistory.length,
          latestCorrectionAt: latestCorrection?.createdAt || null,
          correctionHistory: correctionHistory.map((correction) => ({
            id: correction.id,
            correctedBy: correction.correctedBy,
            originalValue: correction.originalValue || '',
            correctedValue: correction.correctedValue,
            correctionReason: correction.correctionReason,
            createdAt: correction.createdAt,
          })),
        };
      }),
    );

    return {
      attachmentId,
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        todoId: attachment.todoId,
      },
      rawOcr: rawOcrOutput
        ? {
            id: rawOcrOutput.id,
            extractedText: rawOcrOutput.extractedText || '',
            status: rawOcrOutput.status,
            createdAt: rawOcrOutput.createdAt,
          }
        : null,
      utilizationType: rawOcrOutput?.utilizationType || null,
      parsedFields,
    };
  }

  private async ensureUserOwnsAttachment(userId: string, attachmentId: string) {
    const attachment = await this.dbs.db.query.attachments.findFirst({
      where: eq(attachments.id, attachmentId),
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const todo = await this.dbs.db.query.todos.findFirst({
      where: and(eq(todos.id, attachment.todoId), eq(todos.userId, userId)),
    });

    if (!todo) {
      throw new ForbiddenException('Access denied');
    }

    return attachment;
  }

  resolveWorkerHost(): string {
    const configured = process.env.OCR_WORKER_BASE_URL;
    if (!configured) {
      throw new InternalServerErrorException(
        'OCR worker base URL is not configured. Set OCR_WORKER_BASE_URL.',
      );
    }
    return configured.replace(/\/+$/, '');
  }

  private clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  private normalizeBoundingBox(raw: any): BoundingBox | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const { x, y, width, height } = raw as Record<string, unknown>;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number'
    ) {
      return null;
    }

    const clampedWidth = this.clamp01(width);
    const clampedHeight = this.clamp01(height);

    if (clampedWidth <= 0 || clampedHeight <= 0) {
      return null;
    }

    return {
      x: this.clamp01(x),
      y: this.clamp01(y),
      width: clampedWidth,
      height: clampedHeight,
    };
  }

  private normalizeWorkerSegments(raw: unknown): OcrWorkerSegment[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const segments: OcrWorkerSegment[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const { text, confidence, boundingBox, pageNumber } = item as Record<
        string,
        unknown
      >;
      if (typeof text !== 'string' || !text.trim()) {
        continue;
      }

      const normalizedConfidence =
        typeof confidence === 'number' ? this.clamp01(confidence) : null;
      const normalizedPage =
        Number.isFinite(pageNumber) && (pageNumber as number) > 0
          ? Math.trunc(pageNumber as number)
          : 1;
      const normalizedBoundingBox = this.normalizeBoundingBox(boundingBox);

      segments.push({
        text: text.trim(),
        confidence: normalizedConfidence,
        boundingBox: normalizedBoundingBox,
        pageNumber: normalizedPage,
      });
    }

    return segments;
  }

  private async replaceTextSegments(
    attachmentOcrOutputId: string,
    extractedText: string | null | undefined,
    structuredSegments?: OcrWorkerSegment[] | null,
  ) {
    // Clear any existing segments for this OCR output (e.g., re-confirm with edited text)
    await this.dbs.db
      .delete(extractedTextSegments)
      .where(
        eq(extractedTextSegments.attachmentOcrOutputId, attachmentOcrOutputId),
      );

    const normalizedSegments = this.normalizeWorkerSegments(structuredSegments);

    if (normalizedSegments.length > 0) {
      await this.dbs.db.insert(extractedTextSegments).values(
        normalizedSegments.map((segment) => ({
          attachmentOcrOutputId,
          text: segment.text,
          confidence:
            segment.confidence === null || segment.confidence === undefined
              ? null
              : segment.confidence.toString(),
          boundingBox: segment.boundingBox,
          pageNumber: segment.pageNumber,
          createdAt: new Date(),
        })),
      );
      return;
    }

    const normalized = (extractedText ?? '').trim();
    if (!normalized) {
      return;
    }

    const lines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return;
    }

    await this.dbs.db.insert(extractedTextSegments).values(
      lines.map((text) => ({
        attachmentOcrOutputId,
        text,
        confidence: null,
        boundingBox: null,
        pageNumber: 1, // Worker does not provide page numbers; default to first page
        createdAt: new Date(),
      })),
    );
  }
}
