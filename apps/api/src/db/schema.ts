import { pgTable, text, timestamp, uuid, boolean, index, integer, jsonb, decimal, varchar, numeric, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { DEFAULT_TASK_STAGE_KEY } from '../common/constants';
import { extractionBaselines } from '../baseline/schema';
import { fieldLibrary } from '../field-library/schema';

// Users table
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').unique().notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    role: text('role').default('user').notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
    lockUntil: timestamp('lock_until'),
    mustChangePassword: boolean('must_change_password').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Password Reset Tokens table
export const passwordResetTokens = pgTable('password_reset_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// System Settings table (single row: id=1)
export const systemSettings = pgTable('system_settings', {
    id: integer('id').primaryKey().notNull(),
    defaultDurationMin: integer('default_duration_min').notNull().default(30),
    minDurationMin: integer('min_duration_min').notNull().default(5),
    maxDurationMin: integer('max_duration_min').notNull().default(1440),
    workingHours: text('working_hours'),
    workingDays: text('working_days'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


// Categories table
export const categories = pgTable(
    'categories',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        color: text('color').notNull(),
        sortOrder: integer('sort_order').notNull().default(0),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        userIdIdx: index('categories_user_id_idx').on(table.userId),
        userNameIdx: index('categories_user_name_idx').on(table.userId, table.name),
    })
);

// Todos table
export const todos = pgTable(
    'todos',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // Note: Code uses 'category' string, not foreign key relation.
        category: text('category'),
        title: text('title').notNull(),
        description: text('description'),
        done: boolean('done').default(false).notNull(),
        // V2: Priority, Due Date
        priority: text('priority').default('medium').notNull(), // low, medium, high
        dueDate: timestamp('due_date'),

        // V3: Duration & Scheduling
        durationMin: integer('duration_min').default(30).notNull(),
        startAt: timestamp('start_at'),

        // V4: Task List features
        unscheduledAt: timestamp('unscheduled_at'),
        isPinned: boolean('is_pinned').default(false).notNull(),
        stageKey: text('stage_key').default(DEFAULT_TASK_STAGE_KEY).notNull(),

        parentId: uuid('parent_id'),

        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        userIdIdx: index('todos_user_id_idx').on(table.userId),
        categoryIdx: index('todos_category_idx').on(table.category),
        doneIdx: index('todos_done_idx').on(table.done),
        priorityIdx: index('todos_priority_idx').on(table.priority),
        dueDateIdx: index('todos_due_date_idx').on(table.dueDate),
        schedulingIdx: index('todos_scheduling_idx').on(table.userId, table.startAt),
        parentIdIdx: index('todos_parent_id_idx').on(table.parentId),
    })
);

// Remarks table
export const remarks = pgTable('remarks', {
    id: uuid('id').primaryKey().defaultRandom(),
    todoId: uuid('todo_id')
        .notNull()
        .references(() => todos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    stageKeyAtCreation: text('stage_key_at_creation'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Attachments table
export const attachments = pgTable(
    'attachments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        todoId: uuid('todo_id')
            .notNull()
            .references(() => todos.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        filename: text('filename').notNull(),
        storedFilename: text('stored_filename').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        stageKeyAtCreation: text('stage_key_at_creation'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        todoIdIdx: index('attachments_todo_id_idx').on(table.todoId),
        userIdIdx: index('attachments_user_id_idx').on(table.userId),
    })
);

// Attachment OCR Outputs table
export const attachmentOcrOutputs = pgTable(
    'attachment_ocr_outputs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        attachmentId: uuid('attachment_id')
            .notNull()
            .references(() => attachments.id, { onDelete: 'cascade' }),
        extractedText: text('extracted_text').notNull(),
        metadata: text('metadata'),
        processingStatus: text('processing_status').notNull(),
        status: varchar('status', { length: 20 }).default('draft').notNull(),

        confirmedAt: timestamp('confirmed_at'),
        confirmedBy: uuid('confirmed_by').references(() => users.id),
        utilizedAt: timestamp('utilized_at'),
        utilizationType: varchar('utilization_type', { length: 30 }),
        utilizationMetadata: jsonb('utilization_metadata'),

        archivedAt: timestamp('archived_at'),
        archivedBy: uuid('archived_by').references(() => users.id),
        archiveReason: text('archive_reason'),
        isCurrent: boolean('is_current').default(true).notNull(),

        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        attachmentIdIdx: index('attachment_ocr_outputs_attachment_id_idx').on(table.attachmentId),
        statusIdx: index('idx_ocr_status').on(table.status),
        attachmentStatusIdx: index('idx_ocr_attachment_status').on(table.attachmentId, table.status),
        utilizationIdx: index('idx_ocr_utilization').on(table.utilizationType),
    })
);

// OCR Results table
export const ocrResults = pgTable(
    'ocr_results',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        attachmentOcrOutputId: uuid('attachment_ocr_output_id')
            .notNull()
            .references(() => attachmentOcrOutputs.id, { onDelete: 'cascade' }),
        fieldName: varchar('field_name', { length: 255 }).notNull(),
        fieldType: varchar('field_type', { length: 20 }).notNull().default('text'),
        fieldValue: text('field_value'),
        confidence: numeric('confidence', { precision: 5, scale: 4 }),
        boundingBox: jsonb('bounding_box'),
        pageNumber: integer('page_number'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        outputIdIdx: index('idx_ocr_results_output_id').on(table.attachmentOcrOutputId),
        fieldNameIdx: index('idx_ocr_results_field_name').on(table.fieldName),
    })
);

// OCR Jobs queue table
export const ocrJobs = pgTable(
    'ocr_jobs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        attachmentId: uuid('attachment_id')
            .notNull()
            .references(() => attachments.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        status: varchar('status', { length: 30 }).notNull(),
        requestedAt: timestamp('requested_at').defaultNow().notNull(),
        startedAt: timestamp('started_at'),
        completedAt: timestamp('completed_at'),
        dismissedAt: timestamp('dismissed_at'),
        error: text('error'),
        outputId: uuid('output_id')
            .references(() => attachmentOcrOutputs.id, { onDelete: 'set null' }),
    },
    (table) => ({
        userStatusIdx: index('idx_ocr_jobs_user_status').on(table.userId, table.status),
        statusRequestedIdx: index('idx_ocr_jobs_status_requested').on(table.status, table.requestedAt),
        attachmentIdx: index('idx_ocr_jobs_attachment_id').on(table.attachmentId),
    }),
);

// Extracted Text Segments table
export const extractedTextSegments = pgTable(
    'extracted_text_segments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        attachmentOcrOutputId: uuid('attachment_ocr_output_id')
            .notNull()
            .references(() => attachmentOcrOutputs.id, { onDelete: 'cascade' }),
        text: text('text').notNull(),
        confidence: numeric('confidence', { precision: 5, scale: 4 }),
        boundingBox: jsonb('bounding_box'),
        pageNumber: integer('page_number'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        outputIdIdx: index('idx_extracted_text_segments_output_id').on(table.attachmentOcrOutputId),
    })
);

// OCR Corrections table
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
    (table) => ({
        resultIdIdx: index('idx_ocr_corrections_ocr_result_id').on(table.ocrResultId),
        correctedByIdx: index('idx_ocr_corrections_corrected_by').on(table.correctedBy),
        createdAtIdx: index('idx_ocr_corrections_created_at').on(table.createdAt),
    })
);

// Baseline Field Assignments table
export const baselineFieldAssignments = pgTable(
    'baseline_field_assignments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        baselineId: uuid('baseline_id')
            .notNull()
            .references(() => extractionBaselines.id, { onDelete: 'cascade' }),
        fieldKey: varchar('field_key', { length: 255 })
            .notNull()
            .references(() => fieldLibrary.fieldKey),
        assignedValue: text('assigned_value'),
        sourceSegmentId: uuid('source_segment_id')
            .references(() => extractedTextSegments.id, { onDelete: 'set null' }),
        assignedBy: uuid('assigned_by')
            .notNull()
            .references(() => users.id),
        assignedAt: timestamp('assigned_at').defaultNow().notNull(),
        correctedFrom: text('corrected_from'),
        correctionReason: text('correction_reason'),
        validationValid: boolean('validation_valid'),
        validationError: text('validation_error'),
        validationSuggestion: text('validation_suggestion'),
        // ML suggestion metadata (v8.8)
        suggestionConfidence: decimal('suggestion_confidence', { precision: 3, scale: 2 }),
        suggestionAccepted: boolean('suggestion_accepted'),
        modelVersionId: uuid('model_version_id')
            .references(() => mlModelVersions.id),
    },
    (table) => ({
        baselineFieldUnique: unique('baseline_field_unique').on(table.baselineId, table.fieldKey),
        baselineIdx: index('idx_baseline_field_assignments_baseline_id').on(table.baselineId),
        fieldKeyIdx: index('idx_baseline_field_assignments_field_key').on(table.fieldKey),
        sourceSegmentIdx: index('idx_baseline_field_assignments_source_segment_id').on(table.sourceSegmentId),
        modelVersionIdx: index('idx_baseline_field_assignments_model_version_id').on(table.modelVersionId),
    })
);

// Baseline Tables table
export const baselineTables = pgTable(
    'baseline_tables',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        baselineId: uuid('baseline_id')
            .notNull()
            .references(() => extractionBaselines.id, { onDelete: 'cascade' }),
        tableIndex: integer('table_index').notNull(),
        tableLabel: text('table_label'),
        status: varchar('status', { length: 20 }).default('draft').notNull(),
        rowCount: integer('row_count').notNull().default(0),
        columnCount: integer('column_count').notNull().default(0),
        confirmedAt: timestamp('confirmed_at'),
        confirmedBy: uuid('confirmed_by').references(() => users.id),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        baselineTableUnique: unique('baseline_table_unique').on(table.baselineId, table.tableIndex),
    })
);

// Baseline Table Cells table
export const baselineTableCells = pgTable(
    'baseline_table_cells',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        tableId: uuid('table_id')
            .notNull()
            .references(() => baselineTables.id, { onDelete: 'cascade' }),
        rowIndex: integer('row_index').notNull(),
        columnIndex: integer('column_index').notNull(),
        cellValue: text('cell_value'),
        validationStatus: varchar('validation_status', { length: 20 }).default('valid').notNull(),
        errorText: text('error_text'),
        correctionFrom: text('correction_from'),
        correctionReason: text('correction_reason'),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
    },
    (table) => ({
        cellUnique: unique('baseline_table_cell_unique').on(table.tableId, table.rowIndex, table.columnIndex),
        validationStatusIdx: index('idx_baseline_table_cells_validation').on(table.tableId, table.validationStatus),
    })
);

// Baseline Table Column Mappings table
export const baselineTableColumnMappings = pgTable(
    'baseline_table_column_mappings',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        tableId: uuid('table_id')
            .notNull()
            .references(() => baselineTables.id, { onDelete: 'cascade' }),
        columnIndex: integer('column_index').notNull(),
        fieldKey: varchar('field_key', { length: 255 })
            .notNull()
            .references(() => fieldLibrary.fieldKey),
    },
    (table) => ({
        columnMappingUnique: unique('baseline_table_column_mapping_unique').on(table.tableId, table.columnIndex),
        tableIdx: index('idx_baseline_table_column_mappings_table_id').on(table.tableId),
    })
);

// Audit Logs table
export const auditLogs = pgTable(
    'audit_logs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
        actorType: text('actor_type').default('user').notNull(),
        action: text('action').notNull(),
        module: text('module'),
        resourceType: text('resource_type'),
        resourceId: text('resource_id'),
        details: text('details'),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (table) => ({
        userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
        actionIdx: index('audit_logs_action_idx').on(table.action),
        createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
        userCreatedIdx: index('audit_logs_user_created_idx').on(table.userId, table.createdAt),
    })
);

// ML Model Versions table
export const mlModelVersions = pgTable(
    'ml_model_versions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        modelName: text('model_name').notNull(),
        version: text('version').notNull(),
        filePath: text('file_path').notNull(),
        metrics: jsonb('metrics'),
        trainedAt: timestamp('trained_at').defaultNow().notNull(),
        isActive: boolean('is_active').default(false).notNull(),
        createdBy: text('created_by'),
    },
    (table) => ({
        modelNameVersionUnique: unique('ml_model_versions_model_name_version_unique').on(table.modelName, table.version),
        isActiveIdx: index('ml_model_versions_is_active_idx').on(table.isActive),
    })
);

// ML Table Suggestions table
export const mlTableSuggestions = pgTable(
    'ml_table_suggestions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        attachmentId: uuid('attachment_id')
            .notNull()
            .references(() => attachments.id, { onDelete: 'cascade' }),
        regionId: uuid('region_id'),
        rowCount: integer('row_count').notNull(),
        columnCount: integer('column_count').notNull(),
        confidence: numeric('confidence', { precision: 5, scale: 4 }),
        boundingBox: jsonb('bounding_box'),
        cellMapping: jsonb('cell_mapping'),
        suggestedLabel: text('suggested_label'),
        status: varchar('status', { length: 20 }).default('pending').notNull(),
        suggestedAt: timestamp('suggested_at').defaultNow().notNull(),
        ignoredAt: timestamp('ignored_at'),
        convertedAt: timestamp('converted_at'),
    },
    (table) => ({
        attachmentStatusIdx: index('idx_ml_table_suggestions_attachment_status').on(table.attachmentId, table.status),
    })
);

// Define Relations
export const usersRelations = relations(users, ({ many }) => ({
    todos: many(todos),
    categories: many(categories),
    remarks: many(remarks),
}));

export const todosRelations = relations(todos, ({ one, many }) => ({
    user: one(users, {
        fields: [todos.userId],
        references: [users.id],
    }),
    attachments: many(attachments),
    remarks: many(remarks),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    user: one(users, {
        fields: [categories.userId],
        references: [users.id],
    }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
    user: one(users, {
        fields: [passwordResetTokens.userId],
        references: [users.id],
    }),
}));

export const remarksRelations = relations(remarks, ({ one }) => ({
    todo: one(todos, {
        fields: [remarks.todoId],
        references: [todos.id],
    }),
    user: one(users, {
        fields: [remarks.userId],
        references: [users.id],
    }),
}));

export const attachmentsRelations = relations(attachments, ({ one, many }) => ({
    todo: one(todos, {
        fields: [attachments.todoId],
        references: [todos.id],
    }),
    user: one(users, {
        fields: [attachments.userId],
        references: [users.id],
    }),
    ocrOutputs: many(attachmentOcrOutputs),
    tableSuggestions: many(mlTableSuggestions),
}));

export const attachmentOcrOutputsRelations = relations(attachmentOcrOutputs, ({ one, many }) => ({
    attachment: one(attachments, {
        fields: [attachmentOcrOutputs.attachmentId],
        references: [attachments.id],
    }),
    results: many(ocrResults),
    segments: many(extractedTextSegments),
}));

export const ocrResultsRelations = relations(ocrResults, ({ one, many }) => ({
    output: one(attachmentOcrOutputs, {
        fields: [ocrResults.attachmentOcrOutputId],
        references: [attachmentOcrOutputs.id],
    }),
    corrections: many(ocrCorrections),
}));

export const ocrCorrectionsRelations = relations(ocrCorrections, ({ one }) => ({
    result: one(ocrResults, {
        fields: [ocrCorrections.ocrResultId],
        references: [ocrResults.id],
    }),
    correctedByUser: one(users, {
        fields: [ocrCorrections.correctedBy],
        references: [users.id],
    }),
}));

export const extractedTextSegmentsRelations = relations(extractedTextSegments, ({ one }) => ({
    output: one(attachmentOcrOutputs, {
        fields: [extractedTextSegments.attachmentOcrOutputId],
        references: [attachmentOcrOutputs.id],
    }),
}));

export const extractionBaselinesRelations = relations(extractionBaselines, ({ many }) => ({
    assignments: many(baselineFieldAssignments),
    tables: many(baselineTables),
}));

export const baselineFieldAssignmentsRelations = relations(baselineFieldAssignments, ({ one }) => ({
    baseline: one(extractionBaselines, {
        fields: [baselineFieldAssignments.baselineId],
        references: [extractionBaselines.id],
    }),
    field: one(fieldLibrary, {
        fields: [baselineFieldAssignments.fieldKey],
        references: [fieldLibrary.fieldKey],
    }),
    sourceSegment: one(extractedTextSegments, {
        fields: [baselineFieldAssignments.sourceSegmentId],
        references: [extractedTextSegments.id],
    }),
    user: one(users, {
        fields: [baselineFieldAssignments.assignedBy],
        references: [users.id],
    }),
}));

export const baselineTablesRelations = relations(baselineTables, ({ one, many }) => ({
    baseline: one(extractionBaselines, {
        fields: [baselineTables.baselineId],
        references: [extractionBaselines.id],
    }),
    confirmedByUser: one(users, {
        fields: [baselineTables.confirmedBy],
        references: [users.id],
    }),
    cells: many(baselineTableCells),
    columnMappings: many(baselineTableColumnMappings),
}));

export const baselineTableCellsRelations = relations(baselineTableCells, ({ one }) => ({
    table: one(baselineTables, {
        fields: [baselineTableCells.tableId],
        references: [baselineTables.id],
    }),
}));

export const baselineTableColumnMappingsRelations = relations(baselineTableColumnMappings, ({ one }) => ({
    table: one(baselineTables, {
        fields: [baselineTableColumnMappings.tableId],
        references: [baselineTables.id],
    }),
    field: one(fieldLibrary, {
        fields: [baselineTableColumnMappings.fieldKey],
        references: [fieldLibrary.fieldKey],
    }),
}));

export const mlTableSuggestionsRelations = relations(mlTableSuggestions, ({ one }) => ({
    attachment: one(attachments, {
        fields: [mlTableSuggestions.attachmentId],
        references: [attachments.id],
    }),
}));

// Export other schemas
export * from '../baseline/schema';
export * from '../field-library/schema';
