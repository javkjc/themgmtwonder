import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from '../common/csrf';
import { JwtAuthGuard } from '../auth/auth.guard';
import { DbService } from '../db/db.service';
import { eq } from 'drizzle-orm';
import {
  attachmentOcrOutputs,
  attachments,
  ocrResults,
  todos,
} from '../db/schema';
import { OcrCorrectionsService } from './ocr-corrections.service';
import { OcrParsingService } from './ocr-parsing.service';
import { OcrService } from './ocr.service';
import { ArchiveOcrDto } from './dto/archive-ocr.dto';
import { ConfirmOcrDto } from './dto/confirm-ocr.dto';
import { CreateOcrCorrectionDto } from './dto/create-ocr-correction.dto';
import { CreateOcrFieldDto } from './dto/create-ocr-field.dto';
import { DeleteOcrFieldDto } from './dto/delete-ocr-field.dto';

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller()
export class OcrController {
  constructor(
    private readonly ocrService: OcrService,
    private readonly ocrParsingService: OcrParsingService,
    private readonly ocrCorrectionsService: OcrCorrectionsService,
    private readonly dbs: DbService,
  ) {}

  /**
   * Confirm a draft OCR result so it becomes the authoritative record for the attachment.
   */
  @Post('ocr/:ocrId/confirm')
  async confirmOcr(
    @Req() req: { user: { userId: string } },
    @Param('ocrId') ocrId: string,
    @Body() dto: ConfirmOcrDto,
  ) {
    return this.ocrService.confirmOcrResult(
      ocrId,
      req.user.userId,
      dto.editedExtractedText,
    );
  }

  /**
   * Manually add a structured field to an OCR output.
   */
  @Post('ocr/:ocrId/fields')
  async createField(
    @Req() req: { user: { userId: string } },
    @Param('ocrId') ocrId: string,
    @Body() dto: CreateOcrFieldDto,
  ) {
    return this.ocrService.createManualField(ocrId, req.user.userId, dto);
  }

  /**
   * Manually delete a structured field from an OCR output.
   */
  @Delete('ocr-results/:fieldId')
  async deleteField(
    @Req() req: { user: { userId: string } },
    @Param('fieldId') fieldId: string,
    @Body() dto: DeleteOcrFieldDto,
  ) {
    return this.ocrService.deleteField(fieldId, req.user.userId, dto.reason);
  }

  /**
   * Archive a confirmed OCR result that has been used for data exports.
   */
  @Post('ocr/:ocrId/archive')
  async archiveOcr(
    @Req() req: { user: { userId: string } },
    @Param('ocrId') ocrId: string,
    @Body() dto: ArchiveOcrDto,
  ) {
    return this.ocrService.archiveOcrResult(
      ocrId,
      req.user.userId,
      dto.archiveReason,
    );
  }

  /**
   * Trigger parsing of the confirmed OCR output for an attachment and return the parsed field IDs.
   */
  @Post('attachments/:attachmentId/ocr/parse')
  async parseAttachmentOcr(
    @Req() req: { user: { userId: string } },
    @Param('attachmentId') attachmentId: string,
  ) {
    const userId = req.user.userId;
    await this.ocrService.verifyUserOwnsAttachment(userId, attachmentId);

    const confirmedOutput =
      await this.ocrService.getCurrentConfirmedOcr(attachmentId);
    if (!confirmedOutput) {
      throw new NotFoundException(
        'No confirmed OCR output found for this attachment',
      );
    }

    const parsedResults = await this.ocrParsingService.parseOcrOutput(
      confirmedOutput.id,
    );

    return {
      parsedFields: parsedResults.length,
      ocrResultIds: parsedResults.map((result) => result.id),
    };
  }

  /**
   * Retrieve the confirmed OCR results and their correction history for an attachment.
   */
  @Get('attachments/:attachmentId/ocr/results')
  async getAttachmentOcrResults(
    @Req() req: { user: { userId: string } },
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.ocrService.getOcrResultsWithCorrections(
      attachmentId,
      req.user.userId,
    );
  }

  /**
   * Create a correction for a parsed OCR field.
   */
  @Post('ocr-results/:ocrResultId/corrections')
  async createOcrCorrection(
    @Req() req: { user: { userId: string } },
    @Param('ocrResultId') ocrResultId: string,
    @Body() dto: CreateOcrCorrectionDto,
  ) {
    return this.ocrCorrectionsService.createCorrection(
      ocrResultId,
      dto.correctedValue,
      dto.correctionReason ?? null,
      req.user.userId,
    );
  }

  /**
   * List the correction history for a specific OCR field.
   */
  @Get('ocr-results/:ocrResultId/corrections')
  async getOcrCorrectionHistory(
    @Req() req: { user: { userId: string } },
    @Param('ocrResultId') ocrResultId: string,
  ) {
    await this.ensureCorrectionOwnership(req.user.userId, ocrResultId);
    return this.ocrCorrectionsService.getCorrectionHistory(ocrResultId);
  }

  private async ensureCorrectionOwnership(userId: string, ocrResultId: string) {
    const [record] = await this.dbs.db
      .select({
        todoOwnerId: todos.userId,
      })
      .from(ocrResults)
      .innerJoin(
        attachmentOcrOutputs,
        eq(attachmentOcrOutputs.id, ocrResults.attachmentOcrOutputId),
      )
      .innerJoin(
        attachments,
        eq(attachments.id, attachmentOcrOutputs.attachmentId),
      )
      .innerJoin(todos, eq(todos.id, attachments.todoId))
      .where(eq(ocrResults.id, ocrResultId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('OCR result not found');
    }

    if (record.todoOwnerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
