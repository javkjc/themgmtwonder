import { IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AssignBaselineFieldDto {
    @IsString()
    @IsNotEmpty()
    fieldKey: string;

    @IsOptional()
    @IsString()
    assignedValue?: string | null;

    @IsOptional()
    @IsUUID()
    sourceSegmentId?: string | null;

    @IsOptional()
    @IsString()
    @MinLength(10)
    correctionReason?: string | null;
}
