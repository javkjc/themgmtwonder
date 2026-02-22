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
  ],
  providers: [
    MlService,
    FieldSuggestionService,
    TableSuggestionService,
    FieldAssignmentValidatorService,
    MlMetricsService,
    MlTrainingDataService,
    MlModelsService,
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
