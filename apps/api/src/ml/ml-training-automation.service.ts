import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, gte, isNotNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DbService } from '../db/db.service';
import { baselineFieldAssignments, extractedTextSegments, users } from '../db/schema';
import { MlTrainingJobsService } from './ml-training-jobs.service';

type QualifiedCorrectionRow = {
  fieldKey: string;
  textSegment: string | null;
  assignedBy: string;
  assignedAt: Date;
  correctionReason: string | null;
  userCreatedAt: Date | null;
};

@Injectable()
export class MlTrainingAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MlTrainingAutomationService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dbs: DbService,
    private readonly trainingJobs: MlTrainingJobsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (process.env.ML_TRAINING_ASSISTED !== 'true') {
      this.logger.log(
        'ML training automation is disabled (ML_TRAINING_ASSISTED != true).',
      );
      return;
    }

    // Ghost Feature Warning: D4 executor was dropped (ADR 2026-02-24).
    // Jobs will be enqueued but never processed until D4 is built.
    this.logger.warn(
      'ML_TRAINING_ASSISTED is enabled but no training executor is configured. ' +
      'Jobs will be enqueued but never processed. ' +
      'Use POST /ml/automation/reset-training-state to clear accumulated jobs.',
    );

    const intervalMs = this.getPollIntervalMs();
    this.logger.log(`ML training automation polling every ${intervalMs} ms.`);

    this.timer = setInterval(() => {
      void this.poll();
    }, intervalMs);

    void this.poll();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll() {
    const state = await this.trainingJobs.getState();
    const windowStart = state.lastSuccessAssignedAt ?? new Date(0);
    const windowEnd = new Date();

    const qualifiedCorrectionCount = await this.countQualifiedCorrections(windowStart);
    await this.trainingJobs.updateAttempt(windowEnd);

    if (qualifiedCorrectionCount < 1000) {
      return;
    }

    const activeJobExists = await this.trainingJobs.hasActiveJob();
    if (activeJobExists) {
      return;
    }

    await this.trainingJobs.enqueueJob({
      triggerType: 'volume_auto',
      windowStart,
      windowEnd,
      qualifiedCorrectionCount,
    });

    await this.audit.log({
      actorType: 'system',
      action: 'ml.training.auto.triggered' as any,
      module: 'ml',
      resourceType: 'ml-training-job',
      details: {
        qualifiedCorrectionCount,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      },
    });
  }

  private getPollIntervalMs(): number {
    const raw = Number.parseInt(process.env.ML_TRAINING_POLL_MS ?? '', 10);
    if (Number.isNaN(raw) || raw <= 0) {
      return 60000;
    }
    return raw;
  }

  private async countQualifiedCorrections(windowStart: Date): Promise<number> {
    const rows = await this.dbs.db
      .select({
        fieldKey: baselineFieldAssignments.fieldKey,
        textSegment: extractedTextSegments.text,
        assignedBy: baselineFieldAssignments.assignedBy,
        assignedAt: baselineFieldAssignments.assignedAt,
        correctionReason: baselineFieldAssignments.correctionReason,
        userCreatedAt: users.createdAt,
      })
      .from(baselineFieldAssignments)
      .leftJoin(
        extractedTextSegments,
        sql`${extractedTextSegments.id} = ${baselineFieldAssignments.sourceSegmentId}`,
      )
      .leftJoin(
        users,
        sql`${users.id} = ${baselineFieldAssignments.assignedBy}`,
      )
      .where(
        and(
          isNotNull(baselineFieldAssignments.suggestionConfidence),
          isNotNull(baselineFieldAssignments.sourceSegmentId),
          gte(baselineFieldAssignments.assignedAt, windowStart),
        ),
      );

    return this.applyA2Filters(rows as QualifiedCorrectionRow[]).length;
  }

  private applyA2Filters(rows: QualifiedCorrectionRow[]): QualifiedCorrectionRow[] {
    const afterTypoFilter = rows.filter(
      (row) => row.correctionReason?.toLowerCase().trim() !== 'typo',
    );

    const afterEarlyUserFilter = afterTypoFilter.filter((row) => {
      if (!row.userCreatedAt) return true;
      const thirtyDaysAfterCreation = new Date(row.userCreatedAt);
      thirtyDaysAfterCreation.setUTCDate(
        thirtyDaysAfterCreation.getUTCDate() + 30,
      );
      return row.assignedAt >= thirtyDaysAfterCreation;
    });

    const pairUserMap = new Map<string, Set<string>>();
    for (const row of afterEarlyUserFilter) {
      const normalizedText = row.textSegment?.toLowerCase().trim() ?? '';
      const key = `${row.fieldKey}|${normalizedText}`;
      if (!pairUserMap.has(key)) {
        pairUserMap.set(key, new Set());
      }
      pairUserMap.get(key)?.add(row.assignedBy);
    }

    return afterEarlyUserFilter.filter((row) => {
      const normalizedText = row.textSegment?.toLowerCase().trim() ?? '';
      const key = `${row.fieldKey}|${normalizedText}`;
      const distinctUsers = pairUserMap.get(key)?.size ?? 0;
      return distinctUsers > 1;
    });
  }
}

