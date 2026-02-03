import { IsOptional, IsString } from 'class-validator';

export class ConfirmOcrDto {
  @IsOptional()
  @IsString()
  editedExtractedText?: string;
}
