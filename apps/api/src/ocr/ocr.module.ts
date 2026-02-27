import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { OcrCorrectionsService } from './ocr-corrections.service';
import { OcrQueueService } from './ocr-queue.service';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrParsingService } from './ocr-parsing.service';
import { DocumentTypesModule } from '../document-types/document-types.module';
import { DocumentClassifierService } from '../document-types/document-classifier.service';

@Module({
  imports: [DbModule, DocumentTypesModule],
  controllers: [OcrController],
  providers: [
    OcrService,
    OcrParsingService,
    OcrCorrectionsService,
    OcrQueueService,
    DocumentClassifierService,
  ],
  exports: [
    OcrService,
    OcrParsingService,
    OcrCorrectionsService,
    OcrQueueService,
  ],
})
export class OcrModule {}
