import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkingHoursDto {
  @IsString()
  start!: string; // "HH:mm" expected

  @IsString()
  end!: string; // "HH:mm" expected
}

export class UpdateSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;

  @IsOptional()
  @IsArray()
  workingDays?: number[];
}
