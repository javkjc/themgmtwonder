import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRemarkDto {
  @IsString()
  @MinLength(1, { message: 'Remark content cannot be empty' })
  @MaxLength(150, { message: 'Remark content must not exceed 150 characters' })
  content: string;
}
