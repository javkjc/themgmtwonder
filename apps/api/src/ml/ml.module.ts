import { Module } from '@nestjs/common';
import { MlService } from './ml.service';
import { FieldSuggestionService } from './field-suggestion.service';
import { FieldSuggestionController } from './field-suggestion.controller';
import { TableSuggestionService } from './table-suggestion.service';
import { TableSuggestionController } from './table-suggestion.controller';
import { MlMetricsService } from './ml-metrics.service';
import { MlMetricsController } from './ml-metrics.controller';
import { MlTrainingDataService } from './ml-training-data.service';
import { MlTrainingDataController } from './ml-training-data.controller';
import { MlModelsService } from './ml-models.service';
import { MlModelsController } from './ml-models.controller';
import { MlTrainingAutomationService } from './ml-training-automation.service';
import { MlTrainingJobsService } from './ml-training-jobs.service';
import { MlTrainingJobsController } from './ml-training-jobs.controller';
import { MathReconciliationService } from './math-reconciliation.service';
import { MlPerformanceController } from './ml-performance.controller';
import { MlPerformanceService } from './ml-performance.service';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { DbModule } from '../db/db.module';
import { BaselineModule } from '../baseline/baseline.module';
import { FieldAssignmentValidatorService } from '../baseline/field-assignment-validator.service';

@Module({
  imports: [DbModule, AuditModule, CommonModule, BaselineModule],
  controllers: [
    FieldSuggestionController,
    TableSuggestionController,
    MlMetricsController,
    MlTrainingDataController,
    MlModelsController,
    MlTrainingJobsController,
    MlPerformanceController,
  ],
  providers: [
    MlService,
    FieldSuggestionService,
    TableSuggestionService,
    FieldAssignmentValidatorService,
    MlMetricsService,
    MlTrainingDataService,
    MlModelsService,
    MlTrainingJobsService,
    MlTrainingAutomationService,
    MathReconciliationService,
    MlPerformanceService,
  ],
  exports: [
    MlService,
    FieldSuggestionService,
    TableSuggestionService,
    MlMetricsService,
    MlTrainingDataService,
  ],
})
export class MlModule { }
