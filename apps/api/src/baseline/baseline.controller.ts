import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { BaselineManagementService } from './baseline-management.service';
import { DbService } from '../db/db.service';
import { extractionBaselines, attachments, todos } from '../db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ExtractionBaseline } from '../db/schema';

type RequestWithUser = { user: { userId: string } };

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller()
export class BaselineController {
  constructor(
    private readonly baselineService: BaselineManagementService,
    private readonly dbs: DbService,
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
    await this.ensureUserOwnsAttachment(req.user.userId, attachmentId);
    const baseline = await this.findCurrentBaseline(attachmentId);
    return baseline ? this.toResponse(baseline) : null;
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

    const existing = await this.findExistingActiveBaseline(attachmentId);
    if (existing) {
      return this.toResponse(existing);
    }

    const created = await this.baselineService.createDraftBaseline(
      attachmentId,
      req.user.userId,
    );
    return this.toResponse(created);
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

    const updated = await this.baselineService.markReviewed(
      baselineId,
      req.user.userId,
    );
    return this.toResponse(updated);
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

    const updated = await this.baselineService.confirmBaseline(
      baselineId,
      req.user.userId,
    );
    return this.toResponse(updated);
  }

  private toResponse(baseline: ExtractionBaseline) {
    return {
      id: baseline.id,
      attachmentId: baseline.attachmentId,
      status: baseline.status,
      confirmedAt: baseline.confirmedAt,
      confirmedBy: baseline.confirmedBy,
      utilizedAt: baseline.utilizedAt,
      utilizationType: baseline.utilizationType,
      archivedAt: baseline.archivedAt,
      archivedBy: baseline.archivedBy,
      createdAt: baseline.createdAt,
    };
  }

  private async getBaselineOrThrow(baselineId: string) {
    const baseline = await this.dbs.db.query.extractionBaselines.findFirst({
      where: eq(extractionBaselines.id, baselineId),
    });
    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }
    return baseline;
  }

  private async ensureUserOwnsAttachment(
    userId: string,
    attachmentId: string,
  ) {
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
      throw new ForbiddenException('Access denied for attachment');
    }
  }

  private async findExistingActiveBaseline(attachmentId: string) {
    return this.dbs.db.query.extractionBaselines.findFirst({
      where: and(
        eq(extractionBaselines.attachmentId, attachmentId),
        inArray(extractionBaselines.status, ['draft', 'reviewed', 'confirmed']),
      ),
      orderBy: desc(extractionBaselines.createdAt),
    });
  }

  private async findCurrentBaseline(
    attachmentId: string,
  ): Promise<ExtractionBaseline | null> {
    const priorityStatuses: Array<ExtractionBaseline['status']> = [
      'confirmed',
      'reviewed',
      'draft',
    ];

    for (const status of priorityStatuses) {
      const baseline = await this.dbs.db.query.extractionBaselines.findFirst({
        where: and(
          eq(extractionBaselines.attachmentId, attachmentId),
          eq(extractionBaselines.status, status),
        ),
        orderBy: desc(extractionBaselines.createdAt),
      });
      if (baseline) return baseline;
    }

    return null;
  }
}
