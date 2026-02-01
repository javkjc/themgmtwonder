import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsIn, Matches } from 'class-validator';

export class StepActionDto {
  @IsString()
  @IsIn(['approve', 'reject', 'acknowledge'])
  decision: 'approve' | 'reject' | 'acknowledge';

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @Matches(/\S/, { message: 'remark must not be empty' })
  remark: string; // Mandatory remark per action
}
