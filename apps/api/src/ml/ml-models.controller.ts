import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { MlModelsService } from './ml-models.service';
import { CreateMlModelDto } from './dto/create-ml-model.dto';
import { AuditService } from '../audit/audit.service';

class ActivateModelDto {
  @IsString()
  @IsNotEmpty()
  version: string;
}

@Controller('admin/ml')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
export class MlModelsController {
  constructor(
    private readonly modelsService: MlModelsService,
    private readonly audit: AuditService,
  ) {}

  @Post('models')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createModel(@Req() req: any, @Body() dto: CreateMlModelDto) {
    const record = await this.modelsService.createModel(dto, req.user.userId);

    await this.audit.log({
      userId: req.user.userId,
      action: 'ml.model.register' as any,
      module: 'ml',
      resourceType: 'ml-model-version',
      resourceId: record.id,
      details: {
        modelName: record.modelName,
        version: record.version,
        filePath: record.filePath,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return record;
  }

  @Get('models')
  async listModels() {
    return this.modelsService.listModels();
  }

  @Post('models/activate')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async activateModel(@Req() req: any, @Body() dto: ActivateModelDto) {
    const result = await this.modelsService.activateModel(dto.version);

    await this.audit.log({
      userId: req.user.userId,
      action: 'ml.model.activate' as any,
      module: 'ml',
      resourceType: 'ml-model-version',
      resourceId: dto.version,
      details: {
        version: dto.version,
        previousVersion: result.previousVersion,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true, activeVersion: result.activeVersion };
  }
}
