import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { aliasRules } from '../db/schema';

type AliasRule = {
  rawPattern: string;
  correctedValue: string;
};

type CacheEntry = {
  rules: AliasRule[];
  loadedAt: number;
};

type SegmentWithAliasFlag<T extends { text: string }> = T & {
  aliasApplied: boolean;
};

@Injectable()
export class AliasEngineService {
  private readonly logger = new Logger(AliasEngineService.name);
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private readonly vendorRuleCache = new Map<string, CacheEntry>();

  constructor(private readonly dbs: DbService) {}

  async applyAliases<T extends { text: string }>(
    segments: T[],
    vendorId: string,
  ): Promise<Array<SegmentWithAliasFlag<T>>> {
    const rules = await this.loadActiveRules(vendorId);
    const rulesByPattern = new Map<string, AliasRule>();
    for (const rule of rules) {
      rulesByPattern.set(rule.rawPattern.trim().toLowerCase(), rule);
    }

    let correctedCount = 0;
    const updatedSegments = segments.map((segment) => {
      const normalizedText = String(segment.text ?? '').trim().toLowerCase();
      const matchedRule = rulesByPattern.get(normalizedText);
      if (!matchedRule) {
        return {
          ...segment,
          aliasApplied: false,
        };
      }

      correctedCount += 1;
      return {
        ...segment,
        text: matchedRule.correctedValue,
        aliasApplied: true,
      };
    });

    this.logger.log(
      `alias.engine.applied vendorId=${vendorId} ruleCount=${rules.length} correctedCount=${correctedCount}`,
    );

    return updatedSegments;
  }

  private async loadActiveRules(vendorId: string): Promise<AliasRule[]> {
    const now = Date.now();
    const cached = this.vendorRuleCache.get(vendorId);
    if (cached && now - cached.loadedAt < this.cacheTtlMs) {
      return cached.rules;
    }

    const rows = await this.dbs.db
      .select({
        rawPattern: aliasRules.rawPattern,
        correctedValue: aliasRules.correctedValue,
      })
      .from(aliasRules)
      .where(
        and(eq(aliasRules.vendorId, vendorId), eq(aliasRules.status, 'active')),
      );

    const rules = rows.map((row) => ({
      rawPattern: row.rawPattern,
      correctedValue: row.correctedValue,
    }));

    this.vendorRuleCache.set(vendorId, {
      rules,
      loadedAt: now,
    });

    return rules;
  }
}
