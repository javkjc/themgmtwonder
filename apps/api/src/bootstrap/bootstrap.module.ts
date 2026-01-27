import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [DbModule],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
