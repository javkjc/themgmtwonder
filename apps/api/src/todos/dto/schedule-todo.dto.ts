import {
  IsInt,
  IsOptional,
  Max,
  Min,
  IsISO8601,
} from 'class-validator';

export class ScheduleTodoDto {
  // null = unschedule
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7200)
  durationMin?: number;
}
