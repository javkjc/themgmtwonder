import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOcrFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fieldName: string;

  @IsString()
  @IsNotEmpty()
  fieldValue: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
