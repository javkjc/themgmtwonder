import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { aliasRules } from '../db/schema';
import { AliasEngineService } from './alias-engine.service';

type RuleStatus = 'proposed' | 'active' | 'rejected';

@Injectable()
export class AliasRulesService {
  constructor(
    private readonly dbs: DbService,
    private readonly aliasEngineService: AliasEngineService,
  ) {}

  async listRulesByStatus(status: RuleStatus = 'proposed') {
    return this.dbs.db
      .select({
        id: aliasRules.id,
        vendorId: aliasRules.vendorId,
        fieldKey: aliasRules.fieldKey,
        rawPattern: aliasRules.rawPattern,
        correctedValue: aliasRules.correctedValue,
        status: aliasRules.status,
        correctionEventCount: aliasRules.correctionEventCount,
        proposedAt: aliasRules.proposedAt,
        approvedAt: aliasRules.approvedAt,
        approvedBy: aliasRules.approvedBy,
      })
      .from(aliasRules)
      .where(eq(aliasRules.status, status))
      .orderBy(desc(aliasRules.proposedAt));
  }

  async approveRule(id: string, approvedBy: string) {
    const [updated] = await this.dbs.db
      .update(aliasRules)
      .set({
        status: 'active',
        approvedAt: new Date(),
        approvedBy,
      })
      .where(eq(aliasRules.id, id))
      .returning({
        id: aliasRules.id,
        vendorId: aliasRules.vendorId,
        fieldKey: aliasRules.fieldKey,
        status: aliasRules.status,
        approvedAt: aliasRules.approvedAt,
        approvedBy: aliasRules.approvedBy,
      });

    if (!updated) {
      throw new NotFoundException('Alias rule not found');
    }

    this.invalidateVendorCache(updated.vendorId);
    return updated;
  }

  async rejectRule(id: string) {
    const [updated] = await this.dbs.db
      .update(aliasRules)
      .set({
        status: 'rejected',
      })
      .where(eq(aliasRules.id, id))
      .returning({
        id: aliasRules.id,
        vendorId: aliasRules.vendorId,
        fieldKey: aliasRules.fieldKey,
        status: aliasRules.status,
      });

    if (!updated) {
      throw new NotFoundException('Alias rule not found');
    }

    this.invalidateVendorCache(updated.vendorId);
    return updated;
  }

  private invalidateVendorCache(vendorId: string) {
    const cache = (
      this.aliasEngineService as unknown as {
        vendorRuleCache?: Map<string, unknown>;
      }
    ).vendorRuleCache;
    cache?.delete(vendorId);
  }
}
