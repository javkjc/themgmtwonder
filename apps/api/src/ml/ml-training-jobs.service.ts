import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { mlTrainingJobs, mlTrainingState } from '../db/schema';

export type TrainingJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type TrainingTriggerType = 'volume_auto' | 'manual';

@Injectable()
export class MlTrainingJobsService {
  constructor(private readonly dbs: DbService) {}

  async ensureStateRow() {
    await this.dbs.db
      .insert(mlTrainingState)
      .values({ id: 1 })
      .onConflictDoNothing();
  }

  async getState() {
    await this.ensureStateRow();
    const [row] = await this.dbs.db
      .select()
      .from(mlTrainingState)
      .where(eq(mlTrainingState.id, 1))
      .limit(1);
    return row;
  }

  async updateAttempt(windowEnd: Date) {
    await this.ensureStateRow();
    await this.dbs.db
      .update(mlTrainingState)
      .set({
        lastAttemptAt: new Date(),
        lastAttemptThrough: windowEnd,
      })
      .where(eq(mlTrainingState.id, 1));
  }

  async markSuccess(windowEnd: Date) {
    await this.ensureStateRow();
    await this.dbs.db
      .update(mlTrainingState)
      .set({
        lastSuccessAssignedAt: windowEnd,
        lastAttemptAt: new Date(),
        lastAttemptThrough: windowEnd,
      })
      .where(eq(mlTrainingState.id, 1));
  }

  async hasActiveJob() {
    const [row] = await this.dbs.db
      .select({ id: mlTrainingJobs.id })
      .from(mlTrainingJobs)
      .where(inArray(mlTrainingJobs.status, ['queued', 'running']))
      .limit(1);
    return !!row;
  }

  async enqueueJob(args: {
    triggerType: TrainingTriggerType;
    windowStart: Date;
    windowEnd: Date;
    qualifiedCorrectionCount: number;
  }) {
    const [row] = await this.dbs.db
      .insert(mlTrainingJobs)
      .values({
        status: 'queued',
        triggerType: args.triggerType,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        qualifiedCorrectionCount: args.qualifiedCorrectionCount,
      })
      .returning();
    return row;
  }

  async listJobs(limit = 50) {
    return this.dbs.db
      .select()
      .from(mlTrainingJobs)
      .orderBy(desc(mlTrainingJobs.startedAt))
      .limit(limit);
  }

  async completeJob(
    id: string,
    payload: {
      candidateVersion?: string | null;
      modelPath?: string | null;
      metrics?: Record<string, unknown> | null;
      finishedAt?: Date;
    },
  ) {
    const [job] = await this.dbs.db
      .select()
      .from(mlTrainingJobs)
      .where(eq(mlTrainingJobs.id, id))
      .limit(1);
    if (!job) {
      throw new NotFoundException(`Training job '${id}' not found.`);
    }

    const finishedAt = payload.finishedAt ?? new Date();

    await this.dbs.db
      .update(mlTrainingJobs)
      .set({
        status: 'succeeded',
        candidateVersion: payload.candidateVersion ?? job.candidateVersion,
        modelPath: payload.modelPath ?? job.modelPath,
        metrics: payload.metrics ?? job.metrics,
        finishedAt,
        errorMessage: null,
      })
      .where(
        and(
          eq(mlTrainingJobs.id, id),
          inArray(mlTrainingJobs.status, ['queued', 'running']),
        ),
      );

    await this.markSuccess(job.windowEnd);
  }

  async failJob(
    id: string,
    payload: {
      errorMessage?: string | null;
      finishedAt?: Date;
    },
  ) {
    const [job] = await this.dbs.db
      .select()
      .from(mlTrainingJobs)
      .where(eq(mlTrainingJobs.id, id))
      .limit(1);
    if (!job) {
      throw new NotFoundException(`Training job '${id}' not found.`);
    }

    const finishedAt = payload.finishedAt ?? new Date();
    await this.dbs.db
      .update(mlTrainingJobs)
      .set({
        status: 'failed',
        errorMessage: payload.errorMessage ?? null,
        finishedAt,
      })
      .where(
        and(
          eq(mlTrainingJobs.id, id),
          inArray(mlTrainingJobs.status, ['queued', 'running']),
        ),
      );

    await this.updateAttempt(job.windowEnd);
  }
}

