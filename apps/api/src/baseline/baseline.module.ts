import { Module } from '@nestjs/common';
import { BaselineManagementService } from './baseline-management.service';
import { DbModule } from '../db/db.module';
import { AuditModule } from '../audit/audit.module';
import { BaselineController } from './baseline.controller';

/**
 * BaselineModule
 *
 * Provides baseline lifecycle management services.
 * No controllers/endpoints yet (Milestone 8.6.5 is service-layer only).
 */
@Module({
    imports: [DbModule, AuditModule],
    controllers: [BaselineController],
    providers: [BaselineManagementService],
    exports: [BaselineManagementService],
})
export class BaselineModule { }
