import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class AssignColumnDto {
  @IsString()
  @IsNotEmpty()
  fieldKey: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  correctionReason?: string;
}
