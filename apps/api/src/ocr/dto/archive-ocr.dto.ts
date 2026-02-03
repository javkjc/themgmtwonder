import { IsNotEmpty, IsString } from 'class-validator';

export class ArchiveOcrDto {
  @IsString()
  @IsNotEmpty()
  archiveReason: string;
}
