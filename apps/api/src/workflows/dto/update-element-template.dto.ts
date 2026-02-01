import { IsOptional, IsString } from 'class-validator';

export class UpdateElementTemplateDto {
  @IsOptional()
  @IsString()
  displayLabel?: string;

  @IsOptional()
  @IsString()
  stepType?: string;

  @IsOptional()
  @IsString()
  defaultConfig?: string; // JSON string

  @IsOptional()
  @IsString()
  editableFields?: string; // JSON string array

  @IsOptional()
  @IsString()
  validationConstraints?: string; // JSON string
}
