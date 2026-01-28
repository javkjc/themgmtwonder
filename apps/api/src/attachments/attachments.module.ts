import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { DbModule } from '../db/db.module';
import { OcrModule } from '../ocr/ocr.module';
import { TodosModule } from '../todos/todos.module';
import { RemarksModule } from '../remarks/remarks.module';

@Module({
  imports: [DbModule, OcrModule, TodosModule, RemarksModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
