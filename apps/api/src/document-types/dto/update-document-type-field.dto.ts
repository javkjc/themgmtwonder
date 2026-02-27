import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDocumentTypeFieldDto {
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
