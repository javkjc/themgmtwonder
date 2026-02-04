import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { AttachmentsService } from './attachments.service';
import { AuditService } from '../audit/audit.service';
import { DerivedOcrStatus, OcrService } from '../ocr/ocr.service';
import * as fs from 'fs';
import * as multer from 'multer';
import { RemarksService } from '../remarks/remarks.service';
import { TodosService } from '../todos/todos.service';
import { ApplyOcrDto } from './dto/apply-ocr.dto';

// Define file type to avoid Express.Multer.File issues
type UploadedFileType = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly audit: AuditService,
    private readonly ocrService: OcrService,
    private readonly todosService: TodosService,
    private readonly remarksService: RemarksService,
  ) {}

  // List attachments for a todo
  @Get('todo/:todoId')
  async listByTodo(@Req() req: any, @Param('todoId') todoId: string) {
    return this.attachmentsService.listByTodo(req.user.userId, todoId);
  }

  // Upload attachment to a todo
  @Post('todo/:todoId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB in bytes
      },
    }),
  )
  async upload(
    @Req() req: any,
    @Param('todoId') todoId: string,
    @UploadedFile() file: UploadedFileType,
  ) {
    if (!file) {
      return { error: 'No file provided' };
    }

    // Additional size check (defensive)
    if (file.size > 20 * 1024 * 1024) {
      throw new PayloadTooLargeException(
        'File size exceeds the maximum limit of 20MB',
      );
    }

    const result = await this.attachmentsService.upload(
      req.user.userId,
      todoId,
      {
        originalname: file.originalname,
        buffer: file.buffer,
        mimetype: file.mimetype,
        size: file.size,
      },
    );
    await this.audit.log({
      userId: req.user.userId,
      action: 'attachment.upload',
      module: 'attachment',
      resourceType: 'attachment',
      resourceId: result.id,
      details: { todoId, filename: file.originalname, size: file.size },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  // Download attachment
  @Get(':id/download')
  async download(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { attachment, filePath } = await this.attachmentsService.getById(
      req.user.userId,
      id,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.filename}"`,
    );
    res.setHeader('Content-Type', attachment.mimeType);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }

  // List OCR outputs for an attachment
  @Get(':id/ocr')
  async listOcr(@Req() req: any, @Param('id') id: string) {
    return this.ocrService.listByAttachment(req.user.userId, id);
  }

  @Get(':id/ocr/redo-eligibility')
  async checkOcrRedoEligibility(
    @Req() req: any,
    @Param('id') attachmentId: string,
  ) {
    await this.ocrService.verifyUserOwnsAttachment(
      req.user.userId,
      attachmentId,
    );

    return this.ocrService.checkRedoEligibility(attachmentId);
  }

  @Get(':id/ocr/current')
  async getCurrentOcr(@Req() req: any, @Param('id') attachmentId: string) {
    await this.ocrService.verifyUserOwnsAttachment(
      req.user.userId,
      attachmentId,
    );

    return this.ocrService.getCurrentConfirmedOcr(attachmentId);
  }

  // Delete attachment
  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    const result = await this.attachmentsService.delete(req.user.userId, id);
    await this.audit.log({
      userId: req.user.userId,
      action: 'attachment.delete',
      module: 'attachment',
      resourceType: 'attachment',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/ocr')
  async triggerOcr(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    const { attachment, filePath } = await this.attachmentsService.getById(
      userId,
      id,
    );
    const requestDetails = {
      attachmentId: id,
      todoId: attachment.todoId,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
    };

    const redoCheck = await this.ocrService.checkRedoEligibility(id);

    if (!redoCheck.allowed) {
      await this.audit.log({
        userId,
        action: 'OCR_REDO_BLOCKED',
        module: 'attachment',
        resourceType: 'attachment',
        resourceId: id,
        details: {
          ...requestDetails,
          reason: redoCheck.reason,
          currentOcrId: redoCheck.currentOcr?.id ?? null,
          utilizationType: redoCheck.currentOcr?.utilizationType ?? null,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      throw new BadRequestException(
        redoCheck.reason ?? 'OCR redo is not allowed',
      );
    }

    if (redoCheck.currentOcr) {
      await this.audit.log({
        userId,
        action: 'OCR_REDO_ALLOWED',
        module: 'attachment',
        resourceType: 'attachment',
        resourceId: id,
        details: {
          previousOcrId: redoCheck.currentOcr.id,
          previousOcrStatus: redoCheck.currentOcr.status,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    await this.audit.log({
      userId,
      action: 'OCR_REQUESTED',
      module: 'attachment',
      resourceType: 'attachment',
      resourceId: id,
      details: requestDetails,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    try {
      const workerResult = await this.ocrService.extractFromWorker({
        attachmentId: id,
        filePath,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
      });

      const record = await this.ocrService.createDerivedOutput({
        userId,
        attachmentId: id,
        extractedText: workerResult.text,
        status: 'complete',
        metadata: {
          workerUrl: workerResult.workerHost,
          workerMeta: workerResult.meta,
          mimeType: attachment.mimeType,
        },
      });

      await this.audit.log({
        userId,
        action: 'OCR_SUCCEEDED',
        module: 'attachment',
        resourceType: 'attachment',
        resourceId: id,
        details: {
          ...requestDetails,
          derivedId: record.id,
          textLength: workerResult.text.length,
          workerHost: workerResult.workerHost,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const payload: {
        id: string;
        status: DerivedOcrStatus;
        textLength: number;
        meta?: Record<string, unknown> | null;
      } = {
        id: record.id,
        status: 'complete',
        textLength: workerResult.text.length,
      };

      if (workerResult.meta) {
        payload.meta = workerResult.meta;
      }

      return payload;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'OCR worker request failed';
      const errorDetails =
        err && typeof (err as Error & { details?: string }).details === 'string'
          ? (err as Error & { details?: string }).details
          : undefined;

      await this.ocrService.createDerivedOutput({
        userId,
        attachmentId: id,
        extractedText: '',
        status: 'failed',
        metadata: {
          workerUrl: process.env.OCR_WORKER_BASE_URL ?? null,
          filePath,
          mimeType: attachment.mimeType,
          error: errorMessage,
          ...(errorDetails ? { errorDetails } : {}),
        },
      });

      await this.audit.log({
        userId,
        action: 'OCR_FAILED',
        module: 'attachment',
        resourceType: 'attachment',
        resourceId: id,
        details: {
          ...requestDetails,
          error: errorMessage,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      throw new InternalServerErrorException(`OCR failed: ${errorMessage}`);
    }
  }

  @Post(':id/ocr/apply')
  async applyOcr(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ApplyOcrDto,
  ) {
    const userId = req.user.userId;
    const { output, attachment } = await this.ocrService.getOutputForUser(
      userId,
      dto.outputId,
    );

    if (attachment.id !== id) {
      throw new BadRequestException(
        'OCR output does not belong to this attachment',
      );
    }

    if (output.status !== 'complete') {
      throw new BadRequestException('OCR output is not complete');
    }

    const normalizedText = (output.extractedText || '').trim();
    if (!normalizedText) {
      throw new BadRequestException('OCR output contains no text to apply');
    }

    const requestDetails = {
      attachmentId: attachment.id,
      todoId: attachment.todoId,
      ocrOutputId: output.id,
    };

    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    if (dto.target === 'remark') {
      if (normalizedText.length > 150) {
        throw new BadRequestException(
          'OCR text exceeds the 150 character limit for remarks.',
        );
      }

      const remark = await this.remarksService.create(
        attachment.todoId,
        userId,
        { content: normalizedText },
      );

      await this.audit.log({
        userId,
        action: 'remark.create',
        module: 'remark',
        resourceType: 'remark',
        resourceId: remark.id,
        details: {
          ...requestDetails,
          todoId: attachment.todoId,
          content: normalizedText,
          source: 'ocr',
        },
        ipAddress,
        userAgent,
      });

      await this.audit.log({
        userId,
        action: 'ocr.apply.remark',
        module: 'attachment',
        resourceType: 'todo',
        resourceId: attachment.todoId,
        details: {
          ...requestDetails,
          remarkId: remark.id,
          changes: {
            remark: {
              from: null,
              to: normalizedText,
            },
          },
        },
        ipAddress,
        userAgent,
      });

      return { type: 'remark', remarkId: remark.id };
    }

    const todo = await this.todosService.getById(userId, attachment.todoId);
    if (!todo) {
      throw new NotFoundException('Task not found');
    }

    const beforeDescription = todo.description ?? null;
    const hasExistingDescription =
      beforeDescription !== null && beforeDescription.trim().length > 0;
    const appendedDescription = hasExistingDescription
      ? `${beforeDescription}\n\n${normalizedText}`
      : normalizedText;

    const updated = await this.todosService.update(userId, todo.id, {
      description: appendedDescription,
    });

    if (!updated) {
      throw new InternalServerErrorException(
        'Failed to append OCR text to description',
      );
    }

    await this.audit.log({
      userId,
      action: 'ocr.apply.description',
      module: 'attachment',
      resourceType: 'todo',
      resourceId: todo.id,
      details: {
        ...requestDetails,
        changes: {
          description: {
            from: beforeDescription,
            to: updated.description,
          },
        },
      },
      ipAddress,
      userAgent,
    });

    return { type: 'description', description: updated.description };
  }
}
