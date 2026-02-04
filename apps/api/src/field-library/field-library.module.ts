import { Module } from '@nestjs/common';
import { FieldLibraryController } from './field-library.controller';
import { FieldLibraryService } from './field-library.service';

@Module({
  controllers: [FieldLibraryController],
  providers: [FieldLibraryService],
  exports: [FieldLibraryService],
})
export class FieldLibraryModule {}
