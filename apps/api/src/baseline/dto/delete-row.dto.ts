import { IsString, MinLength } from 'class-validator';

export class DeleteRowDto {
  @IsString()
  @MinLength(10)
  reason: string;
}
