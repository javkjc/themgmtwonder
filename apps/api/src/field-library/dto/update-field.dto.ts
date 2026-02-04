import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { FieldCharacterType } from './create-field.dto';

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsEnum(FieldCharacterType)
  characterType?: FieldCharacterType;

  @IsOptional()
  @IsInt()
  @Min(1)
  characterLimit?: number;
}
