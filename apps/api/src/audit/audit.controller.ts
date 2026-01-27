import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Get history for a specific task
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Get('resource/:resourceId')
  getResourceHistory(
    @Req() req: any,
    @Param('resourceId') resourceId: string,
    @Query('type') resourceType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? Number(limit) : 10;
    const offsetNum = offset ? Number(offset) : 0;
    return this.audit.getResourceHistory(
      req.user.userId,
      resourceId,
      resourceType || 'todo',
      Number.isFinite(limitNum) ? limitNum : 10,
      Number.isFinite(offsetNum) ? offsetNum : 0,
      req.user.isAdmin === true,
    );
  }

  // Get current user's audit logs
  @UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const limitNum = limit ? Number(limit) : 50;
    const offsetNum = offset ? Number(offset) : 0;

    return this.audit.listAll({
      limit: Number.isFinite(limitNum) ? limitNum : 50,
      offset: Number.isFinite(offsetNum) ? offsetNum : 0,
      action,
      startDate,
      endDate,
    });
  }

  // Admin: Get all audit logs
  @UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
  @Get('all')
  listAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ) {
    const limitNum = limit ? Number(limit) : 50;
    const offsetNum = offset ? Number(offset) : 0;

    return this.audit.listAll({
      limit: Number.isFinite(limitNum) ? limitNum : 50,
      offset: Number.isFinite(offsetNum) ? offsetNum : 0,
      action,
      startDate,
      endDate,
      userId,
    });
  }
}
