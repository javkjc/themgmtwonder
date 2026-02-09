import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTableDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    label?: string;

    @IsArray()
    @IsArray({ each: true })
    cellValues: string[][];
}
