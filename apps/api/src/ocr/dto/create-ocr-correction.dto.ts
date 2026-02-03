import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOcrCorrectionDto {
  @IsString()
  @IsNotEmpty()
  correctedValue: string;

  @IsString()
  @IsNotEmpty()
  correctionReason: string;
}
