import { Module, Global } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { DbModule } from '../db/db.module';

/**
 * CommonModule provides shared services and utilities
 * that can be used across the entire application.
 *
 * This module is marked as @Global() so that its exports
 * (particularly AuthorizationService) are available to all modules
 * without requiring explicit imports.
 */
@Global()
@Module({
  imports: [DbModule],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class CommonModule {}
