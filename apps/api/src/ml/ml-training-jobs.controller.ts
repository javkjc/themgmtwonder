import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { AuditService } from '../audit/audit.service';
import { MlTrainingJobsService } from './ml-training-jobs.service';
import { RagEmbeddingService } from './rag-embedding.service';

class CompleteTrainingJobDto {
  @IsOptional()
  @IsString()
  candidateVersion?: string;

  @IsOptional()
  @IsString()
  modelPath?: string;

  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;
}

class FailTrainingJobDto {
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

@Controller('admin/ml')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminGuard)
export class MlTrainingJobsController {
  constructor(
    private readonly trainingJobs: MlTrainingJobsService,
    private readonly audit: AuditService,
    private readonly ragEmbedding: RagEmbeddingService,
  ) {}

  @Get('training-jobs')
  async listJobs() {
    return this.trainingJobs.listJobs();
  }

  @Post('training-jobs/:id/complete')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async completeJob(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CompleteTrainingJobDto,
  ) {
    await this.trainingJobs.completeJob(id, dto);

    await this.audit.log({
      userId: req.user.userId,
      action: 'ml.training.job.complete' as any,
      module: 'ml',
      resourceType: 'ml-training-job',
      resourceId: id,
      details: {
        candidateVersion: dto.candidateVersion ?? null,
        modelPath: dto.modelPath ?? null,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true, id, status: 'succeeded' };
  }

  @Post('training-jobs/:id/fail')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async failJob(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: FailTrainingJobDto,
  ) {
    await this.trainingJobs.failJob(id, dto);

    await this.audit.log({
      userId: req.user.userId,
      action: 'ml.training.job.fail' as any,
      module: 'ml',
      resourceType: 'ml-training-job',
      resourceId: id,
      details: {
        errorMessage: dto.errorMessage ?? null,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true, id, status: 'failed' };
  }

  @Post('automation/reset-training-state')
  async resetTrainingState(@Req() req: any) {
    const { cancelledJobCount, newLastSuccessAt } =
      await this.trainingJobs.resetTrainingState();

    await this.audit.log({
      userId: req.user.userId,
      action: 'ml.training.state.reset' as any,
      module: 'ml',
      resourceType: 'ml-training-state',
      details: {
        cancelledJobCount,
        newLastSuccessAt: newLastSuccessAt.toISOString(),
        reason: 'manual_admin_reset',
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { cancelledJobCount, newLastSuccessAt };
  }

  @Post('rag/sync-missing-embeddings')
  async syncMissingEmbeddings(@Req() req: any) {
    const { found, synced, failed } =
      await this.ragEmbedding.syncMissingEmbeddings();

    await this.audit.log({
      userId: req.user.userId,
      action: 'rag.sync.manual' as any,
      module: 'ml',
      resourceType: 'baseline-embeddings',
      details: { found, synced, failed },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { found, synced, failed };
  }
}

