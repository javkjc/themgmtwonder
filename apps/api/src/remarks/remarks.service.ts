import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { remarks, todos, users } from '../db/schema';
import { CreateRemarkDto } from './dto/create-remark.dto';

@Injectable()
export class RemarksService {
  constructor(private readonly dbs: DbService) {}

  async listByTodo(todoId: string, userId: string, limit = 10, offset = 0) {
    // Verify user owns the todo
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
      .limit(1);

    if (!todo) {
      throw new NotFoundException('Task not found or access denied');
    }

    // Fetch remarks (newest first) with author information
    const results = await this.dbs.db
      .select({
        id: remarks.id,
        todoId: remarks.todoId,
        userId: remarks.userId,
        content: remarks.content,
        createdAt: remarks.createdAt,
        stageKeyAtCreation: remarks.stageKeyAtCreation,
        authorEmail: users.email,
      })
      .from(remarks)
      .leftJoin(users, eq(remarks.userId, users.id))
      .where(eq(remarks.todoId, todoId))
      .orderBy(desc(remarks.createdAt))
      .limit(limit + 1) // Fetch one extra to check if there's more
      .offset(offset);

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      hasMore,
      total: items.length,
    };
  }

  async create(todoId: string, userId: string, dto: CreateRemarkDto) {
    // Verify user owns the todo
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
      .limit(1);

    if (!todo) {
      throw new NotFoundException('Task not found or access denied');
    }

    const [remark] = await this.dbs.db
      .insert(remarks)
      .values({
        todoId,
        userId,
        content: dto.content,
        stageKeyAtCreation: todo.stageKey,
      })
      .returning();

    return remark;
  }

  async delete(remarkId: string, userId: string) {
    // Fetch the remark and verify ownership
    const [remark] = await this.dbs.db
      .select()
      .from(remarks)
      .where(eq(remarks.id, remarkId))
      .limit(1);

    if (!remark) {
      throw new NotFoundException('Remark not found');
    }

    if (remark.userId !== userId) {
      throw new ForbiddenException('You can only delete your own remarks');
    }

    await this.dbs.db.delete(remarks).where(eq(remarks.id, remarkId));

    return { success: true };
  }
}
