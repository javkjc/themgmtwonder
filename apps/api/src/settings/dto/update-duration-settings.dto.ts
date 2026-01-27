import { IsInt, IsOptional, Min, Max } from 'class-validator';

export class UpdateDurationSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minDurationMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  maxDurationMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  defaultDurationMin?: number;
}
