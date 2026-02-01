import { IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';

export class CreateElementTemplateDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['step', 'decision'])
  elementType: 'step' | 'decision';

  @IsNotEmpty()
  @IsString()
  displayLabel: string;

  @IsOptional()
  @IsString()
  stepType?: string; // 'approve' | 'review' | 'acknowledge' | 'if_else'

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
