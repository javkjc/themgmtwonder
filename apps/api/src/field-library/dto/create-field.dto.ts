import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';


export enum FieldCharacterType {
  VARCHAR = 'varchar',
  INT = 'int',
  DECIMAL = 'decimal',
  DATE = 'date',
  CURRENCY = 'currency',
}

export enum FieldStatus {
  ACTIVE = 'active',
  HIDDEN = 'hidden',
  ARCHIVED = 'archived',
}

export class CreateFieldDto {
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'field_key must contain only lowercase letters, numbers, and underscores',
  })
  fieldKey: string;

  @IsString()
  @MaxLength(255)
  label: string;

  @IsEnum(FieldCharacterType)
  characterType: FieldCharacterType;

  @IsOptional()
  @IsInt()
  @Min(1)
  characterLimit?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  extractionHint?: string | null;
}
