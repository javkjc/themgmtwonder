import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { TASK_STAGE_KEYS, TaskStageKey } from '../../common/constants';

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  durationMin?: number;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(TASK_STAGE_KEYS)
  stageKey?: TaskStageKey | null;

  // ✅ v4 parent-child relationship (optional, null to detach)
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
