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
import { extractionBaselines, attachments } from '../db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { BaselineAssignmentsService } from './baseline-assignments.service';
import { AssignBaselineFieldDto } from './dto/assign-baseline-field.dto';
import { DeleteAssignmentDto } from './dto/delete-assignment.dto';
import { AuthorizationService } from '../common/authorization.service';

type RequestWithUser = { user: { userId: string } };

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller()
export class BaselineController {
  constructor(
    private readonly baselineService: BaselineManagementService,
    private readonly dbs: DbService,
    private readonly assignmentsService: BaselineAssignmentsService,
    private readonly authService: AuthorizationService,
  ) {}

  /**
   * Get the current baseline for an attachment.
   * If none exists, returns null. Does not create drafts.
   */
  @Get('attachments/:attachmentId/baseline')
  async getCurrentBaseline(
    @Req() req: RequestWithUser,
    @Param('attachmentId') attachmentId: string,
  ) {
    const payload = await this.assignmentsService.getAggregatedBaseline(
      attachmentId,
      req.user.userId,
    );
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
    await this.authService.ensureUserOwnsAttachment(
      req.user.userId,
      attachmentId,
    );

    const [existing] = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(
        and(
          eq(extractionBaselines.attachmentId, attachmentId),
          inArray(extractionBaselines.status, [
            'draft',
            'reviewed',
            'confirmed',
          ]),
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
    await this.authService.ensureUserOwnsAttachment(
      req.user.userId,
      baseline.attachmentId,
    );

    return await this.baselineService.markReviewed(baselineId, req.user.userId);
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
    await this.authService.ensureUserOwnsAttachment(
      req.user.userId,
      baseline.attachmentId,
    );

    // Guard: Service will check for and block unconfirmed tables (A3)
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
    await this.authService.ensureUserOwnsAttachment(
      req.user.userId,
      baseline.attachmentId,
    );

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
   * Accepts optional ML suggestion rejection metadata in body (v8.8 - C3).
   */
  @Delete('baselines/:baselineId/assign/:fieldKey')
  async deleteAssignment(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
    @Param('fieldKey') fieldKey: string,
    @Body() dto?: DeleteAssignmentDto,
  ) {
    return this.assignmentsService.deleteAssignment(
      baselineId,
      fieldKey,
      req.user.userId,
      dto,
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
    return this.assignmentsService.listAssignments(baselineId, req.user.userId);
  }

  @Post('baselines/:baselineId/suggestions/bulk-confirm')
  async bulkConfirmSuggestions(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
  ) {
    return this.assignmentsService.bulkConfirmSuggestions(
      baselineId,
      req.user.userId,
    );
  }

  @Get('baselines/:baselineId/review-manifest')
  async getReviewManifest(
    @Req() req: RequestWithUser,
    @Param('baselineId') baselineId: string,
  ) {
    return this.assignmentsService.assembleReviewManifest(
      baselineId,
      req.user.userId,
    );
  }

  /**
   * Get current baselines (and utilization) for all attachments of a todo.
   * Returns a map of attachmentId -> Baseline.
   */
  @Get('todos/:todoId/baselines')
  async getBaselinesByTodo(
    @Req() req: RequestWithUser,
    @Param('todoId') todoId: string,
  ) {
    await this.authService.ensureUserOwnsTodo(req.user.userId, todoId);

    const rows = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .innerJoin(
        attachments,
        eq(extractionBaselines.attachmentId, attachments.id),
      )
      .where(eq(attachments.todoId, todoId))
      .orderBy(desc(extractionBaselines.createdAt));

    const result: Record<string, any> = {};
    for (const row of rows) {
      const b = row.extraction_baselines;

      // Skip archived baselines
      if (b.status === 'archived') continue;

      // For each attachment, take the first non-archived baseline (DESC order by createdAt)
      // Since confirmed baselines auto-archive previous ones, the latest non-archived
      // baseline is always the current one (confirmed, reviewed, or draft)
      if (!result[b.attachmentId]) {
        result[b.attachmentId] = b;
      }
    }
    return result;
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
}
