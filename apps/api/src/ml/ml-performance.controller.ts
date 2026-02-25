import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import {
  MlPerformanceResponse,
  MlPerformanceService,
} from './ml-performance.service';
import { AuditService } from '../audit/audit.service';

@Controller('admin/ml')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
export class MlPerformanceController {
  constructor(
    private readonly performanceService: MlPerformanceService,
    private readonly audit: AuditService,
  ) {}

  @Get('performance')
  async getPerformance(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<MlPerformanceResponse> {
    const result = await this.performanceService.getPerformance(startDate, endDate);

    await this.audit.log({
      userId: req.user.userId,
      action: 'ml.performance.fetch' as any,
      module: 'ml',
      resourceType: 'performance',
      details: { startDate, endDate },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result;
  }
}
