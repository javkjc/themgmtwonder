import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class UpdateCellDto {
    @IsString()
    @MaxLength(5000)
    value: string;

    @IsOptional()
    @IsString()
    @MinLength(10)
    correctionReason?: string;
}
