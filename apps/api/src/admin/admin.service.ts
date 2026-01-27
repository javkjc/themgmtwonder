import { Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { eq, ilike } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { users } from '../db/schema';

function generateTempPassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

@Injectable()
export class AdminService {
  constructor(private readonly dbs: DbService) {}

  async searchUsers(query?: string) {
    if (!query || query.trim() === '') {
      // Return all users if no query
      return this.dbs.db.query.users.findMany({
        columns: {
          id: true,
          email: true,
          createdAt: true,
          role: true,
          mustChangePassword: true,
          isAdmin: true,
        },
        orderBy: (users, { desc }) => [desc(users.createdAt)],
      });
    }

    // Search by email (case insensitive partial match)
    const searchPattern = `%${query.trim()}%`;
    return this.dbs.db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(ilike(users.email, searchPattern));
  }

  async resetUserPassword(userId: string) {
    // Find user first
    const user = await this.dbs.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, {
      type: argon2.argon2id,
    });

    // Update user with new password hash and set mustChangePassword flag
    await this.dbs.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
      })
      .where(eq(users.id, userId));

    return {
      ok: true,
      tempPassword,
      userId,
      email: user.email,
    };
  }

  async toggleAdmin(userId: string, isAdmin: boolean) {
    // Find user first
    const user = await this.dbs.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update user isAdmin status
    await this.dbs.db
      .update(users)
      .set({
        isAdmin,
        role: isAdmin ? 'admin' : 'user',
      })
      .where(eq(users.id, userId));

    return {
      ok: true,
      userId,
      email: user.email,
      isAdmin,
    };
  }
}
