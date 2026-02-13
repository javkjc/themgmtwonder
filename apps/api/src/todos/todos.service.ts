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
  isNull,
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

  /**
   * Check if a task is a parent (has children)
   */
  private async isParentTask(
    todoId: string,
    txDb?: typeof this.dbs.db,
  ): Promise<boolean> {
    const db = txDb ?? this.dbs.db;
    const children = await db
      .select()
      .from(todos)
      .where(eq(todos.parentId, todoId))
      .limit(1);
    return children.length > 0;
  }

  /**
   * Get child count for a task
   */
  private async getChildCount(
    todoId: string,
    txDb?: typeof this.dbs.db,
  ): Promise<number> {
    const db = txDb ?? this.dbs.db;
    const children = await db
      .select()
      .from(todos)
      .where(eq(todos.parentId, todoId));
    return children.length;
  }

  /**
   * Enrich todos with child counts
   */
  private async enrichWithChildCounts(
    todoList: any[],
    txDb?: typeof this.dbs.db,
  ) {
    const db = txDb ?? this.dbs.db;
    const enriched = await Promise.all(
      todoList.map(async (todo) => {
        const childCount = await this.getChildCount(todo.id, db);
        return { ...todo, childCount };
      }),
    );
    return enriched;
  }

  /**
   * Check if all children of a parent task are closed
   */
  private async areAllChildrenClosed(
    parentId: string,
    txDb?: typeof this.dbs.db,
  ): Promise<boolean> {
    const db = txDb ?? this.dbs.db;
    const openChildren = await db
      .select()
      .from(todos)
      .where(and(eq(todos.parentId, parentId), eq(todos.done, false)))
      .limit(1);
    return openChildren.length === 0;
  }

  /**
   * Get parent task if it exists
   */
  private async getParentTask(
    parentId: string | null | undefined,
    txDb?: typeof this.dbs.db,
  ) {
    if (!parentId) return null;
    const db = txDb ?? this.dbs.db;
    const [parent] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, parentId));
    return parent ?? null;
  }

  async list(
    userId: string,
    opts?: {
      done?: boolean;
      scheduled?: boolean;
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

    // Schedule status filter
    if (typeof opts?.scheduled === 'boolean') {
      if (opts.scheduled) {
        conditions.push(isNotNull(todos.startAt));
      } else {
        conditions.push(isNull(todos.startAt));
      }
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

    const todoList = await this.dbs.db
      .select()
      .from(todos)
      .where(and(...conditions))
      .orderBy(orderExpr)
      .limit(limit);

    return this.enrichWithChildCounts(todoList);
  }

  async create(userId: string, dto: CreateTodoDto) {
    // v4 constraint: validate parentId if provided
    if (dto.parentId) {
      const parent = await this.getParentTask(dto.parentId);
      if (!parent) {
        throw new BadRequestException('Parent task not found');
      }
      if (parent.userId !== userId) {
        throw new BadRequestException('Parent task does not belong to user');
      }
      // v4 constraint: child cannot have a parent that already has a parent (max depth 2)
      if (parent.parentId) {
        throw new BadRequestException(
          'Cannot create child of child task (max depth: 2 levels)',
        );
      }
      // NEW: parent tasks cannot be scheduled
      if (parent.startAt !== null) {
        throw new ConflictException(
          'Parent tasks cannot be scheduled. Unschedule the parent first.',
        );
      }
    }

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
        parentId: dto.parentId,
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

  /**
   * Get children of a parent task (v4 visibility)
   */
  async getChildren(userId: string, parentId: string) {
    const children = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.parentId, parentId), eq(todos.userId, userId)))
      .orderBy(asc(todos.createdAt));
    return children;
  }

  /**
   * Get parent of a child task (v4 visibility)
   */
  async getParent(userId: string, childId: string) {
    const [child] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, childId), eq(todos.userId, userId)));

    if (!child || !child.parentId) {
      return null;
    }

    const [parent] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, child.parentId), eq(todos.userId, userId)));

    return parent ?? null;
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
          parentId: dto.parentId,
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
      stageKey: TaskStageKey;
      parentId: string | null;
    }>,
  ) {
    return this.dbs.tx(async (txDb) => {
      // Get current task state
      const [currentTask] = await txDb
        .select()
        .from(todos)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
        .for('update');

      if (!currentTask) {
        return null;
      }

      // v4 constraint: validate parentId change if provided
      if (patch.parentId !== undefined && patch.parentId !== null) {
        const parent = await this.getParentTask(patch.parentId, txDb);
        if (!parent) {
          throw new BadRequestException('Parent task not found');
        }
        if (parent.userId !== userId) {
          throw new BadRequestException('Parent task does not belong to user');
        }
        // v4 constraint: child cannot have a parent that already has a parent (max depth 2)
        if (parent.parentId) {
          throw new BadRequestException(
            'Cannot attach to child task (max depth: 2 levels)',
          );
        }
        // NEW: parent tasks cannot be scheduled
        if (parent.startAt !== null) {
          throw new ConflictException(
            'Parent tasks cannot be scheduled. Unschedule the parent first.',
          );
        }
        // v4 constraint: cannot set parent on a task that is already a parent
        const isParent = await this.isParentTask(todoId, txDb);
        if (isParent) {
          throw new BadRequestException(
            'Cannot set parent on a parent task (parent tasks cannot have parents)',
          );
        }
      }

      // v4 constraint: check done status change
      if (patch.done !== undefined && patch.done !== currentTask.done) {
        // Closing a parent task
        if (patch.done === true) {
          const isParent = await this.isParentTask(todoId, txDb);
          if (isParent) {
            const allChildrenClosed = await this.areAllChildrenClosed(
              todoId,
              txDb,
            );
            if (!allChildrenClosed) {
              throw new BadRequestException(
                'Cannot close parent task while children are open',
              );
            }
          }
        }

        // Reopening a child task
        if (patch.done === false && currentTask.parentId) {
          const parent = await this.getParentTask(currentTask.parentId, txDb);
          if (parent && parent.done) {
            throw new BadRequestException(
              'Cannot reopen child task while parent is closed',
            );
          }
        }
      }

      const [row] = await txDb
        .update(todos)
        .set({
          ...patch,
          updatedAt: new Date(),
          durationMin: patch.durationMin,
        })
        .where(eq(todos.id, todoId))
        .returning();

      return row ?? null;
    });
  }

  async remove(userId: string, todoId: string) {
    return this.dbs.tx(async (txDb) => {
      // Get the task to check ownership and relationships
      const [task] = await txDb
        .select()
        .from(todos)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      // v4 constraint: Block deletion if parent has children
      const isParent = await this.isParentTask(todoId, txDb);
      if (isParent) {
        throw new BadRequestException(
          'Cannot delete parent task while it has children. Remove children first.',
        );
      }

      // v4 behavior: If deleting a child, it detaches (parentId cleared) before deletion
      // This ensures audit trail shows detachment, though task is ultimately deleted
      const wasChild = !!task.parentId;
      if (task.parentId) {
        await txDb
          .update(todos)
          .set({ parentId: null })
          .where(eq(todos.id, todoId));
      }

      // Delete the task
      const [row] = await txDb
        .delete(todos)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
        .returning();

      return { task: row ?? null, wasChild };
    });
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

      // v4 constraint: parent tasks cannot be scheduled
      if (startAt !== null) {
        const isParent = await this.isParentTask(todoId, txDb);
        if (isParent) {
          throw new BadRequestException(
            'Cannot schedule parent task (parent tasks cannot be scheduled)',
          );
        }
      }

      // If unscheduling, clear startAt only (allow updating durationMin) and set unscheduledAt
      if (startAt === null) {
        const [updated] = await txDb
          .update(todos)
          .set({
            startAt: null,
            unscheduledAt: new Date(),
            durationMin: dto.durationMin ?? undefined,
          })
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

  /**
   * Associate a child task with a parent task.
   * Returns both before and after snapshots for audit logging.
   */
  async associateTask(userId: string, childId: string, parentId: string) {
    return this.dbs.tx(async (txDb) => {
      // Get child task (must exist and belong to user)
      const [child] = await txDb
        .select()
        .from(todos)
        .where(and(eq(todos.id, childId), eq(todos.userId, userId)))
        .for('update');

      if (!child) {
        throw new NotFoundException('Child task not found');
      }

      // Get parent task (must exist and belong to user)
      const parent = await this.getParentTask(parentId, txDb);
      if (!parent) {
        throw new BadRequestException('Parent task not found');
      }
      if (parent.userId !== userId) {
        throw new BadRequestException('Parent task does not belong to user');
      }

      // v4 constraint: child cannot already be a parent
      const childIsParent = await this.isParentTask(childId, txDb);
      if (childIsParent) {
        throw new BadRequestException(
          'Cannot attach a parent task as child (convert children first)',
        );
      }

      // v4 constraint: parent cannot have a parent (max depth 2)
      if (parent.parentId) {
        throw new BadRequestException(
          'Parent task is already a child (max depth: 2 levels)',
        );
      }

      // NEW: parent tasks cannot be scheduled
      if (parent.startAt !== null) {
        throw new ConflictException(
          'Parent tasks cannot be scheduled. Unschedule the parent first.',
        );
      }

      // Capture before state
      const before = { ...child };

      // Update child to set parentId
      const [after] = await txDb
        .update(todos)
        .set({ parentId })
        .where(eq(todos.id, childId))
        .returning();

      return { before, after };
    });
  }

  /**
   * Disassociate a child task from its parent.
   * Returns both before and after snapshots for audit logging.
   */
  async disassociateTask(userId: string, childId: string) {
    return this.dbs.tx(async (txDb) => {
      // Get child task (must exist and belong to user)
      const [child] = await txDb
        .select()
        .from(todos)
        .where(and(eq(todos.id, childId), eq(todos.userId, userId)))
        .for('update');

      if (!child) {
        throw new NotFoundException('Task not found');
      }

      // v4 constraint: must have a parent to disassociate
      if (!child.parentId) {
        throw new BadRequestException(
          'Task has no parent to disassociate from',
        );
      }

      // Capture before state
      const before = { ...child };

      // Update child to clear parentId
      const [after] = await txDb
        .update(todos)
        .set({ parentId: null })
        .where(eq(todos.id, childId))
        .returning();

      return { before, after };
    });
  }
}
