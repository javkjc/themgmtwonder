import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  durationMin?: number;

  // ✅ v4 parent-child relationship (optional)
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
