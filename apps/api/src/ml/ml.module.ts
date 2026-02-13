import { Module } from '@nestjs/common';
import { MlService } from './ml.service';
import { FieldSuggestionService } from './field-suggestion.service';
import { FieldSuggestionController } from './field-suggestion.controller';
import { TableSuggestionService } from './table-suggestion.service';
import { TableSuggestionController } from './table-suggestion.controller';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { DbModule } from '../db/db.module';
import { BaselineModule } from '../baseline/baseline.module';
import { FieldAssignmentValidatorService } from '../baseline/field-assignment-validator.service';

@Module({
  imports: [DbModule, AuditModule, CommonModule, BaselineModule],
  controllers: [FieldSuggestionController, TableSuggestionController],
  providers: [
    MlService,
    FieldSuggestionService,
    TableSuggestionService,
    FieldAssignmentValidatorService,
  ],
  exports: [MlService, FieldSuggestionService, TableSuggestionService],
})
export class MlModule {}
