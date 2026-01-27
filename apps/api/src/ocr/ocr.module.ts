import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { OcrService } from './ocr.service';

@Module({
  imports: [DbModule],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
