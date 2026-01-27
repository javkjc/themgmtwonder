import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { passwordResetTokens, users } from '../db/schema';

@Injectable()
export class UsersService {
  constructor(private readonly dbs: DbService) {}

  async findByEmail(email: string) {
    const row = await this.dbs.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    return row ?? null;
  }

  async create(email: string, passwordHash: string) {
    const [created] = await this.dbs.db
      .insert(users)
      .values({ email, passwordHash })
      .returning();
    return created;
  }

  async findById(id: string) {
    const row = await this.dbs.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return row ?? null;
  }

  async invalidateResetTokens(userId: string) {
    await this.dbs.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );
  }

  async createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ) {
    const [created] = await this.dbs.db
      .insert(passwordResetTokens)
      .values({ userId, token, expiresAt })
      .returning();
    return created ?? null;
  }

  async findValidResetToken(token: string) {
    const now = new Date();
    const row = await this.dbs.db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.token, token),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    });
    if (!row) return null;

    const user = await this.findById(row.userId);
    if (!user) return null;

    return { token: row, user };
  }

  async markResetTokenUsed(id: string) {
    await this.dbs.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  async resetLoginFailures(id: string) {
    const [updated] = await this.dbs.db
      .update(users)
      .set({ failedLoginAttempts: 0, lockUntil: null })
      .where(eq(users.id, id))
      .returning();
    return updated ?? null;
  }

  async recordLoginFailure(
    id: string,
    failedLoginAttempts: number,
    lockUntil: Date | null,
  ) {
    const [updated] = await this.dbs.db
      .update(users)
      .set({ failedLoginAttempts, lockUntil })
      .where(eq(users.id, id))
      .returning();
    return updated ?? null;
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string,
    clearMustChange = true,
  ) {
    const [updated] = await this.dbs.db
      .update(users)
      .set({
        passwordHash,
        ...(clearMustChange ? { mustChangePassword: false } : {}),
      })
      .where(eq(users.id, id))
      .returning();
    return updated ?? null;
  }

  async setMustChangePassword(id: string, mustChange: boolean) {
    const [updated] = await this.dbs.db
      .update(users)
      .set({ mustChangePassword: mustChange })
      .where(eq(users.id, id))
      .returning();
    return updated ?? null;
  }

  async setRole(id: string, role: string) {
    const [updated] = await this.dbs.db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning();
    return updated ?? null;
  }

  async findAll() {
    return this.dbs.db.query.users.findMany({
      columns: {
        id: true,
        email: true,
        createdAt: true,
        role: true,
        mustChangePassword: true,
      },
    });
  }
}
