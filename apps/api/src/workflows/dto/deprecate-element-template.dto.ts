import { IsBoolean } from 'class-validator';

export class DeprecateElementTemplateDto {
  @IsBoolean()
  isDeprecated: boolean;
}
