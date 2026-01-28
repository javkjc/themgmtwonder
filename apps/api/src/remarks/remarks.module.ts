import { Module } from '@nestjs/common';
import { RemarksController } from './remarks.controller';
import { RemarksService } from './remarks.service';

@Module({
  controllers: [RemarksController],
  providers: [RemarksService],
  exports: [RemarksService],
})
export class RemarksModule {}
