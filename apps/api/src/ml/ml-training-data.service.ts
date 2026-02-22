import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { and, gte, lte, isNotNull, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { baselineFieldAssignments, extractedTextSegments, users } from '../db/schema';
import { extractionBaselines } from '../baseline/schema';

export interface TrainingDataRow {
  textSegment: string | null;
  suggestedField: string;
  userAssignedField: string;
  confidence: string | null;
  accepted: boolean | null;
  modelVersionId: string | null;
  assignedAt: Date;
  correctionReason: string | null;
}

export interface TrainingDataResult {
  rows: TrainingDataRow[];
  filteredOutTypos: number;
  filteredOutEarlyUsers: number;
  filteredOutSingleUser: number;
}

@Injectable()
export class MlTrainingDataService {
  private readonly logger = new Logger(MlTrainingDataService.name);

  constructor(private readonly dbs: DbService) {}

  async getTrainingData(
    startDate: string,
    endDate: string,
    minCorrections: number,
  ): Promise<TrainingDataResult> {
    const start = this.parseStartDate(startDate);
    const end = this.parseEndDate(endDate);

    // Base query — same join as A1 but also pulls assignedBy + userCreatedAt for filter 2
    const rows = await this.dbs.db
      .select({
        textSegment: extractedTextSegments.text,
        suggestedField: baselineFieldAssignments.fieldKey,
        userAssignedField: baselineFieldAssignments.fieldKey,
        confidence: baselineFieldAssignments.suggestionConfidence,
        accepted: baselineFieldAssignments.suggestionAccepted,
        modelVersionId: baselineFieldAssignments.modelVersionId,
        assignedAt: baselineFieldAssignments.assignedAt,
        correctionReason: baselineFieldAssignments.correctionReason,
        assignedBy: baselineFieldAssignments.assignedBy,
        userCreatedAt: users.createdAt,
      })
      .from(baselineFieldAssignments)
      .leftJoin(
        extractedTextSegments,
        sql`${extractedTextSegments.id} = ${baselineFieldAssignments.sourceSegmentId}`,
      )
      .leftJoin(
        extractionBaselines,
        sql`${extractionBaselines.id} = ${baselineFieldAssignments.baselineId}`,
      )
      .leftJoin(
        users,
        sql`${users.id} = ${baselineFieldAssignments.assignedBy}`,
      )
      .where(
        and(
          isNotNull(baselineFieldAssignments.suggestionConfidence),
          isNotNull(baselineFieldAssignments.sourceSegmentId),
          gte(baselineFieldAssignments.assignedAt, start),
          lte(baselineFieldAssignments.assignedAt, end),
        ),
      );

    const totalBefore = rows.length;

    // Filter 1: Exclude rows where correctionReason = 'typo' (case-insensitive)
    const afterTypoFilter = rows.filter(
      (r) => r.correctionReason?.toLowerCase().trim() !== 'typo',
    );
    const filteredOutTypos = totalBefore - afterTypoFilter.length;

    // Filter 2: Exclude rows where assignedAt < userCreatedAt + 30 days
    const afterEarlyUserFilter = afterTypoFilter.filter((r) => {
      if (!r.userCreatedAt) return true; // keep if we can't determine
      const thirtyDaysAfterCreation = new Date(r.userCreatedAt);
      thirtyDaysAfterCreation.setUTCDate(thirtyDaysAfterCreation.getUTCDate() + 30);
      return r.assignedAt >= thirtyDaysAfterCreation;
    });
    const filteredOutEarlyUsers = afterTypoFilter.length - afterEarlyUserFilter.length;

    // Filter 3: Exclude rows where only one distinct user corrected same fieldKey + normalizedSegmentText
    // Build a map of (fieldKey, normalizedText) -> Set<assignedBy>
    const pairUserMap = new Map<string, Set<string>>();
    for (const r of afterEarlyUserFilter) {
      const normalizedText = r.textSegment?.toLowerCase().trim() ?? '';
      const key = `${r.suggestedField}|${normalizedText}`;
      if (!pairUserMap.has(key)) {
        pairUserMap.set(key, new Set());
      }
      if (r.assignedBy) {
        pairUserMap.get(key)!.add(r.assignedBy);
      }
    }
    const afterSingleUserFilter = afterEarlyUserFilter.filter((r) => {
      const normalizedText = r.textSegment?.toLowerCase().trim() ?? '';
      const key = `${r.suggestedField}|${normalizedText}`;
      const distinctUsers = pairUserMap.get(key)?.size ?? 0;
      return distinctUsers > 1;
    });
    const filteredOutSingleUser = afterEarlyUserFilter.length - afterSingleUserFilter.length;

    this.logger.log(
      `Training data filters: filteredOutTypos=${filteredOutTypos}, filteredOutEarlyUsers=${filteredOutEarlyUsers}, filteredOutSingleUser=${filteredOutSingleUser}, remaining=${afterSingleUserFilter.length}`,
    );

    // Filter 4: Enforce minCorrections threshold
    if (afterSingleUserFilter.length < minCorrections) {
      this.logger.warn(
        `Training data export rejected: filtered count ${afterSingleUserFilter.length} < minCorrections ${minCorrections}`,
      );
      throw new BadRequestException({
        code: 'insufficient_corrections',
        message: `Filtered correction count (${afterSingleUserFilter.length}) is below the minimum required (${minCorrections}).`,
        filteredOutTypos,
        filteredOutEarlyUsers,
        filteredOutSingleUser,
      });
    }

    const resultRows: TrainingDataRow[] = afterSingleUserFilter.map((row) => ({
      textSegment: row.textSegment ?? null,
      suggestedField: row.suggestedField,
      userAssignedField: row.userAssignedField,
      confidence: row.confidence ?? null,
      accepted: row.accepted ?? null,
      modelVersionId: row.modelVersionId ?? null,
      assignedAt: row.assignedAt,
      correctionReason: row.correctionReason ?? null,
    }));

    return {
      rows: resultRows,
      filteredOutTypos,
      filteredOutEarlyUsers,
      filteredOutSingleUser,
    };
  }

  private parseStartDate(dateStr: string): Date {
    const parts = dateStr.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
  }

  private parseEndDate(dateStr: string): Date {
    const parts = dateStr.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999));
  }
}
