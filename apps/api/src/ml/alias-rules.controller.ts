import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { AuditService } from '../audit/audit.service';
import { AliasRulesService } from './alias-rules.service';

type RuleStatus = 'proposed' | 'active' | 'rejected';

@Controller('admin/rules')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
export class AliasRulesController {
  constructor(
    private readonly aliasRulesService: AliasRulesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async listRules(@Query('status') status?: string) {
    const resolvedStatus = (status ?? 'proposed') as RuleStatus;
    if (!['proposed', 'active', 'rejected'].includes(resolvedStatus)) {
      throw new BadRequestException('Invalid status');
    }
    return this.aliasRulesService.listRulesByStatus(resolvedStatus);
  }

  @Post(':id/approve')
  async approveRule(@Req() req: any, @Param('id') id: string) {
    const approvedBy = req.user?.username ?? req.user?.email ?? req.user?.userId;
    const rule = await this.aliasRulesService.approveRule(id, approvedBy);

    await this.audit.log({
      userId: req.user.userId,
      action: 'alias.rule.approved' as any,
      module: 'ml',
      resourceType: 'alias_rule',
      resourceId: id,
      details: {
        vendorId: rule.vendorId,
        fieldKey: rule.fieldKey,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true, rule };
  }

  @Post(':id/reject')
  async rejectRule(@Req() req: any, @Param('id') id: string) {
    const rule = await this.aliasRulesService.rejectRule(id);

    await this.audit.log({
      userId: req.user.userId,
      action: 'alias.rule.rejected' as any,
      module: 'ml',
      resourceType: 'alias_rule',
      resourceId: id,
      details: {
        vendorId: rule.vendorId,
        fieldKey: rule.fieldKey,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true, rule };
  }
}
