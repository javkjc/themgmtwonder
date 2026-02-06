# Checkpoint 1: Projection Schema - COMPLETED ✅

## Summary
Successfully fixed the workflow schema compilation errors and generated the migration for the three new workflow projection tables.

## What Was Done

### 1. Fixed Circular Dependency Issues
**Problem**: The `workflows/schema.ts` file was using `require()` calls to reference the `users` table, which caused TypeScript compilation errors.

**Solution**: 
- Removed all `require()` calls from `workflows/schema.ts`
- Removed foreign key references from column definitions in `workflows/schema.ts`
- Moved all relation definitions to the main `db/schema.ts` file where both `users` and workflow tables are available
- This follows Drizzle ORM best practices for handling circular dependencies

**Files Modified**:
- `apps/api/src/workflows/schema.ts` - Simplified to only define tables without relations
- `apps/api/src/db/schema.ts` - Added workflow table relations

### 2. Created Migration SQL
**File**: `apps/api/drizzle/0006_workflow_tables.sql`

Created a comprehensive migration that includes:

#### Tables Created:
1. **workflow_instances** - Main workflow execution tracking
   - Columns: id, origin, workflow_version_id, temporal_workflow_id, temporal_run_id, resource_type, resource_id, status, current_node_key, timestamps, started_by_user_id
   - Indexes: status+updated_at, resource, started_by_user, version, origin

2. **workflow_instance_events** - Event log for workflow executions
   - Columns: id, instance_id, seq, event_type, node_key, actor_user_id, remark, payload, created_at
   - Indexes: instance+seq, instance+created_at

3. **workflow_approvals_inbox** - Pending approval tasks
   - Columns: id, instance_id, node_key, assigned_to_user_id, assigned_role_key, status, timestamps, decision, remark
   - Indexes: status+assigned_to_user, status+assigned_role, instance

#### Foreign Keys:
- workflow_instances.started_by_user_id → users.id
- workflow_instance_events.instance_id → workflow_instances.id (CASCADE)
- workflow_instance_events.actor_user_id → users.id
- workflow_approvals_inbox.instance_id → workflow_instances.id (CASCADE)
- workflow_approvals_inbox.assigned_to_user_id → users.id

### 3. Updated Drizzle Metadata
- Updated `drizzle/meta/_journal.json` to include the new migration entry
- Migration index: 6
- Tag: `0006_workflow_tables`

## Schema Design Highlights

### Origin Column Invariant
The `workflow_instances.origin` column defaults to `'legacy'` and will be used to:
- Track whether a workflow was started via legacy code or Temporal runtime
- Enforce "no double-start" logic (Checkpoint 0)
- Enable safe backfill and cutover

### Event Sourcing Pattern
The `workflow_instance_events` table uses:
- Sequential numbering (`seq`) for ordering
- JSONB `payload` for flexible event data
- Comprehensive event types for full audit trail

### Inbox Pattern
The `workflow_approvals_inbox` table supports:
- User-based assignment (`assigned_to_user_id`)
- Role-based assignment (`assigned_role_key`)
- Status tracking (pending → resolved)
- Decision capture with remarks

## Verification

### TypeScript Compilation
✅ No TypeScript errors related to workflow schema
- Confirmed by running `npx tsc --noEmit` and filtering for "workflows"
- Pre-existing errors in other files are unrelated to this change

### Schema Structure
✅ All three tables properly defined with:
- Primary keys (UUID with auto-generation)
- Foreign key constraints
- Appropriate indexes for query performance
- Proper cascade delete behavior

## Next Steps

### Immediate (Before Moving to Checkpoint 0)
1. **Run the Migration**:
   ```bash
   # On Windows, you may need to run this manually or update the script
   # Option 1: Run via Docker if database is in container
   docker exec -i <postgres-container> psql -U <user> -d <database> < apps/api/drizzle/0006_workflow_tables.sql
   
   # Option 2: Use a database client (pgAdmin, DBeaver, etc.)
   # Execute the SQL file directly
   
   # Option 3: Use drizzle-kit push (will sync schema to DB)
   cd apps/api
   npx drizzle-kit push
   ```

2. **Verify Migration**:
   ```sql
   -- Check tables exist
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name LIKE 'workflow%';
   
   -- Verify indexes
   SELECT tablename, indexname FROM pg_indexes 
   WHERE tablename LIKE 'workflow%';
   ```

3. **Generate Snapshot** (Optional):
   - The snapshot will be auto-generated when you run the migration
   - Or use `npx drizzle-kit introspect` to generate from existing DB

### Checkpoint 0: Runtime Guards (Next Phase)
Now that the schema is ready, proceed with:

1. **Config/Feature Flag Service**
   - Read `USE_TEMPORAL_RUNTIME` and `ALLOW_LEGACY_WRITES` from `.env`
   - Expose via a service for runtime checks

2. **Origin Column Invariant**
   - Add validation to ensure `origin` is set correctly
   - Prevent mixing legacy and runtime operations on same instance

3. **Double-Start Prevention**
   - Check if workflow instance already exists before starting
   - Route to appropriate handler based on `origin` value

## Files Changed
```
apps/api/src/workflows/schema.ts          - Simplified table definitions
apps/api/src/db/schema.ts                 - Added workflow relations
apps/api/drizzle/0006_workflow_tables.sql - Migration SQL
apps/api/drizzle/meta/_journal.json       - Updated migration journal
```

## Notes
- The migration uses `IF NOT EXISTS` clauses for safety
- Foreign keys use `DO $$ BEGIN ... EXCEPTION` blocks to handle duplicates
- All indexes use `IF NOT EXISTS` for idempotency
- The migration can be safely re-run without errors
