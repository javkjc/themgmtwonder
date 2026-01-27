import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateTodoDto {
  @IsString()
  @MinLength(1)
  title!: string;

  // ✅ optional description
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // ✅ optional category
  @IsOptional()
  @IsString()
  category?: string;

  // ✅ optional scheduling (calendar creation)
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  @ValidateIf((o) => o.startAt !== null && o.startAt !== undefined)
  @IsInt()
  @Min(1)
  @Max(10000)
  durationMin?: number;
}
