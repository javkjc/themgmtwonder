import { IsIn, IsOptional } from 'class-validator';

export class ListTodosQueryDto {
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
