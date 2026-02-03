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
  todos,
} from '../db/schema';
import { OcrParsingService } from './ocr-parsing.service';
import { OcrCorrectionsService } from './ocr-corrections.service';

export type DerivedOcrStatus = 'complete' | 'failed';
type DerivedOcrProcessingStatus = 'completed' | 'failed';
export type OcrWorkerMeta = Record<string, unknown> | null;
export type OcrUtilizationType =
  | 'authoritative_record'
  | 'workflow_approval'
  | 'data_export';

type AttachmentOcrOutputRecord = typeof attachmentOcrOutputs.$inferSelect;

type OcrWorkerPayload = {
  attachmentId: string;
  filePath: string;
  mimeType: string;
  filename?: string | null;
};

type OcrWorkerResult = {
  text: string;
  meta: OcrWorkerMeta;
  workerHost: string;
};

const utilizationSeverityRank: Record<OcrUtilizationType, number> = {
  data_export: 1,
  workflow_approval: 2,
  authoritative_record: 3,
};

const utilizationAuditEventMap: Record<OcrUtilizationType, string> = {
  authoritative_record: 'OCR_UTILIZED_RECORD',
  workflow_approval: 'OCR_UTILIZED_WORKFLOW',
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
  }: {
    userId: string;
    attachmentId: string;
    extractedText: string;
    status: DerivedOcrStatus;
    metadata?: Record<string, unknown> | string | null;
  }) {
    await this.ensureUserOwnsAttachment(userId, attachmentId);

    const processingStatus: DerivedOcrProcessingStatus =
      status === 'complete' ? 'completed' : 'failed';

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
        processingStatus,
        status: 'draft',
      })
      .returning();

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
      } catch (err) {
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

      const body = await response.json().catch(() => null);

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
        meta:
          body.meta && typeof body.meta === 'object'
            ? (body.meta as Record<string, unknown>)
            : null,
        workerHost,
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`OCR worker request timed out after ${OCR_TIMEOUT_MS / 1000} seconds`);
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
      .where(eq(attachmentOcrOutputs.attachmentId, attachmentId))
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

    const attachment = await this.ensureUserOwnsAttachment(userId, output.attachmentId);

    return {
      output,
      attachment,
    };
  }

  async getCurrentConfirmedOcr(
    attachmentId: string,
  ) {
    const [ocr] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, attachmentId),
          eq(attachmentOcrOutputs.status, 'confirmed'),
        ),
      )
      .orderBy(
        desc(attachmentOcrOutputs.confirmedAt),
        desc(attachmentOcrOutputs.createdAt),
      )
      .limit(1);

    return ocr ?? null;
  }

  async checkRedoEligibility(
    attachmentId: string,
  ): Promise<{
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
      authoritative_record:
        'Authoritative record created from this OCR. Redo not allowed.',
      workflow_approval:
        'Workflow approval committed using this OCR. Redo not allowed.',
      data_export:
        'Data has been exported. Must archive current OCR before redo.',
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
      editedExtractedText !== undefined ? editedExtractedText : ocr.extractedText;

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

    const existingType = (ocr.utilizationType ?? null) as OcrUtilizationType | null;
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

    const auditAction = utilizationAuditEventMap[utilizationType] as AuditAction;

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

  async archiveOcrResult(
    ocrId: string,
    userId: string,
    archiveReason: string,
  ) {
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
    const attachment = await this.ensureUserOwnsAttachment(userId, attachmentId);

    const rawOcrOutput = await this.getCurrentConfirmedOcr(attachmentId);
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
      parsedFields,
    };
  }

  private async ensureUserOwnsAttachment(
    userId: string,
    attachmentId: string,
  ) {
    const [attachment] = await this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId));

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(
        and(
          eq(todos.id, attachment.todoId),
          eq(todos.userId, userId),
        ),
      );

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
}
