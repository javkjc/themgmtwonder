import {
    Controller,
    Get,
    Query,
    UseGuards,
    Req,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { MlMetricsService, MlMetricsResponse } from './ml-metrics.service';
import { AuditService } from '../audit/audit.service';

@Controller('admin/ml')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
export class MlMetricsController {
    constructor(
        private readonly metricsService: MlMetricsService,
        private readonly audit: AuditService,
    ) { }

    @Get('metrics')
    async getMetrics(
        @Req() req: any,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ): Promise<MlMetricsResponse> {
        const result = await this.metricsService.getMetrics(startDate, endDate);

        await this.audit.log({
            userId: req.user.userId,
            action: 'ml.metrics.fetch' as any, // Cast as any because it's a new action
            module: 'ml',
            resourceType: 'metrics',
            details: { startDate, endDate, totalActed: result.totalActed },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });

        return result;
    }
}
