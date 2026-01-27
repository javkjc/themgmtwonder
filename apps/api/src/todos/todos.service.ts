import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  and,
  eq,
  asc,
  desc,
  ne,
  isNotNull,
  sql,
  ilike,
  or,
  inArray,
} from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { todos } from '../db/schema';
import type { SQL } from 'drizzle-orm';
import type { CreateTodoDto, ScheduleTodoDto } from './dto';
import { TaskStageKey } from '../common/constants';

@Injectable()
export class TodosService {
  constructor(private readonly dbs: DbService) {}

  async list(
    userId: string,
    opts?: {
      done?: boolean;
      limit?: number;
      sortDir?: 'asc' | 'desc';
      createdAfter?: Date;
      createdBefore?: Date;
      scheduledAfter?: Date;
      scheduledBefore?: Date;
    },
  ) {
    const conditions: SQL[] = [eq(todos.userId, userId)];

    if (typeof opts?.done === 'boolean') {
      conditions.push(eq(todos.done, opts.done));
    }

    // Date range filters for createdAt
    if (opts?.createdAfter) {
      conditions.push(sql`${todos.createdAt} >= ${opts.createdAfter}`);
    }
    if (opts?.createdBefore) {
      conditions.push(sql`${todos.createdAt} <= ${opts.createdBefore}`);
    }

    // Date range filters for startAt (scheduled date)
    if (opts?.scheduledAfter) {
      conditions.push(sql`${todos.startAt} >= ${opts.scheduledAfter}`);
    }
    if (opts?.scheduledBefore) {
      conditions.push(sql`${todos.startAt} <= ${opts.scheduledBefore}`);
    }

    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);

    const sortDir = opts?.sortDir ?? 'desc';
    const orderExpr =
      sortDir === 'asc' ? asc(todos.createdAt) : desc(todos.createdAt);

    return this.dbs.db
      .select()
      .from(todos)
      .where(and(...conditions))
      .orderBy(orderExpr)
      .limit(limit);
  }

  async create(userId: string, dto: CreateTodoDto) {
    // If scheduling fields provided, validate and check overlap
    if (dto.startAt && dto.durationMin) {
      return this.createScheduled(userId, dto);
    }

    // Regular unscheduled todo
    const [row] = await this.dbs.db
      .insert(todos)
      .values({
        userId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        durationMin: dto.durationMin,
      })
      .returning();
    return row;
  }

  async getById(userId: string, todoId: string) {
    const [row] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
    return row ?? null;
  }

  private async createScheduled(userId: string, dto: CreateTodoDto) {
    const startAt = new Date(dto.startAt!);
    const endAt = new Date(startAt.getTime() + dto.durationMin! * 60000);

    return this.dbs.tx(async (txDb) => {
      // Check for overlaps
      const overlaps = await txDb
        .select()
        .from(todos)
        .where(
          and(
            eq(todos.userId, userId),
            isNotNull(todos.startAt),
            isNotNull(todos.durationMin),
            sql`${todos.startAt} < ${endAt}`,
            sql`${todos.startAt} + (${todos.durationMin} || ' minutes')::interval > ${startAt}`,
          ),
        )
        .for('update');

      if (overlaps.length > 0) {
        throw new ConflictException('Schedule overlaps with existing todo');
      }

      const [row] = await txDb
        .insert(todos)
        .values({
          userId,
          title: dto.title,
          description: dto.description,
          startAt: startAt,
          durationMin: dto.durationMin,
          category: dto.category,
        })
        .returning();

      return row;
    });
  }

  async update(
    userId: string,
    todoId: string,
    patch: Partial<{
      title: string;
      description: string | null;
      done: boolean;
      category: string | null;
      durationMin: number;
      isPinned: boolean;
      stageKey: TaskStageKey | null;
    }>,
  ) {
    const [row] = await this.dbs.db
      .update(todos)
      .set({ ...patch, updatedAt: new Date(), durationMin: patch.durationMin })
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
      .returning();

    return row ?? null;
  }

  async remove(userId: string, todoId: string) {
    const [row] = await this.dbs.db
      .delete(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
      .returning();

    return row ?? null;
  }

  async schedule(userId: string, todoId: string, dto: ScheduleTodoDto) {
    // Validate: if startAt provided, require durationMin (extra safety)
    if (dto.startAt !== null && dto.startAt !== undefined && !dto.durationMin) {
      throw new BadRequestException('durationMin required when scheduling');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : null;

    return this.dbs.tx(async (txDb) => {
      // Verify todo exists and belongs to user (with row lock)
      const [todo] = await txDb
        .select()
        .from(todos)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
        .for('update');

      if (!todo) {
        throw new NotFoundException('Todo not found');
      }

      // If unscheduling, clear startAt only (preserve durationMin) and set unscheduledAt
      if (startAt === null) {
        const [updated] = await txDb
          .update(todos)
          .set({ startAt: null, unscheduledAt: new Date() })
          .where(eq(todos.id, todoId))
          .returning();
        return updated;
      }

      // Check for overlaps (excluding current todo)
      const endAt = new Date(startAt.getTime() + dto.durationMin! * 60000);

      const overlaps = await txDb
        .select()
        .from(todos)
        .where(
          and(
            eq(todos.userId, userId),
            ne(todos.id, todoId),
            isNotNull(todos.startAt),
            isNotNull(todos.durationMin),
            sql`${todos.startAt} < ${endAt}`,
            sql`${todos.startAt} + (${todos.durationMin} || ' minutes')::interval > ${startAt}`,
          ),
        )
        .for('update');

      if (overlaps.length > 0) {
        throw new ConflictException('Schedule overlaps with existing todo');
      }

      // Update the todo with schedule
      const [updated] = await txDb
        .update(todos)
        .set({
          startAt: startAt,
          durationMin: dto.durationMin,
        })
        .where(eq(todos.id, todoId))
        .returning();

      return updated;
    });
  }

  async search(userId: string, query: string, limit: number = 20) {
    if (!query || query.trim() === '') {
      return [];
    }

    const trimmedQuery = query.trim();
    const searchPattern = `%${trimmedQuery}%`;

    // Build search conditions: title, category, and task ID (full or partial)
    const searchConditions = [
      ilike(todos.title, searchPattern),
      ilike(todos.category, searchPattern),
      // Match full UUID or partial ID (cast to text for ILIKE)
      sql`CAST(${todos.id} AS TEXT) ILIKE ${searchPattern}`,
    ];

    return this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.userId, userId), or(...searchConditions)))
      .orderBy(desc(todos.createdAt))
      .limit(Math.min(limit, 50));
  }

  async bulkUpdateDone(userId: string, ids: string[], done: boolean) {
    if (!ids || ids.length === 0) {
      return { updated: 0 };
    }

    const result = await this.dbs.db
      .update(todos)
      .set({ done })
      .where(and(eq(todos.userId, userId), inArray(todos.id, ids)))
      .returning();

    return { updated: result.length };
  }

  async bulkUpdateCategory(
    userId: string,
    ids: string[],
    category: string | null,
  ) {
    if (!ids || ids.length === 0) {
      return { updated: 0 };
    }

    const result = await this.dbs.db
      .update(todos)
      .set({ category })
      .where(and(eq(todos.userId, userId), inArray(todos.id, ids)))
      .returning();

    return { updated: result.length };
  }

  async bulkDelete(userId: string, ids: string[]) {
    if (!ids || ids.length === 0) {
      return { deleted: 0 };
    }

    const result = await this.dbs.db
      .delete(todos)
      .where(and(eq(todos.userId, userId), inArray(todos.id, ids)))
      .returning();

    return { deleted: result.length };
  }

  async recentlyUnscheduled(userId: string, limit: number = 10) {
    // Fetch tasks that have unscheduledAt set (not null), are currently unscheduled (no startAt),
    // and are not done. Order by unscheduledAt descending (most recent first).
    return this.dbs.db
      .select()
      .from(todos)
      .where(
        and(
          eq(todos.userId, userId),
          isNotNull(todos.unscheduledAt),
          sql`${todos.startAt} IS NULL`,
          eq(todos.done, false),
        ),
      )
      .orderBy(desc(todos.unscheduledAt))
      .limit(Math.min(limit, 50));
  }
}
