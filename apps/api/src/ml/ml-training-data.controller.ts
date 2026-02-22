import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { MlTrainingDataService } from './ml-training-data.service';
import { MlTrainingDataQueryDto } from './dto/ml-training-data.query.dto';
import { AuditService } from '../audit/audit.service';

@Controller('admin/ml')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
export class MlTrainingDataController {
  constructor(
    private readonly trainingDataService: MlTrainingDataService,
    private readonly audit: AuditService,
  ) {}

  @Get('training-data')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getTrainingData(
    @Req() req: any,
    @Query() query: MlTrainingDataQueryDto,
  ) {
    const { startDate, endDate, minCorrections } = query;

    // Service throws BadRequestException if filtered count < minCorrections
    const result = await this.trainingDataService.getTrainingData(
      startDate,
      endDate,
      minCorrections,
    );

    await this.audit.log({
      userId: req.user.userId,
      action: 'ml.training-data.export' as any,
      module: 'ml',
      resourceType: 'training-data',
      details: {
        count: result.rows.length,
        startDate,
        endDate,
        filteredOutTypos: result.filteredOutTypos,
        filteredOutEarlyUsers: result.filteredOutEarlyUsers,
        filteredOutSingleUser: result.filteredOutSingleUser,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result.rows;
  }
}
