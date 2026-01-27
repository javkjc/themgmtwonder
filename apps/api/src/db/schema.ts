import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { DEFAULT_TASK_STAGE_KEY } from '../common/constants';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Flag indicating user must change password on next login (for temp passwords)
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  // Role: 'user' or 'admin'
  role: text('role').default('user').notNull(),
  // Admin flag for access control
  isAdmin: boolean('is_admin').default(false).notNull(),
  // Login abuse protection
  failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
  lockUntil: timestamp('lock_until'),
});

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('password_reset_tokens_user_id_idx').on(t.userId),
    tokenIdx: index('password_reset_tokens_token_idx').on(t.token),
  }),
);

export const todos = pgTable(
  'todos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'), // Optional task description
    done: boolean('done').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    // âœ… scheduling fields (nullable)
    startAt: timestamp('start_at'),
    durationMin: integer('duration_min'),

    // âœ… category field (nullable, default: null for uncategorized)
    category: text('category'),

    // âœ… track when task was last unscheduled (for "recently unscheduled" feature)
    unscheduledAt: timestamp('unscheduled_at'),

    // âœ… pin flag (task list pinning)
    isPinned: boolean('is_pinned').default(false).notNull(),

    // âœ… explicit task stage/status tag
    stageKey: text('stage_key').default(DEFAULT_TASK_STAGE_KEY),
  },
  (t) => ({
    userIdIdx: index('todos_user_id_idx').on(t.userId),
    userDoneIdx: index('todos_user_done_idx').on(t.userId, t.done),
    userCreatedIdx: index('todos_user_created_at_idx').on(
      t.userId,
      t.createdAt,
    ),

    // âœ… optional, but recommended for calendar queries
    userStartIdx: index('todos_user_start_at_idx').on(t.userId, t.startAt),
  }),
);

// User settings/preferences
export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Working hours (stored as JSON string like {"start": "09:00", "end": "17:00"})
  workingHours: text('working_hours')
    .default('{"start":"09:00","end":"17:00"}')
    .notNull(),
  // Working days (stored as JSON array like [1,2,3,4,5] for Mon-Fri)
  workingDays: text('working_days').default('[1,2,3,4,5]').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User-defined categories
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(), // Hex color like '#3b82f6'
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('categories_user_id_idx').on(t.userId),
    userNameIdx: index('categories_user_name_idx').on(t.userId, t.name),
  }),
);

// Task attachments
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    todoId: uuid('todo_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(), // Original filename
    storedFilename: text('stored_filename').notNull(), // UUID-based stored filename
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(), // File size in bytes
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Stage that was active on the parent todo when the attachment was uploaded
    stageKeyAtCreation: text('stage_key_at_creation'),
  },
  (t) => ({
    todoIdIdx: index('attachments_todo_id_idx').on(t.todoId),
    userIdIdx: index('attachments_user_id_idx').on(t.userId),
  }),
);

// Derived OCR output tied to a specific attachment. Records are immutable once stored.
export const attachmentOcrOutputs = pgTable(
  'attachment_ocr_outputs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    extractedText: text('extracted_text').notNull(),
    metadata: text('metadata'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    attachmentIdx: index('attachment_ocr_outputs_attachment_id_idx').on(
      t.attachmentId,
    ),
    statusIdx: index('attachment_ocr_outputs_status_idx').on(t.status),
  }),
);

// Audit/Activity logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }), // Keep logs even if user deleted
    actorType: text('actor_type').default('user').notNull(),
    action: text('action').notNull(), // e.g., 'login', 'todo.create', 'todo.update', 'todo.delete'
    module: text('module'), // Feature area: task/remark/attachment/auth/settings
    resourceType: text('resource_type'), // e.g., 'todo', 'user', 'category'
    resourceId: text('resource_id'), // ID of affected resource
    details: text('details'), // JSON string with additional context
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('audit_logs_user_id_idx').on(t.userId),
    actionIdx: index('audit_logs_action_idx').on(t.action),
    createdAtIdx: index('audit_logs_created_at_idx').on(t.createdAt),
    userCreatedIdx: index('audit_logs_user_created_idx').on(
      t.userId,
      t.createdAt,
    ),
  }),
);

// Task remarks/notes (conversation-style)
export const remarks = pgTable(
  'remarks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    todoId: uuid('todo_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(), // Max 150 chars (enforced in DTO)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Stage that was active on the parent todo when the remark was created
    stageKeyAtCreation: text('stage_key_at_creation'),
  },
  (t) => ({
    todoIdIdx: index('remarks_todo_id_idx').on(t.todoId),
    todoCreatedIdx: index('remarks_todo_created_idx').on(t.todoId, t.createdAt),
  }),
);

// System-wide settings (single row, id=1)
export const systemSettings = pgTable('system_settings', {
  id: integer('id').primaryKey().default(1),
  minDurationMin: integer('min_duration_min').default(5).notNull(),
  maxDurationMin: integer('max_duration_min').default(1440).notNull(),
  defaultDurationMin: integer('default_duration_min').default(30).notNull(),
  workingHours: text('working_hours')
    .default('{"start":"09:00","end":"17:00"}')
    .notNull(),
  workingDays: text('working_days').default('[1,2,3,4,5]').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
