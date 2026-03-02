import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from '../db/schema';

// Define enums
export const fieldCharacterTypeEnum = pgEnum('field_character_type', [
  'varchar',
  'int',
  'decimal',
  'date',
  'currency',
]);

export const fieldStatusEnum = pgEnum('field_status', [
  'active',
  'hidden',
  'archived',
]);

// Define table
export const fieldLibrary = pgTable(
  'field_library',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fieldKey: varchar('field_key', { length: 255 }).notNull(), // Unique constraint added in indexes
    label: varchar('label', { length: 255 }).notNull(),
    characterType: fieldCharacterTypeEnum('character_type').notNull(),
    characterLimit: integer('character_limit'), // nullable, only for varchar
    version: integer('version').notNull().default(1),
    status: fieldStatusEnum('status').notNull().default('active'),
    required: boolean('required').notNull().default(false),
    extractionHint: text('extraction_hint'),
    createdBy: uuid('created_by')
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Indexes
    fieldKeyIdx: unique('field_key_unique').on(table.fieldKey),
    statusIdx: index('field_library_status_idx').on(table.status),
    createdByIdx: index('field_library_created_by_idx').on(table.createdBy),
  }),
);

// Export types
export type FieldLibrary = typeof fieldLibrary.$inferSelect;
export type NewFieldLibrary = typeof fieldLibrary.$inferInsert;
