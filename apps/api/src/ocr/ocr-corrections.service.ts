import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InferModel, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  attachmentOcrOutputs,
  attachments,
  ocrCorrections,
  ocrResults,
  todos,
} from '../db/schema';
import { AuditService } from '../audit/audit.service';

export type OcrCorrection = InferModel<typeof ocrCorrections, 'select'>;

type OcrResultRecord = {
  id: string;
  fieldName: string;
  fieldValue: string | null;
  attachmentOcrOutputId: string;
};

@Injectable()
export class OcrCorrectionsService {
  constructor(
    private readonly dbs: DbService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Stores a new correction for an OCR field and logs the change for audit.
   */
  async createCorrection(
    ocrResultId: string,
    correctedValue: string,
    correctionReason: string | null,
    userId: string,
  ): Promise<OcrCorrection> {
    if (!correctedValue || correctedValue.trim().length === 0) {
      throw new BadRequestException('Corrected value cannot be empty');
    }

    const ocrResult = await this.loadOcrResult(ocrResultId);
    const ownership = await this.ensureOwnership(
      ocrResult.attachmentOcrOutputId,
      userId,
    );

    if (ownership.ocrStatus !== 'confirmed') {
      throw new BadRequestException(
        'OCR output must be confirmed before corrections can be created',
      );
    }

    const [correction] = await this.dbs.db
      .insert(ocrCorrections)
      .values({
        ocrResultId,
        correctedBy: userId,
        originalValue: ocrResult.fieldValue,
        correctedValue,
        correctionReason: correctionReason ?? null,
      })
      .returning();

    await this.auditService.log({
      action: 'ocr.field_corrected',
      module: 'ocr',
      resourceType: 'ocr_result',
      resourceId: ocrResultId,
      details: {
        fieldName: ocrResult.fieldName,
        originalValue: ocrResult.fieldValue,
        correctedValue,
        correctionReason,
      },
    });

    return correction;
  }

  /**
   * Returns all corrections for an OCR result in chronological order.
   */
  async getCorrectionHistory(ocrResultId: string): Promise<OcrCorrection[]> {
    await this.loadOcrResult(ocrResultId);
    const corrections = await this.dbs.db
      .select()
      .from(ocrCorrections)
      .where(eq(ocrCorrections.ocrResultId, ocrResultId));

    return this.sortCorrectionsByDate(corrections);
  }

  /**
   * Returns the latest value for an OCR field, preferring the most recent correction.
   */
  async getLatestValue(
    ocrResultId: string,
  ): Promise<{ value: string; isCorrected: boolean; correctedAt?: Date }> {
    const ocrResult = await this.loadOcrResult(ocrResultId);
    const corrections = await this.dbs.db
      .select()
      .from(ocrCorrections)
      .where(eq(ocrCorrections.ocrResultId, ocrResultId));
    const sorted = this.sortCorrectionsByDate(corrections);
    const latest = sorted[sorted.length - 1];

    if (latest) {
      return {
        value: latest.correctedValue,
        isCorrected: true,
        correctedAt: latest.createdAt,
      };
    }

    return {
      value: ocrResult.fieldValue ?? '',
      isCorrected: false,
    };
  }

  private async loadOcrResult(ocrResultId: string): Promise<OcrResultRecord> {
    const [ocrResult] = await this.dbs.db
      .select({
        id: ocrResults.id,
        fieldName: ocrResults.fieldName,
        fieldValue: ocrResults.fieldValue,
        attachmentOcrOutputId: ocrResults.attachmentOcrOutputId,
      })
      .from(ocrResults)
      .where(eq(ocrResults.id, ocrResultId))
      .limit(1);

    if (!ocrResult) {
      throw new NotFoundException(`OCR result ${ocrResultId} not found`);
    }

    return ocrResult as OcrResultRecord;
  }

  private async ensureOwnership(
    attachmentOcrOutputId: string,
    userId: string,
  ): Promise<{ todoOwnerId: string; ocrStatus: string | null }> {
    const [chain] = await this.dbs.db
      .select({
        todoOwnerId: todos.userId,
        ocrStatus: attachmentOcrOutputs.status,
      })
      .from(attachmentOcrOutputs)
      .innerJoin(
        attachments,
        eq(attachments.id, attachmentOcrOutputs.attachmentId),
      )
      .innerJoin(todos, eq(todos.id, attachments.todoId))
      .where(eq(attachmentOcrOutputs.id, attachmentOcrOutputId))
      .limit(1);

    if (!chain || !chain.todoOwnerId) {
      throw new BadRequestException(
        'Cannot correct OCR result for deleted attachment',
      );
    }

    if (chain.todoOwnerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to correct this OCR result',
      );
    }

    return chain;
  }

  private sortCorrectionsByDate(corrections: OcrCorrection[]): OcrCorrection[] {
    return [...corrections].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async logManualFieldAddition(
    ocrResultId: string,
    correctedValue: string,
    correctionReason: string,
    userId: string,
  ): Promise<OcrCorrection> {
    const [correction] = await this.dbs.db
      .insert(ocrCorrections)
      .values({
        ocrResultId,
        correctedBy: userId,
        originalValue: null,
        correctedValue,
        correctionReason,
      })
      .returning();

    return correction;
  }
}
