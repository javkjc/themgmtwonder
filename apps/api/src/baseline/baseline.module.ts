import { Module } from '@nestjs/common';
import { BaselineManagementService } from './baseline-management.service';
import { FieldAssignmentValidatorService } from './field-assignment-validator.service';
import { DbModule } from '../db/db.module';
import { AuditModule } from '../audit/audit.module';
import { BaselineController } from './baseline.controller';
import { BaselineAssignmentsService } from './baseline-assignments.service';
import { FieldLibraryModule } from '../field-library/field-library.module';

/**
 * BaselineModule
 *
 * Provides baseline lifecycle management services and assignment APIs.
 */
@Module({
    imports: [DbModule, AuditModule, FieldLibraryModule],
    controllers: [BaselineController],
    providers: [
        BaselineManagementService,
        FieldAssignmentValidatorService,
        BaselineAssignmentsService,
    ],
    exports: [
        BaselineManagementService,
        FieldAssignmentValidatorService,
        BaselineAssignmentsService,
    ],
})
export class BaselineModule { }
