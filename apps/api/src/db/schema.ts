import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  integer,
  jsonb,
  varchar,
  numeric,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
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

    // ✅ parent-child relationship (v4 structural)
    // - null = independent task
    // - references todos.id = this is a child task
    // - parent tasks have children referencing them
    parentId: uuid('parent_id').references(() => todos.id, {
      onDelete: 'restrict',
    }),
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

    // ✅ v4 parent-child index
    parentIdIdx: index('todos_parent_id_idx').on(t.parentId),
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
    // OCR worker processing state (previously the only status column)
    processingStatus: text('processing_status').notNull(),
    // Business-facing OCR lifecycle state; check constraint enforced via migration
    status: varchar('status', { length: 20 }).default('draft').notNull(),
    confirmedAt: timestamp('confirmed_at'),
    confirmedBy: uuid('confirmed_by').references(() => users.id),
    utilizedAt: timestamp('utilized_at'),
    utilizationType: varchar('utilization_type', { length: 30 }),
    utilizationMetadata: jsonb('utilization_metadata'),
    archivedAt: timestamp('archived_at'),
    archivedBy: uuid('archived_by').references(() => users.id),
    archiveReason: text('archive_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    attachmentIdx: index('attachment_ocr_outputs_attachment_id_idx').on(
      t.attachmentId,
    ),
    statusIdx: index('idx_ocr_status').on(t.status),
    attachmentStatusIdx: index('idx_ocr_attachment_status').on(
      t.attachmentId,
      t.status,
    ),
    // Partial index (WHERE utilization_type IS NOT NULL) defined in SQL migration.
    utilizationIdx: index('idx_ocr_utilization').on(t.utilizationType),
  }),
);

export const ocrResults = pgTable(
  'ocr_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attachmentOcrOutputId: uuid('attachment_ocr_output_id')
      .notNull()
      .references(() => attachmentOcrOutputs.id, { onDelete: 'cascade' }),
    fieldName: varchar('field_name', { length: 255 }).notNull(),
    fieldValue: text('field_value'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    boundingBox: jsonb('bounding_box'),
    pageNumber: integer('page_number'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    attachmentIdx: index('idx_ocr_results_attachment_ocr_output_id').on(
      t.attachmentOcrOutputId,
    ),
    fieldNameIdx: index('idx_ocr_results_field_name').on(t.fieldName),
  }),
);

export const ocrResultsRelations = relations(ocrResults, ({ one }) => ({
  attachmentOcrOutput: one(attachmentOcrOutputs, {
    fields: [ocrResults.attachmentOcrOutputId],
    references: [attachmentOcrOutputs.id],
  }),
}));

export const ocrCorrections = pgTable(
  'ocr_corrections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ocrResultId: uuid('ocr_result_id')
      .notNull()
      .references(() => ocrResults.id, { onDelete: 'cascade' }),
    correctedBy: uuid('corrected_by')
      .notNull()
      .references(() => users.id),
    originalValue: text('original_value'),
    correctedValue: text('corrected_value').notNull(),
    correctionReason: text('correction_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    ocrResultIdIdx: index('idx_ocr_corrections_ocr_result_id').on(t.ocrResultId),
    correctedByIdx: index('idx_ocr_corrections_corrected_by').on(t.correctedBy),
    createdAtIdx: index('idx_ocr_corrections_created_at').on(t.createdAt),
  }),
);

export const ocrCorrectionsRelations = relations(ocrCorrections, ({ one }) => ({
  ocrResult: one(ocrResults, {
    fields: [ocrCorrections.ocrResultId],
    references: [ocrResults.id],
  }),
  correctedByUser: one(users, {
    fields: [ocrCorrections.correctedBy],
    references: [users.id],
  }),
}));

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

// Workflow definitions (v5 - admin-owned, inert records)
export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    version: integer('version').default(1).notNull(),
    isActive: boolean('is_active').default(false).notNull(), // v6: default to false
    // v6: workflowGroupId groups versions together; each version has unique ID
    workflowGroupId: uuid('workflow_group_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    nameIdx: index('workflow_definitions_name_idx').on(t.name),
    activeIdx: index('workflow_definitions_active_idx').on(t.isActive),
    groupIdx: index('workflow_definitions_group_idx').on(t.workflowGroupId),
    groupVersionIdx: index('workflow_definitions_group_version_idx').on(
      t.workflowGroupId,
      t.version,
    ),
  }),
);

// Workflow steps (v5 - ordered steps within a workflow definition)
export const workflowSteps = pgTable(
  'workflow_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(), // 1-based ordering
    stepType: text('step_type').notNull(), // e.g., 'approve', 'review', 'acknowledge'
    name: text('name').notNull(),
    description: text('description'),
    // Assigned role or user (stored as JSON: {type: 'role'|'user', value: string})
    assignedTo: text('assigned_to'),
    // Declarative conditions evaluated at execution start only (stored as JSON)
    conditions: text('conditions'),
    // v6: Optional reference to element template (nullable for backward compatibility)
    elementTemplateId: uuid('element_template_id').references(
      () => workflowElementTemplates.id,
      { onDelete: 'restrict' },
    ),
    // v6: Template version locked at time of instance creation
    elementTemplateVersion: integer('element_template_version'),
    // v6: Instance-specific configuration (JSON string, overrides template defaults)
    instanceConfig: text('instance_config'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    workflowDefIdIdx: index('workflow_steps_workflow_def_id_idx').on(
      t.workflowDefinitionId,
    ),
    workflowDefOrderIdx: index('workflow_steps_workflow_def_order_idx').on(
      t.workflowDefinitionId,
      t.stepOrder,
    ),
    elementTemplateIdIdx: index('workflow_steps_element_template_id_idx').on(
      t.elementTemplateId,
    ),
  }),
);

// Workflow execution records (v5 - immutable operational history of workflow runs)
export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'restrict' }),
    // Target entity (task, attachment, etc.) using same pattern as audit logs
    resourceType: text('resource_type').notNull(), // e.g., 'todo', 'attachment'
    resourceId: text('resource_id').notNull(), // ID of target entity
    // User who triggered the workflow execution
    triggeredBy: uuid('triggered_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Execution lifecycle timestamps
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    // Status: pending, in_progress, completed, failed, cancelled
    status: text('status').notNull().default('pending'),
    // Input parameters and output results as JSON
    inputs: text('inputs'), // JSON string with execution inputs
    outputs: text('outputs'), // JSON string with execution outputs
    // Error tracking
    errorDetails: text('error_details'),
    // Correlation ID for distributed tracing
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    workflowDefIdIdx: index('workflow_executions_workflow_def_id_idx').on(
      t.workflowDefinitionId,
    ),
    triggeredByIdx: index('workflow_executions_triggered_by_idx').on(
      t.triggeredBy,
    ),
    statusIdx: index('workflow_executions_status_idx').on(t.status),
    createdAtIdx: index('workflow_executions_created_at_idx').on(t.createdAt),
    resourceIdx: index('workflow_executions_resource_idx').on(
      t.resourceType,
      t.resourceId,
    ),
  }),
);

// Workflow step execution records (v5 - immutable append-only step-level history)
export const workflowStepExecutions = pgTable(
  'workflow_step_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowExecutionId: uuid('workflow_execution_id')
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
    workflowStepId: uuid('workflow_step_id')
      .notNull()
      .references(() => workflowSteps.id, { onDelete: 'restrict' }),
    // User who acted on this step
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Decision made: approved, rejected, acknowledged, skipped, etc.
    decision: text('decision').notNull(),
    // Mandatory remark/comment for the decision
    remark: text('remark'),
    // Step execution lifecycle
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    // Status: pending, in_progress, completed, skipped
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    executionIdIdx: index('workflow_step_executions_execution_id_idx').on(
      t.workflowExecutionId,
    ),
    stepIdIdx: index('workflow_step_executions_step_id_idx').on(
      t.workflowStepId,
    ),
    actorIdIdx: index('workflow_step_executions_actor_id_idx').on(t.actorId),
    createdAtIdx: index('workflow_step_executions_created_at_idx').on(
      t.createdAt,
    ),
  }),
);

// Workflow element templates (v6 - reusable workflow building blocks)
// These are admin-defined templates, NOT executable logic
// They serve as governed building blocks for workflow composition
export const workflowElementTemplates = pgTable(
  'workflow_element_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Template versioning: each template can have multiple versions
    templateVersion: integer('template_version').default(1).notNull(),
    // Group ID ties all versions of a template together
    templateGroupId: uuid('template_group_id'),
    // Element type: 'step' or 'decision'
    elementType: text('element_type').notNull(), // 'step' | 'decision'
    // Display label shown in admin UI
    displayLabel: text('display_label').notNull(),
    // For step elements: approve, review, acknowledge
    // For decision elements: if_else
    stepType: text('step_type'), // nullable for decision elements
    // Default configuration (JSON string)
    // For steps: {assignedTo, description, etc.}
    // For decisions: {branches: [{label, condition}]}
    defaultConfig: text('default_config'),
    // Fields that can be edited when instance is created (JSON array of field names)
    editableFields: text('editable_fields'),
    // Validation constraints (JSON string)
    validationConstraints: text('validation_constraints'),
    // Deprecation flag (templates are never deleted, only deprecated)
    isDeprecated: boolean('is_deprecated').default(false).notNull(),
    // Admin who created this template
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    elementTypeIdx: index('workflow_element_templates_element_type_idx').on(
      t.elementType,
    ),
    groupIdx: index('workflow_element_templates_group_idx').on(
      t.templateGroupId,
    ),
    groupVersionIdx: index('workflow_element_templates_group_version_idx').on(
      t.templateGroupId,
      t.templateVersion,
    ),
    deprecatedIdx: index('workflow_element_templates_deprecated_idx').on(
      t.isDeprecated,
    ),
  }),
);
