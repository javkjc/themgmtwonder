import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { DbModule } from '../db/db.module';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [DbModule, OcrModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
