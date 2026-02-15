import { Injectable } from '@nestjs/common';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
    baselineFieldAssignments,
    auditLogs,
} from '../db/schema';

export interface MlMetricsResponse {
    acceptRate: number;
    modifyRate: number;
    clearRate: number;
    top1Accuracy: number;
    totalActed: number;
    fieldConfusion: Array<{
        fieldKey: string;
        accepted: number;
        modified: number;
        cleared: number;
        accuracy: number;
    }>;
}

@Injectable()
export class MlMetricsService {
    constructor(private readonly dbs: DbService) { }

    async getMetrics(startDate?: string, endDate?: string): Promise<MlMetricsResponse> {
        const parseDateOnly = (dateStr: string, isEnd: boolean): Date | undefined => {
            const parts = dateStr.split('-').map((value) => Number(value));
            if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
                return undefined;
            }
            const [year, month, day] = parts;
            return new Date(Date.UTC(
                year,
                month - 1,
                day,
                isEnd ? 23 : 0,
                isEnd ? 59 : 0,
                isEnd ? 59 : 0,
                isEnd ? 999 : 0,
            ));
        };

        const parseDate = (dateStr?: string, isEnd: boolean = false): Date | undefined => {
            if (!dateStr) return undefined;
            if (!dateStr.includes('T')) {
                return parseDateOnly(dateStr, isEnd);
            }
            const date = new Date(dateStr);
            return Number.isNaN(date.getTime()) ? undefined : date;
        };

        const start = parseDate(startDate);
        const end = parseDate(endDate, true);

        // 1. Get Accept and Modify counts from baseline_field_assignments
        const assignmentConditions: any[] = [];
        if (start) assignmentConditions.push(gte(baselineFieldAssignments.assignedAt, start));
        if (end) assignmentConditions.push(lte(baselineFieldAssignments.assignedAt, end));

        const assignmentStats = await this.dbs.db
            .select({
                fieldKey: baselineFieldAssignments.fieldKey,
                suggestionAccepted: baselineFieldAssignments.suggestionAccepted,
                count: sql<number>`count(*)::int`,
            })
            .from(baselineFieldAssignments)
            .where(
                and(
                    sql`${baselineFieldAssignments.suggestionConfidence} IS NOT NULL`,
                    sql`${baselineFieldAssignments.suggestionAccepted} IS NOT NULL`,
                    ...assignmentConditions,
                ),
            )
            .groupBy(baselineFieldAssignments.fieldKey, baselineFieldAssignments.suggestionAccepted);

        // 2. Get Clear counts from audit_logs
        const auditConditions: any[] = [
            eq(auditLogs.action, 'baseline.assignment.delete'),
            // Extract suggestionRejected from details text (which is JSON)
            sql`(details::jsonb)->>'suggestionRejected' = 'true'`,
        ];
        if (start) auditConditions.push(gte(auditLogs.createdAt, start));
        if (end) auditConditions.push(lte(auditLogs.createdAt, end));

        const clearStats = await this.dbs.db
            .select({
                fieldKey: sql<string>`(details::jsonb)->>'fieldKey'`,
                count: sql<number>`count(*)::int`,
            })
            .from(auditLogs)
            .where(and(...auditConditions))
            .groupBy(sql`(details::jsonb)->>'fieldKey'`);

        // 3. Process results into fieldConfusion and global rates
        const confusionMap = new Map<string, { accepted: number; modified: number; cleared: number }>();

        let totalAccepted = 0;
        let totalModified = 0;
        let totalCleared = 0;

        for (const stat of assignmentStats) {
            const entry = confusionMap.get(stat.fieldKey) || { accepted: 0, modified: 0, cleared: 0 };
            if (stat.suggestionAccepted === true) {
                entry.accepted = stat.count;
                totalAccepted += stat.count;
            } else if (stat.suggestionAccepted === false) {
                entry.modified = stat.count;
                totalModified += stat.count;
            }
            confusionMap.set(stat.fieldKey, entry);
        }

        for (const stat of clearStats) {
            const fieldKey = stat.fieldKey;
            if (!fieldKey) continue;
            const entry = confusionMap.get(fieldKey) || { accepted: 0, modified: 0, cleared: 0 };
            entry.cleared = stat.count;
            totalCleared += stat.count;
            confusionMap.set(fieldKey, entry);
        }

        const fieldConfusion = Array.from(confusionMap.entries()).map(([fieldKey, stats]) => {
            const total = stats.accepted + stats.modified + stats.cleared;
            return {
                fieldKey,
                accepted: stats.accepted,
                modified: stats.modified,
                cleared: stats.cleared,
                accuracy: total > 0 ? Number((stats.accepted / total).toFixed(4)) : 0,
            };
        });

        const totalActed = totalAccepted + totalModified + totalCleared;

        return {
            acceptRate: totalActed > 0 ? Number((totalAccepted / totalActed).toFixed(4)) : 0,
            modifyRate: totalActed > 0 ? Number((totalModified / totalActed).toFixed(4)) : 0,
            clearRate: totalActed > 0 ? Number((totalCleared / totalActed).toFixed(4)) : 0,
            top1Accuracy: totalActed > 0 ? Number((totalAccepted / totalActed).toFixed(4)) : 0,
            totalActed,
            fieldConfusion: fieldConfusion.sort((a, b) => b.cleared + b.modified - (a.cleared + a.modified)), // Sort by most errors first
        };
    }
}
