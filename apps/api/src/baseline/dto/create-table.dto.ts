import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTableDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    label?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1000)
    rowCount?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    columnCount?: number;

    @IsOptional()
    @IsArray()
    @IsArray({ each: true })
    cellValues?: string[][];
}
