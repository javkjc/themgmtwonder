import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as path from 'path';
import { DbService } from '../db/db.service';
import { attachments, extractionBaselines, ocrJobs, todos } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { OcrService } from './ocr.service';

type OcrJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

const DEFAULT_POLL_MS = 1500;
const MAX_ACTIVE_PER_USER = 3;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

@Injectable()
export class OcrQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrQueueService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly dbs: DbService,
    private readonly ocrService: OcrService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit() {
    if (process.env.OCR_QUEUE_ENABLED === 'false') {
      this.logger.log('OCR queue disabled (OCR_QUEUE_ENABLED=false)');
      return;
    }

    await this.ensureJobsTable();

    const pollMs = Number(process.env.OCR_QUEUE_POLL_MS ?? DEFAULT_POLL_MS);
    this.intervalId = setInterval(() => {
      void this.tick();
    }, Number.isFinite(pollMs) && pollMs > 100 ? pollMs : DEFAULT_POLL_MS);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async enqueueOcrJob(userId: string, attachmentId: string) {
    await this.ensureJobsTable();

    const [{ count }] = await this.dbs.db
      .select({ count: sql<number>`count(*)` })
      .from(ocrJobs)
      .where(and(eq(ocrJobs.userId, userId), inArray(ocrJobs.status, ['queued', 'processing'])));

    if ((count ?? 0) >= MAX_ACTIVE_PER_USER) {
      throw new BadRequestException(
        `You already have ${MAX_ACTIVE_PER_USER} OCR requests in progress. Please wait for one to finish.`,
      );
    }

    const [job] = await this.dbs.db
      .insert(ocrJobs)
      .values({
        userId,
        attachmentId,
        status: 'queued',
        requestedAt: new Date(),
      })
      .returning();

    return job;
  }

  async listActiveJobs(userId: string, attachmentId?: string) {
    await this.ensureJobsTable();

    const whereClause = attachmentId
      ? and(
          eq(ocrJobs.userId, userId),
          eq(ocrJobs.attachmentId, attachmentId),
          inArray(ocrJobs.status, ['queued', 'processing', 'completed', 'failed']),
        )
      : and(eq(ocrJobs.userId, userId), inArray(ocrJobs.status, ['queued', 'processing', 'completed', 'failed']));

    return this.dbs.db
      .select({
        id: ocrJobs.id,
        attachmentId: ocrJobs.attachmentId,
        status: ocrJobs.status,
        requestedAt: ocrJobs.requestedAt,
        startedAt: ocrJobs.startedAt,
        completedAt: ocrJobs.completedAt,
        dismissedAt: ocrJobs.dismissedAt,
        error: ocrJobs.error,
        filename: attachments.filename,
        mimeType: attachments.mimeType,
        todoId: todos.id,
        todoTitle: todos.title,
      })
      .from(ocrJobs)
      .innerJoin(attachments, eq(attachments.id, ocrJobs.attachmentId))
      .innerJoin(todos, eq(todos.id, attachments.todoId))
      .where(whereClause)
      .orderBy(ocrJobs.requestedAt);
  }

  async dismissJob(userId: string, jobId: string) {
    await this.ensureJobsTable();
    const [job] = await this.dbs.db
      .select()
      .from(ocrJobs)
      .where(and(eq(ocrJobs.id, jobId), eq(ocrJobs.userId, userId)))
      .limit(1);

    if (!job) {
      throw new BadRequestException('Job not found');
    }

    await this.dbs.db
      .update(ocrJobs)
      .set({ dismissedAt: new Date() })
      .where(eq(ocrJobs.id, jobId));

    return { success: true };
  }

  async cancelJob(userId: string, jobId: string) {
    await this.ensureJobsTable();
    const [job] = await this.dbs.db
      .select()
      .from(ocrJobs)
      .where(and(eq(ocrJobs.id, jobId), eq(ocrJobs.userId, userId)))
      .limit(1);

    if (!job) {
      throw new BadRequestException('Job not found');
    }

    if (job.status !== 'queued' && job.status !== 'processing') {
      throw new BadRequestException('Only queued or processing jobs can be cancelled');
    }

    await this.dbs.db
      .update(ocrJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: 'Cancelled by user',
      })
      .where(eq(ocrJobs.id, jobId));

    return { success: true };
  }

  async retryJob(userId: string, jobId: string) {
    await this.ensureJobsTable();
    const [job] = await this.dbs.db
      .select()
      .from(ocrJobs)
      .where(and(eq(ocrJobs.id, jobId), eq(ocrJobs.userId, userId)))
      .limit(1);

    if (!job) {
      throw new BadRequestException('Job not found');
    }

    if (job.status !== 'failed') {
      throw new BadRequestException('Only failed jobs can be retried');
    }

    await this.dbs.db
      .update(ocrJobs)
      .set({ dismissedAt: new Date() })
      .where(eq(ocrJobs.id, jobId));

    return this.enqueueOcrJob(userId, job.attachmentId);
  }

  private async ensureJobsTable() {
    await this.dbs.db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await this.dbs.db.execute(sql`
      CREATE TABLE IF NOT EXISTS ocr_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(30) NOT NULL,
        requested_at timestamp NOT NULL DEFAULT now(),
        started_at timestamp NULL,
        completed_at timestamp NULL,
        dismissed_at timestamp NULL,
        error text NULL,
        output_id uuid NULL REFERENCES attachment_ocr_outputs(id) ON DELETE SET NULL
      );
    `);

    await this.dbs.db.execute(sql`
      ALTER TABLE ocr_jobs ADD COLUMN IF NOT EXISTS dismissed_at timestamp NULL;
    `);

    await this.dbs.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_ocr_jobs_user_status ON ocr_jobs (user_id, status);
    `);
    await this.dbs.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status_requested ON ocr_jobs (status, requested_at);
    `);
    await this.dbs.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_ocr_jobs_attachment_id ON ocr_jobs (attachment_id);
    `);
  }

  private async tick() {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      const next = await this.takeNextJob();
      if (!next) {
        return;
      }
      await this.processJob(next);
    } catch (err) {
      this.logger.error('Queue tick failed', err as Error);
    } finally {
      this.processing = false;
    }
  }

  private async takeNextJob() {
    const [candidate] = await this.dbs.db
      .select()
      .from(ocrJobs)
      .where(
        and(
          eq(ocrJobs.status, 'queued'),
          sql`NOT EXISTS (
            SELECT 1
            FROM ocr_jobs AS j2
            WHERE j2.user_id = ocr_jobs.user_id
              AND j2.status = 'processing'
          )`,
        ),
      )
      .orderBy(ocrJobs.requestedAt)
      .limit(1);

    if (!candidate) {
      return null;
    }

    const [locked] = await this.dbs.db
      .update(ocrJobs)
      .set({ status: 'processing', startedAt: new Date() })
      .where(and(eq(ocrJobs.id, candidate.id), eq(ocrJobs.status, 'queued')))
      .returning();

    return locked ?? null;
  }

  private async processJob(job: typeof ocrJobs.$inferSelect) {
    const [attachment] = await this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, job.attachmentId))
      .limit(1);

    if (!attachment) {
      await this.failJob(job.id, 'Attachment not found');
      return;
    }

    const filePath = path.join(UPLOADS_DIR, attachment.storedFilename);

    try {
      const workerResult = await this.ocrService.extractFromWorker({
        attachmentId: attachment.id,
        filePath,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
      });

      const [currentJob] = await this.dbs.db
        .select()
        .from(ocrJobs)
        .where(eq(ocrJobs.id, job.id))
        .limit(1);

      if (!currentJob || currentJob.status !== 'processing') {
        return;
      }

      const record = await this.ocrService.createDerivedOutput({
        userId: job.userId,
        attachmentId: attachment.id,
        extractedText: workerResult.text,
        status: 'complete',
        segments: workerResult.segments,
        metadata: {
          workerUrl: workerResult.workerHost,
          workerMeta: workerResult.meta,
          mimeType: attachment.mimeType,
        },
      });

      await this.dbs.db
        .update(extractionBaselines)
        .set({ status: 'draft' })
        .where(
          and(
            eq(extractionBaselines.attachmentId, attachment.id),
            eq(extractionBaselines.status, 'reviewed'),
          ),
        );

      await this.dbs.db
        .update(ocrJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          outputId: record.id,
          error: null,
        })
        .where(and(eq(ocrJobs.id, job.id), eq(ocrJobs.status, 'processing')));

      await this.auditService.log({
        userId: job.userId,
        action: 'OCR_SUCCEEDED',
        module: 'attachment',
        resourceType: 'attachment',
        resourceId: attachment.id,
        details: {
          attachmentId: attachment.id,
          todoId: attachment.todoId,
          derivedId: record.id,
          textLength: workerResult.text.length,
          workerHost: workerResult.workerHost,
        },
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'OCR worker request failed';
      const errorDetails =
        err && typeof (err as Error & { details?: string }).details === 'string'
          ? (err as Error & { details?: string }).details
          : undefined;

      const [currentJob] = await this.dbs.db
        .select()
        .from(ocrJobs)
        .where(eq(ocrJobs.id, job.id))
        .limit(1);

      if (!currentJob || currentJob.status !== 'processing') {
        return;
      }

      await this.ocrService.createDerivedOutput({
        userId: job.userId,
        attachmentId: attachment.id,
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

      await this.failJob(job.id, errorMessage);

      await this.auditService.log({
        userId: job.userId,
        action: 'OCR_FAILED',
        module: 'attachment',
        resourceType: 'attachment',
        resourceId: attachment.id,
        details: {
          attachmentId: attachment.id,
          todoId: attachment.todoId,
          error: errorMessage,
        },
      });
    }
  }

  private async failJob(jobId: string, error: string) {
    await this.dbs.db
      .update(ocrJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: error.slice(0, 500),
      })
      .where(eq(ocrJobs.id, jobId));
  }
}
