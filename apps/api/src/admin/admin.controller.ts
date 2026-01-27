import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  async searchUsers(@Query('q') query?: string) {
    return this.adminService.searchUsers(query);
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Req() req: any, @Param('id') userId: string) {
    const result = await this.adminService.resetUserPassword(userId);
    await this.audit.log({
      userId: req.user.userId,
      action: 'admin.reset_password',
      module: 'admin',
      resourceType: 'user',
      resourceId: userId,
      details: { targetEmail: result.email, adminId: req.user.userId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post('users/:id/toggle-admin')
  async toggleAdmin(
    @Req() req: any,
    @Param('id') userId: string,
    @Body() body: { isAdmin: boolean },
  ) {
    const result = await this.adminService.toggleAdmin(userId, body.isAdmin);
    await this.audit.log({
      userId: req.user.userId,
      action: body.isAdmin ? 'user.role.grant' : 'user.role.revoke',
      module: 'user:role',
      resourceType: 'user',
      resourceId: userId,
      details: {
        targetEmail: result.email,
        isAdmin: body.isAdmin,
        adminId: req.user.userId,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
