import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { OcrCorrectionsService } from './ocr-corrections.service';
import { OcrQueueService } from './ocr-queue.service';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrParsingService } from './ocr-parsing.service';

@Module({
  imports: [DbModule],
  controllers: [OcrController],
  providers: [
    OcrService,
    OcrParsingService,
    OcrCorrectionsService,
    OcrQueueService,
  ],
  exports: [
    OcrService,
    OcrParsingService,
    OcrCorrectionsService,
    OcrQueueService,
  ],
})
export class OcrModule {}
