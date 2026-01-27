import {
  IsInt,
  IsOptional,
  Max,
  Min,
  IsISO8601,
  ValidateIf,
} from 'class-validator';

export class ScheduleTodoDto {
  // null = unschedule
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string | null;

  @ValidateIf((o) => o.startAt !== null && o.startAt !== undefined)
  @IsInt()
  @Min(1)
  @Max(10000)
  durationMin?: number;
}
