import { IsUUID } from 'class-validator';

export class CreateVersionDto {
  @IsUUID()
  sourceWorkflowId: string; // The workflow version to clone from
}
