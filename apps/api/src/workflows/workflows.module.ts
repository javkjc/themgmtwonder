import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { DbModule } from '../db/db.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [DbModule, AuditModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
