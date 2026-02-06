import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  Delete,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { BaselineManagementService } from './baseline-management.service';
import { DbService } from '../db/db.service';
import { extractionBaselines, attachments, todos } from '../db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ExtractionBaseline } from '../db/schema';
import { BaselineAssignmentsService } from './baseline-assignments.service';
import { AssignBaselineFieldDto } from './dto/assign-baseline-field.dto';

type RequestWithUser = { user: { userId: string } };

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller()
export class BaselineController {
  constructor(
    private readonly baselineService: BaselineManagementService,
    private readonly dbs: DbService,
    private readonly assignmentsService: BaselineAssignmentsService,
  ) { }

  /**
   * Get the current baseline for an attachment.
   * If none exists, returns null. Does not create drafts.
   */
  @Get('attachments/:attachmentId/baseline')
  async getCurrentBaseline(
    @Req() req: RequestWithUser,
    @Param('attachmentId') attachmentId: string,
  ) {
    const payload = await this.assignmentsService.getAggregatedBaseline(attachmentId, req.user.userId);
    return payload || null;
  }

  /**
   * Create a draft baseline for an attachment if one does not already exist.
   * Idempotent for draft/reviewed/confirmed states.
   */
  @Post('attachments/:attachmentId/baseline/draft')
  async createDraftBaseline(
    @Req() req: RequestWithUser,
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.ensureUserOwnsAttachment(req.user.userId, attachmentId);

    const [existing] = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(
        and(
          eq(extractionBaselines.attachmentId, attachmentId),
          inArray(extractionBaselines.status, ['draft', 'reviewed', 'confirmed']),
        ),
      )
      .orderBy(desc(extractionBaselines.createdAt))
      .limit(1);

    if (existing) {
      return existing;
    }

    return await this.baselineService.createDraftBaseline(
      attachmentId,
      req.user.userId,
    );
  }

  /**
   * Mark a draft baseline as reviewed.
   */
  @Post('baselines/:baselineId/review')
  async markReviewed(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
  ) {
    const baseline = await this.getBaselineOrThrow(baselineId);
    await this.ensureUserOwnsAttachment(req.user.userId, baseline.attachmentId);

    return await this.baselineService.markReviewed(
      baselineId,
      req.user.userId,
    );
  }

  /**
   * Confirm a reviewed baseline. Auto-archives previous confirmed baseline.
   */
  @Post('baselines/:baselineId/confirm')
  async confirmBaseline(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
  ) {
    const baseline = await this.getBaselineOrThrow(baselineId);
    await this.ensureUserOwnsAttachment(req.user.userId, baseline.attachmentId);

    return await this.baselineService.confirmBaseline(
      baselineId,
      req.user.userId,
    );
  }

  /**
   * Archive a baseline.
   */
  @Post('baselines/:baselineId/archive')
  async archiveBaseline(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
    @Body() body: { reason: string },
  ) {
    const baseline = await this.getBaselineOrThrow(baselineId);
    await this.ensureUserOwnsAttachment(req.user.userId, baseline.attachmentId);

    return await this.baselineService.archiveBaseline(
      baselineId,
      req.user.userId,
      body.reason,
    );
  }

  /**
   * Create or overwrite a field assignment for a baseline.
   */
  @Post('baselines/:baselineId/assign')
  async assignField(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
    @Body() dto: AssignBaselineFieldDto,
  ) {
    return this.assignmentsService.upsertAssignment(
      baselineId,
      dto,
      req.user.userId,
    );
  }

  /**
   * Delete a field assignment from a baseline (requires correction reason).
   */
  @Delete('baselines/:baselineId/assign/:fieldKey')
  async deleteAssignment(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
    @Param('fieldKey') fieldKey: string,
    @Body('correctionReason') correctionReason?: string,
  ) {
    return this.assignmentsService.deleteAssignment(
      baselineId,
      fieldKey,
      req.user.userId,
      correctionReason,
    );
  }

  /**
   * List all assignments for a baseline.
   */
  @Get('baselines/:baselineId/assignments')
  async listAssignments(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
  ) {
    return this.assignmentsService.listAssignments(
      baselineId,
      req.user.userId,
    );
  }

  private async getBaselineOrThrow(baselineId: string) {
    const [baseline] = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(eq(extractionBaselines.id, baselineId))
      .limit(1);

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }
    return baseline;
  }

  private async ensureUserOwnsAttachment(
    userId: string,
    attachmentId: string,
  ) {
    const [attachment] = await this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, attachment.todoId), eq(todos.userId, userId)))
      .limit(1);

    if (!todo) {
      throw new ForbiddenException('Access denied for attachment');
    }
  }
}
