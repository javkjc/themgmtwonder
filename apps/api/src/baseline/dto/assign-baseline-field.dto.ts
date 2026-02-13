import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class AssignBaselineFieldDto {
  @IsString()
  @IsNotEmpty()
  fieldKey: string;

  @IsOptional()
  @IsString()
  assignedValue?: string | null;

  @IsOptional()
  @IsUUID()
  sourceSegmentId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(10)
  correctionReason?: string | null;

  @IsOptional()
  @IsBoolean()
  confirmInvalid?: boolean;

  // ML suggestion metadata (v8.8 - C3)
  @IsOptional()
  @IsBoolean()
  suggestionAccepted?: boolean | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  suggestionConfidence?: number | null;

  @IsOptional()
  @IsUUID()
  modelVersionId?: string | null;

  @IsOptional()
  @IsString()
  correctedFrom?: string | null;
}
