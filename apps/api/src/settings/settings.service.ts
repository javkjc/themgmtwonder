import { Injectable, BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { systemSettings } from '../db/schema';

export type WorkingHours = {
  start: string; // "09:00"
  end: string; // "17:00"
};

export type UserSettingsData = {
  workingHours: WorkingHours;
  workingDays: number[]; // [1,2,3,4,5] for Mon-Fri (0=Sun, 1=Mon, etc.)
};

const DEFAULT_WORKING_HOURS: WorkingHours = { start: '09:00', end: '17:00' };
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

@Injectable()
export class SettingsService {
  constructor(private readonly dbs: DbService) {}

  async getSettings(): Promise<UserSettingsData> {
    const settings = await this.dbs.db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });

    if (!settings) {
      return {
        workingHours: DEFAULT_WORKING_HOURS,
        workingDays: DEFAULT_WORKING_DAYS,
      };
    }

    return {
      workingHours: settings.workingHours
        ? JSON.parse(settings.workingHours)
        : DEFAULT_WORKING_HOURS,
      workingDays: settings.workingDays
        ? JSON.parse(settings.workingDays)
        : DEFAULT_WORKING_DAYS,
    };
  }

  async updateSettings(data: Partial<UserSettingsData>) {
    const existing = await this.dbs.db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });

    if (!existing) {
      throw new BadRequestException('System settings not initialized');
    }

    const nextWorkingHours =
      data.workingHours !== undefined
        ? JSON.stringify(data.workingHours)
        : (existing.workingHours ?? JSON.stringify(DEFAULT_WORKING_HOURS));

    const nextWorkingDays =
      data.workingDays !== undefined
        ? JSON.stringify(data.workingDays)
        : (existing.workingDays ?? JSON.stringify(DEFAULT_WORKING_DAYS));

    const [updated] = await this.dbs.db
      .update(systemSettings)
      .set({
        workingHours: nextWorkingHours,
        workingDays: nextWorkingDays,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, 1))
      .returning();

    return {
      workingHours: updated.workingHours
        ? JSON.parse(updated.workingHours)
        : DEFAULT_WORKING_HOURS,
      workingDays: updated.workingDays
        ? JSON.parse(updated.workingDays)
        : DEFAULT_WORKING_DAYS,
    };
  }

  async getDurationSettings() {
    const settings = await this.dbs.db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });

    if (!settings) {
      // Return defaults if not found (should never happen due to bootstrap)
      return {
        minDurationMin: 5,
        maxDurationMin: 1440,
        defaultDurationMin: 30,
      };
    }

    return {
      minDurationMin: settings.minDurationMin,
      maxDurationMin: settings.maxDurationMin,
      defaultDurationMin: settings.defaultDurationMin,
    };
  }

  async updateDurationSettings(data: {
    minDurationMin?: number;
    maxDurationMin?: number;
    defaultDurationMin?: number;
  }) {
    // Fetch current settings
    const current = await this.dbs.db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });

    if (!current) {
      throw new BadRequestException('System settings not initialized');
    }

    // Determine new values (use current if not provided)
    const newMin = data.minDurationMin ?? current.minDurationMin;
    const newMax = data.maxDurationMin ?? current.maxDurationMin;
    const newDefault = data.defaultDurationMin ?? current.defaultDurationMin;

    // Enforce guards: default >= min and default <= max
    if (newDefault < newMin) {
      throw new BadRequestException(
        `defaultDurationMin (${newDefault}) must be >= minDurationMin (${newMin})`,
      );
    }
    if (newDefault > newMax) {
      throw new BadRequestException(
        `defaultDurationMin (${newDefault}) must be <= maxDurationMin (${newMax})`,
      );
    }

    // Update settings
    const [updated] = await this.dbs.db
      .update(systemSettings)
      .set({
        minDurationMin: newMin,
        maxDurationMin: newMax,
        defaultDurationMin: newDefault,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, 1))
      .returning();

    return {
      minDurationMin: updated.minDurationMin,
      maxDurationMin: updated.maxDurationMin,
      defaultDurationMin: updated.defaultDurationMin,
    };
  }
}
