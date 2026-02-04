import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteOcrFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
