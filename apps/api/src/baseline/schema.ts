import {
  pgTable,
  uuid,
  timestamp,
  pgEnum,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';

// Baseline lifecycle status enum
export const baselineStatusEnum = pgEnum('baseline_status', [
  'draft',
  'reviewed',
  'confirmed',
  'archived',
]);

// Baseline utilization type enum
export const baselineUtilizationTypeEnum = pgEnum('baseline_utilization_type', [
  'record_created',
  'process_committed',
  'data_exported',
]);

// Extraction baselines table
// Note: Foreign key references to users and attachments are defined inline
// to avoid circular dependencies. The actual tables are imported via db/schema.ts
export const extractionBaselines = pgTable(
  'extraction_baselines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(
        (): any => {
          // Lazy reference to avoid circular dependency
          const { attachments } = require('../db/schema');
          return attachments.id;
        },
        { onDelete: 'cascade' },
      ),
    status: baselineStatusEnum('status').notNull().default('draft'),
    confirmedAt: timestamp('confirmed_at'),
    confirmedBy: uuid('confirmed_by').references((): any => {
      // Lazy reference to avoid circular dependency
      const { users } = require('../db/schema');
      return users.id;
    }),
    utilizedAt: timestamp('utilized_at'),
    utilizationType: baselineUtilizationTypeEnum('utilization_type'),
    utilizationMetadata: jsonb('utilization_metadata'),
    archivedAt: timestamp('archived_at'),
    archivedBy: uuid('archived_by').references((): any => {
      // Lazy reference to avoid circular dependency
      const { users } = require('../db/schema');
      return users.id;
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // Standard indexes
    attachmentIdIdx: index('extraction_baselines_attachment_id_idx').on(
      table.attachmentId,
    ),
    statusIdx: index('extraction_baselines_status_idx').on(table.status),
    // NOTE: Partial unique index (WHERE status = 'confirmed') must be added via SQL migration
    // Drizzle does not support partial unique indexes in schema definition
    // See migration file for: CREATE UNIQUE INDEX extraction_baselines_confirmed_unique ON extraction_baselines(attachment_id) WHERE status = 'confirmed';
  }),
);

// Export types
export type ExtractionBaseline = typeof extractionBaselines.$inferSelect;
export type NewExtractionBaseline = typeof extractionBaselines.$inferInsert;
