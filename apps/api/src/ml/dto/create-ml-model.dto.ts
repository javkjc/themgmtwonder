import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class CreateMlModelDto {
  @IsString()
  @IsNotEmpty()
  modelName: string;

  @IsString()
  @IsNotEmpty()
  version: string;

  @IsString()
  @IsNotEmpty()
  filePath: string;

  @IsObject()
  @IsOptional()
  metrics?: Record<string, unknown>;
}
