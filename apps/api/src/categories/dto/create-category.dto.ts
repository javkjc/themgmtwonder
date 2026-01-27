import { IsHexColor, IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // expects "#RRGGBB"
  @IsHexColor()
  color!: string;
}
