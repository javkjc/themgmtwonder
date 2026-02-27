import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AddDocumentTypeFieldDto {
  @IsString()
  @MaxLength(255)
  fieldKey: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  zoneHint?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
