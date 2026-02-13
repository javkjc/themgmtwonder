import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO for deleting a baseline field assignment with optional ML suggestion rejection metadata (v8.8 - C3)
 */
export class DeleteAssignmentDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  reason?: string | null;

  // ML suggestion rejection metadata
  @IsOptional()
  @IsBoolean()
  suggestionRejected?: boolean | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  suggestionConfidence?: number | null;

  @IsOptional()
  @IsUUID()
  modelVersionId?: string | null;
}
