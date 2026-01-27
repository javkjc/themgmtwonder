import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { SettingsService } from './settings.service';
import { AuditService } from '../audit/audit.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateDurationSettingsDto } from './dto/update-duration-settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  @UseGuards(AdminGuard)
  async updateSettings(@Req() req: any, @Body() dto: UpdateSettingsDto) {
    const result = await this.settingsService.updateSettings(dto);
    await this.audit.log({
      userId: req.user.userId,
      action: 'settings.update',
      module: 'settings',
      resourceType: 'settings',
      details: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Get('duration')
  async getDurationSettings() {
    return this.settingsService.getDurationSettings();
  }

  @Put('duration')
  @UseGuards(AdminGuard)
  async updateDurationSettings(
    @Req() req: any,
    @Body() dto: UpdateDurationSettingsDto,
  ) {
    const result = await this.settingsService.updateDurationSettings(dto);
    await this.audit.log({
      userId: req.user.userId,
      action: 'settings.duration.update',
      module: 'settings',
      resourceType: 'settings',
      details: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
