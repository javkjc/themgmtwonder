import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { baselineFieldAssignments, mlModelVersions } from '../db/schema';

const ONLINE_GATE_DELTA_THRESHOLD = 0.05;
const ONLINE_GATE_SUGGESTION_THRESHOLD = 1000;

interface ModelStatsRow {
  model_version_id: string;
  suggestions: number;
  accepted: number;
}

interface WeeklyTrendRow {
  week_start: Date | string;
  suggestions: number;
  accepted: number;
}

interface HistogramRow {
  bucket: number;
  count: number;
}

export interface MlGateStatus {
  onlineGateMet: boolean;
  onlineDelta: number;
  onlineSuggestionCount: number;
}

export interface MlPerformanceModel {
  id: string;
  modelName: string;
  version: string;
  trainedAt: Date;
  isActive: boolean;
  suggestions: number;
  accepted: number;
  acceptanceRate: number;
  gateStatus: MlGateStatus;
}

export interface MlPerformanceResponse {
  activeModel: MlPerformanceModel | null;
  candidateModel: MlPerformanceModel | null;
  models: MlPerformanceModel[];
  trend: Array<{
    weekStart: string;
    suggestions: number;
    accepted: number;
    acceptanceRate: number;
  }>;
  confidenceHistogram: Array<{
    band: string;
    count: number;
  }>;
  recommendation?: {
    type: 'promote_candidate';
    candidateVersionId: string;
    candidateVersion: string;
    activeVersionId: string;
    activeVersion: string;
    acceptanceDelta: number;
    candidateSuggestions: number;
  };
}

@Injectable()
export class MlPerformanceService {
  constructor(private readonly dbs: DbService) {}

  async getPerformance(
    startDate?: string,
    endDate?: string,
  ): Promise<MlPerformanceResponse> {
    const dateRange = this.parseDateRange(startDate, endDate);

    const [activeRecord] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(eq(mlModelVersions.isActive, true))
      .orderBy(desc(mlModelVersions.trainedAt))
      .limit(1);

    const [candidateRecord] = activeRecord
      ? await this.dbs.db
          .select()
          .from(mlModelVersions)
          .where(
            and(
              eq(mlModelVersions.modelName, activeRecord.modelName),
              eq(mlModelVersions.isActive, false),
            ),
          )
          .orderBy(desc(mlModelVersions.trainedAt))
          .limit(1)
      : await this.dbs.db
          .select()
          .from(mlModelVersions)
          .where(eq(mlModelVersions.isActive, false))
          .orderBy(desc(mlModelVersions.trainedAt))
          .limit(1);

    const modelStatsQuery = await this.dbs.db.execute(sql`
      SELECT
        model_version_id,
        COUNT(*)::int AS suggestions,
        COUNT(*) FILTER (WHERE suggestion_accepted = true)::int AS accepted
      FROM baseline_field_assignments
      WHERE suggestion_confidence IS NOT NULL
        AND model_version_id IS NOT NULL
      GROUP BY model_version_id
    `);

    const modelStatsRows = (modelStatsQuery.rows ?? []) as ModelStatsRow[];
    const statsByVersionId = new Map(
      modelStatsRows.map((row) => [
        row.model_version_id,
        {
          suggestions: Number(row.suggestions) || 0,
          accepted: Number(row.accepted) || 0,
        },
      ]),
    );

    const modelRecords = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .orderBy(desc(mlModelVersions.trainedAt));

    const models = await Promise.all(
      modelRecords.map(async (record) => {
        const stats = statsByVersionId.get(record.id) ?? {
          suggestions: 0,
          accepted: 0,
        };
        const acceptanceRate =
          stats.suggestions > 0
            ? Number((stats.accepted / stats.suggestions).toFixed(4))
            : 0;

        return {
          id: record.id,
          modelName: record.modelName,
          version: record.version,
          trainedAt: record.trainedAt,
          isActive: record.isActive,
          suggestions: stats.suggestions,
          accepted: stats.accepted,
          acceptanceRate,
          gateStatus: await this.getGateStatus(record.id),
        } satisfies MlPerformanceModel;
      }),
    );

    const activeModel =
      (activeRecord ? models.find((model) => model.id === activeRecord.id) : null) ??
      null;
    const candidateModel =
      (candidateRecord
        ? models.find((model) => model.id === candidateRecord.id)
        : null) ?? null;

    const recommendation =
      activeModel &&
      candidateModel &&
      candidateModel.suggestions >= ONLINE_GATE_SUGGESTION_THRESHOLD &&
      candidateModel.acceptanceRate - activeModel.acceptanceRate >=
        ONLINE_GATE_DELTA_THRESHOLD
        ? {
            type: 'promote_candidate' as const,
            candidateVersionId: candidateModel.id,
            candidateVersion: candidateModel.version,
            activeVersionId: activeModel.id,
            activeVersion: activeModel.version,
            acceptanceDelta: Number(
              (candidateModel.acceptanceRate - activeModel.acceptanceRate).toFixed(
                4,
              ),
            ),
            candidateSuggestions: candidateModel.suggestions,
          }
        : undefined;

    const trend = await this.getTwelveWeekTrend(dateRange.start, dateRange.end);
    const confidenceHistogram = await this.getConfidenceHistogram();

    return {
      activeModel,
      candidateModel,
      models,
      trend,
      confidenceHistogram,
      ...(recommendation ? { recommendation } : {}),
    };
  }

  async getGateStatus(candidateVersionId: string): Promise<MlGateStatus> {
    const [candidate] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(eq(mlModelVersions.id, candidateVersionId))
      .limit(1);

    if (!candidate) {
      return {
        onlineGateMet: false,
        onlineDelta: 0,
        onlineSuggestionCount: 0,
      };
    }

    const [active] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(
        and(
          eq(mlModelVersions.modelName, candidate.modelName),
          eq(mlModelVersions.isActive, true),
        ),
      )
      .limit(1);

    if (!active) {
      return {
        onlineGateMet: false,
        onlineDelta: 0,
        onlineSuggestionCount: 0,
      };
    }

    const statsResult = await this.dbs.db.execute(sql`
      SELECT
        model_version_id,
        COUNT(*)::int AS suggestions,
        COUNT(*) FILTER (WHERE suggestion_accepted = true)::int AS accepted
      FROM baseline_field_assignments
      WHERE suggestion_confidence IS NOT NULL
        AND model_version_id IN (${candidate.id}, ${active.id})
      GROUP BY model_version_id
    `);

    const rows = (statsResult.rows ?? []) as ModelStatsRow[];
    const byVersion = new Map(
      rows.map((row) => [
        row.model_version_id,
        {
          suggestions: Number(row.suggestions) || 0,
          accepted: Number(row.accepted) || 0,
        },
      ]),
    );

    const candidateStats = byVersion.get(candidate.id) ?? {
      suggestions: 0,
      accepted: 0,
    };
    const activeStats = byVersion.get(active.id) ?? {
      suggestions: 0,
      accepted: 0,
    };

    const candidateAcceptance =
      candidateStats.suggestions > 0
        ? candidateStats.accepted / candidateStats.suggestions
        : 0;
    const activeAcceptance =
      activeStats.suggestions > 0 ? activeStats.accepted / activeStats.suggestions : 0;
    const onlineDelta = Number((candidateAcceptance - activeAcceptance).toFixed(4));
    const onlineSuggestionCount = candidateStats.suggestions;

    return {
      onlineGateMet:
        onlineDelta >= ONLINE_GATE_DELTA_THRESHOLD &&
        onlineSuggestionCount >= ONLINE_GATE_SUGGESTION_THRESHOLD,
      onlineDelta,
      onlineSuggestionCount,
    };
  }

  private async getTwelveWeekTrend(startDate?: Date, endDate?: Date) {
    const anchorDate = endDate ?? new Date();
    const lastWeekStart = this.startOfWeekUtc(anchorDate);
    const firstWeekStart = this.addDays(lastWeekStart, -11 * 7);
    const rangeStart = startDate && startDate > firstWeekStart ? startDate : firstWeekStart;
    const rangeEnd = endDate ?? new Date();

    const trendResult = await this.dbs.db.execute(sql`
      SELECT
        date_trunc('week', assigned_at) AS week_start,
        COUNT(*)::int AS suggestions,
        COUNT(*) FILTER (WHERE suggestion_accepted = true)::int AS accepted
      FROM baseline_field_assignments
      WHERE suggestion_confidence IS NOT NULL
        AND assigned_at >= ${rangeStart}
        AND assigned_at <= ${rangeEnd}
      GROUP BY week_start
      ORDER BY week_start
    `);

    const rows = (trendResult.rows ?? []) as WeeklyTrendRow[];
    const byWeek = new Map(
      rows.map((row) => {
        const weekDate =
          row.week_start instanceof Date
            ? row.week_start
            : new Date(row.week_start);
        return [
          this.toDateKey(weekDate),
          {
            suggestions: Number(row.suggestions) || 0,
            accepted: Number(row.accepted) || 0,
          },
        ];
      }),
    );

    const trend: Array<{
      weekStart: string;
      suggestions: number;
      accepted: number;
      acceptanceRate: number;
    }> = [];

    for (let index = 0; index < 12; index += 1) {
      const weekStart = this.addDays(firstWeekStart, index * 7);
      const key = this.toDateKey(weekStart);
      const stats = byWeek.get(key) ?? { suggestions: 0, accepted: 0 };
      trend.push({
        weekStart: key,
        suggestions: stats.suggestions,
        accepted: stats.accepted,
        acceptanceRate:
          stats.suggestions > 0
            ? Number((stats.accepted / stats.suggestions).toFixed(4))
            : 0,
      });
    }

    return trend;
  }

  private async getConfidenceHistogram() {
    const histogramResult = await this.dbs.db.execute(sql`
      SELECT
        width_bucket(confidence_score::numeric, 0, 1, 10) AS bucket,
        COUNT(*)::int AS count
      FROM baseline_field_assignments
      WHERE suggestion_confidence IS NOT NULL
        AND assigned_at >= NOW() - INTERVAL '7 days'
      GROUP BY bucket
      ORDER BY bucket
    `);

    const rows = (histogramResult.rows ?? []) as HistogramRow[];
    const byBucket = new Map(
      rows
        .map((row) => ({
          bucket: Number(row.bucket),
          count: Number(row.count) || 0,
        }))
        .filter((row) => row.bucket >= 1 && row.bucket <= 10)
        .map((row) => [row.bucket, row.count]),
    );

    return Array.from({ length: 10 }, (_, index) => {
      const bucket = index + 1;
      const bandStart = (bucket - 1) / 10;
      const bandEnd = bucket / 10;
      return {
        band: `${bandStart.toFixed(1)}-${bandEnd.toFixed(1)}`,
        count: byBucket.get(bucket) ?? 0,
      };
    });
  }

  private parseDateRange(startDate?: string, endDate?: string): {
    start?: Date;
    end?: Date;
  } {
    const parseDateOnly = (value: string, isEnd: boolean): Date | undefined => {
      const parts = value.split('-').map((part) => Number(part));
      if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
        return undefined;
      }

      const [year, month, day] = parts;
      return new Date(
        Date.UTC(
          year,
          month - 1,
          day,
          isEnd ? 23 : 0,
          isEnd ? 59 : 0,
          isEnd ? 59 : 0,
          isEnd ? 999 : 0,
        ),
      );
    };

    const parseDate = (value?: string, isEnd: boolean = false): Date | undefined => {
      if (!value) {
        return undefined;
      }

      if (!value.includes('T')) {
        return parseDateOnly(value, isEnd);
      }

      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    };

    const start = parseDate(startDate);
    const end = parseDate(endDate, true);
    return { start, end };
  }

  private startOfWeekUtc(value: Date): Date {
    const day = value.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    const start = new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    return this.addDays(start, offset);
  }

  private addDays(value: Date, days: number): Date {
    const next = new Date(value);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
