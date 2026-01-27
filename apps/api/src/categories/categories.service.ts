import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { categories, todos } from '../db/schema';

@Injectable()
export class CategoriesService {
  constructor(private readonly dbs: DbService) {}

  async findAll() {
    return this.dbs.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async findById(id: string) {
    const category = await this.dbs.db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    return category ?? null;
  }

  async create(userId: string, name: string, color: string) {
    // Check for duplicate name
    const existing = await this.dbs.db.query.categories.findFirst({
      where: eq(categories.name, name),
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }

    // Get max sortOrder for this user
    const allCategories = await this.findAll();
    const maxSortOrder = allCategories.reduce(
      (max, c) => Math.max(max, c.sortOrder),
      -1,
    );

    const [created] = await this.dbs.db
      .insert(categories)
      .values({
        userId,
        name,
        color,
        sortOrder: maxSortOrder + 1,
      })
      .returning();

    return created;
  }

  async update(
    id: string,
    data: { name?: string; color?: string; sortOrder?: number },
  ) {
    // Check ownership
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    // Check for duplicate name if name is being changed
    if (data.name && data.name !== existing.name) {
      const duplicate = await this.dbs.db.query.categories.findFirst({
        where: eq(categories.name, data.name),
      });
      if (duplicate) {
        throw new ConflictException('A category with this name already exists');
      }
    }

    const [updated] = await this.dbs.db
      .update(categories)
      .set(data)
      .where(eq(categories.id, id))
      .returning();

    return updated ?? null;
  }

  async delete(id: string) {
    // Check ownership
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    // Check if any tasks reference this category
    const tasksWithCategory = await this.dbs.db
      .select({ id: todos.id })
      .from(todos)
      .where(eq(todos.category, existing.name))
      .limit(1);

    if (tasksWithCategory.length > 0) {
      throw new BadRequestException(
        `Cannot delete category "${existing.name}" because it is used by one or more tasks. ` +
          `Please reassign or remove the category from all tasks first.`,
      );
    }

    await this.dbs.db.delete(categories).where(eq(categories.id, id));

    return { ok: true };
  }

  // Seed default categories for a new user
  async seedDefaults(userId: string) {
    const defaults = [
      { name: 'Work', color: '#3b82f6' },
      { name: 'Personal', color: '#8b5cf6' },
      { name: 'Health', color: '#10b981' },
      { name: 'Finance', color: '#f59e0b' },
      { name: 'Learning', color: '#ec4899' },
      { name: 'Other', color: '#6b7280' },
    ];

    const existing = await this.findAll();
    if (existing.length > 0) {
      return existing;
    }

    const created = await this.dbs.db
      .insert(categories)
      .values(
        defaults.map((d, i) => ({
          userId,
          name: d.name,
          color: d.color,
          sortOrder: i,
        })),
      )
      .returning();

    return created;
  }
}
