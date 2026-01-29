import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class StartWorkflowDto {
  @IsString()
  @IsNotEmpty()
  resourceType: string; // e.g., 'todo', 'attachment'

  @IsString()
  @IsNotEmpty()
  resourceId: string; // ID of target entity

  @IsObject()
  @IsOptional()
  inputs?: Record<string, any>; // Optional input parameters for workflow execution
}
