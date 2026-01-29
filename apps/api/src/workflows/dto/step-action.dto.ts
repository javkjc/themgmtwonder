import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class StepActionDto {
  @IsString()
  @IsIn(['approve', 'reject', 'acknowledge'])
  decision: 'approve' | 'reject' | 'acknowledge';

  @IsString()
  @IsNotEmpty()
  remark: string; // Mandatory remark per action
}
