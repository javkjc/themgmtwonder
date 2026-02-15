import { Module } from '@nestjs/common';
import { MlService } from './ml.service';
import { FieldSuggestionService } from './field-suggestion.service';
import { FieldSuggestionController } from './field-suggestion.controller';
import { TableSuggestionService } from './table-suggestion.service';
import { TableSuggestionController } from './table-suggestion.controller';
import { MlMetricsService } from './ml-metrics.service';
import { MlMetricsController } from './ml-metrics.controller';
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
  ],
  providers: [
    MlService,
    FieldSuggestionService,
    TableSuggestionService,
    FieldAssignmentValidatorService,
    MlMetricsService,
  ],
  exports: [
    MlService,
    FieldSuggestionService,
    TableSuggestionService,
    MlMetricsService,
  ],
})
export class MlModule { }
