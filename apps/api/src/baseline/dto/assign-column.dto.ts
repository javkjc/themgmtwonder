import { IsString, IsNotEmpty } from 'class-validator';

export class AssignColumnDto {
    @IsString()
    @IsNotEmpty()
    fieldKey: string;
}
