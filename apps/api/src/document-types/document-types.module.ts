import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { DocumentTypesController } from './document-types.controller';
import { DocumentTypesService } from './document-types.service';

@Module({
  imports: [DbModule],
  controllers: [DocumentTypesController],
  providers: [DocumentTypesService],
})
export class DocumentTypesModule {}
