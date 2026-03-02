import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { users, systemSettings } from '../db/schema';

const DEFAULT_ADMIN_EMAIL = 'admin@example.com';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    // Skip bootstrap during migration runs to prevent table creation conflicts
    if (process.env.SKIP_BOOTSTRAP === 'true') {
      this.logger.log('Bootstrap skipped (SKIP_BOOTSTRAP=true)');
      return;
    }
    await this.ensureSystemSettingsExist();
    await this.ensureAdminExists();
  }

  private async ensureSystemSettingsExist() {
    // Check if system settings row exists
    const existing = await this.dbs.db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });

    if (existing) {
      // Validate guards: default >= min and default <= max
      if (existing.defaultDurationMin < existing.minDurationMin) {
        this.logger.error(
          `Invalid system settings: defaultDurationMin (${existing.defaultDurationMin}) < minDurationMin (${existing.minDurationMin})`,
        );
        throw new Error('System settings validation failed: default < min');
      }
      if (existing.defaultDurationMin > existing.maxDurationMin) {
        this.logger.error(
          `Invalid system settings: defaultDurationMin (${existing.defaultDurationMin}) > maxDurationMin (${existing.maxDurationMin})`,
        );
        throw new Error('System settings validation failed: default > max');
      }
      return;
    }

    // Create default system settings row
    await this.dbs.db.insert(systemSettings).values({
      id: 1,
      minDurationMin: 5,
      maxDurationMin: 1440,
      defaultDurationMin: 30,
    });

    this.logger.log(
      'Created default system settings (min: 5, max: 1440, default: 30)',
    );
  }

  private async ensureAdminExists() {
    const adminEmail =
      this.config.get<string>('ADMIN_EMAIL') || DEFAULT_ADMIN_EMAIL;
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD');

    if (!adminPassword) {
      this.logger.error(
        'ADMIN_PASSWORD environment variable is not set. Bootstrap aborted. Set ADMIN_PASSWORD in your .env file.',
      );
      throw new Error('ADMIN_PASSWORD must be set via environment variable');
    }

    // Check if admin already exists
    const existingAdmin = await this.dbs.db.query.users.findFirst({
      where: eq(users.email, adminEmail),
    });

    if (existingAdmin) {
      // Ensure the user has admin role and isAdmin flag
      if (existingAdmin.role !== 'admin' || !existingAdmin.isAdmin) {
        await this.dbs.db
          .update(users)
          .set({ role: 'admin', isAdmin: true })
          .where(eq(users.id, existingAdmin.id));
        this.logger.log(`Promoted existing user ${adminEmail} to admin role`);
      }
      return;
    }

    // Create admin user
    const passwordHash = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
    });

    await this.dbs.db.insert(users).values({
      email: adminEmail,
      passwordHash,
      role: 'admin',
      isAdmin: true,
      mustChangePassword: true, // Require password change on first login
    });

    this.logger.log(`Created admin user: ${adminEmail}`);
    this.logger.log('IMPORTANT: Change the admin password immediately after first login!');
  }
}
