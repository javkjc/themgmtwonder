import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateWorkflowStepDto {
  @IsInt()
  @Min(1)
  stepOrder: number;

  @IsString()
  @IsNotEmpty()
  stepType: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string; // JSON string: {type: 'role'|'user', value: string}

  @IsString()
  @IsOptional()
  conditions?: string; // JSON string for conditional routing
}

export class UpdateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkflowStepDto)
  steps: UpdateWorkflowStepDto[];
}
