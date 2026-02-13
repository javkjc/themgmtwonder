import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { todos, attachments } from '../db/schema';
import { extractionBaselines } from '../baseline/schema';
import { baselineTables } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * AuthorizationService provides centralized ownership validation
 * for resources in the system. It ensures users can only access
 * resources they own through the ownership chain:
 * Table → Baseline → Attachment → Todo → User
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly dbs: DbService) {}

  /**
   * Ensures the user owns the specified todo
   * @throws {ForbiddenException} if user does not own the todo
   */
  async ensureUserOwnsTodo(
    userId: string,
    todoId: string,
  ): Promise<typeof todos.$inferSelect> {
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
      .limit(1);

    if (!todo) {
      throw new ForbiddenException('Access denied for todo');
    }

    return todo;
  }

  /**
   * Ensures the user owns the specified attachment (via todo ownership)
   * @throws {NotFoundException} if attachment not found
   * @throws {ForbiddenException} if user does not own the attachment
   */
  async ensureUserOwnsAttachment(
    userId: string,
    attachmentId: string,
  ): Promise<{
    attachment: typeof attachments.$inferSelect;
    todo: typeof todos.$inferSelect;
  }> {
    // First, get the attachment
    const [attachment] = await this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Then verify the user owns the associated todo
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, attachment.todoId), eq(todos.userId, userId)))
      .limit(1);

    if (!todo) {
      throw new ForbiddenException('Access denied for attachment');
    }

    return { attachment, todo };
  }

  /**
   * Ensures the user owns the specified baseline (via attachment → todo ownership)
   * @throws {NotFoundException} if baseline not found
   * @throws {ForbiddenException} if user does not own the baseline
   */
  async ensureUserOwnsBaseline(
    userId: string,
    baselineId: string,
  ): Promise<{
    id: string;
    attachmentId: string;
    status: string;
    utilizationType: string | null;
    utilizedAt: Date | null;
    ownerId: string;
  }> {
    const [record] = await this.dbs.db
      .select({
        id: extractionBaselines.id,
        attachmentId: extractionBaselines.attachmentId,
        status: extractionBaselines.status,
        utilizationType: extractionBaselines.utilizationType,
        utilizedAt: extractionBaselines.utilizedAt,
        ownerId: todos.userId,
      })
      .from(extractionBaselines)
      .innerJoin(
        attachments,
        eq(attachments.id, extractionBaselines.attachmentId),
      )
      .innerJoin(todos, eq(todos.id, attachments.todoId))
      .where(eq(extractionBaselines.id, baselineId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('Baseline not found');
    }

    if (record.ownerId !== userId) {
      throw new ForbiddenException('Access denied for baseline');
    }

    return record;
  }

  /**
   * Ensures the user owns the specified table (via baseline → attachment → todo ownership)
   * @throws {NotFoundException} if table not found
   * @throws {ForbiddenException} if user does not own the table
   */
  async ensureUserOwnsTable(
    userId: string,
    tableId: string,
  ): Promise<{
    tableId: string;
    tableBaselineId: string;
    tableLabel: string | null;
    tableStatus: string;
    baselineId: string;
    baselineAttachmentId: string;
    baselineStatus: string;
    baselineUtilizationType: string | null;
    baselineUtilizedAt: Date | null;
    attachmentId: string;
    attachmentTodoId: string;
    todoId: string;
    todoUserId: string;
  }> {
    const [record] = await this.dbs.db
      .select({
        tableId: baselineTables.id,
        tableBaselineId: baselineTables.baselineId,
        tableLabel: baselineTables.tableLabel,
        tableStatus: baselineTables.status,
        baselineId: extractionBaselines.id,
        baselineAttachmentId: extractionBaselines.attachmentId,
        baselineStatus: extractionBaselines.status,
        baselineUtilizationType: extractionBaselines.utilizationType,
        baselineUtilizedAt: extractionBaselines.utilizedAt,
        attachmentId: attachments.id,
        attachmentTodoId: attachments.todoId,
        todoId: todos.id,
        todoUserId: todos.userId,
      })
      .from(baselineTables)
      .innerJoin(
        extractionBaselines,
        eq(extractionBaselines.id, baselineTables.baselineId),
      )
      .innerJoin(
        attachments,
        eq(attachments.id, extractionBaselines.attachmentId),
      )
      .innerJoin(todos, eq(todos.id, attachments.todoId))
      .where(eq(baselineTables.id, tableId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('Table not found');
    }

    if (record.todoUserId !== userId) {
      throw new ForbiddenException('Access denied for table');
    }

    return record;
  }
}
