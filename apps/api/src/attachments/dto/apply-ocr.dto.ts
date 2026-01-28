import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ApplyOcrDto {
  @IsString()
  @IsNotEmpty()
  outputId: string;

  @IsString()
  @IsIn(['remark', 'description'])
  target: 'remark' | 'description';
}
