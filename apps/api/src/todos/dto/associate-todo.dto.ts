import { IsString, IsUUID, MinLength } from 'class-validator';

/**
 * DTO for associating a task as a child of a parent task.
 * Requires explicit remark to document the relationship.
 */
export class AssociateTodoDto {
  @IsUUID()
  parentId: string;

  @IsString()
  @MinLength(1, { message: 'Remark is required for association' })
  remark: string;
}

/**
 * DTO for detaching a child task from its parent.
 * Requires explicit remark to document the disassociation.
 */
export class DisassociateTodoDto {
  @IsString()
  @MinLength(1, { message: 'Remark is required for disassociation' })
  remark: string;
}
