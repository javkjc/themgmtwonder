# Quick Start: Running the Workflow Tables Migration

## Prerequisites
- PostgreSQL database is running
- Database connection string is configured in `.env`

## Option 1: Using Docker (Recommended if DB is in container)

```powershell
# Find your postgres container name
docker ps | Select-String postgres

# Run the migration
Get-Content apps\api\drizzle\0006_workflow_tables.sql | docker exec -i <container-name> psql -U <username> -d <database>
```

## Option 2: Using psql directly

```powershell
# If you have psql installed locally
psql -h localhost -U <username> -d <database> -f apps\api\drizzle\0006_workflow_tables.sql
```

## Option 3: Using Drizzle Kit Push

```powershell
cd apps\api
npx drizzle-kit push
```

This will:
- Compare your schema with the database
- Show you the changes
- Ask for confirmation
- Apply the changes directly

## Option 4: Using a GUI Client

1. Open pgAdmin, DBeaver, or your preferred PostgreSQL client
2. Connect to your database
3. Open the SQL file: `apps\api\drizzle\0006_workflow_tables.sql`
4. Execute the script

## Verification

After running the migration, verify it worked:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'workflow%'
ORDER BY table_name;

-- Expected output:
-- workflow_approvals_inbox
-- workflow_instance_events
-- workflow_instances

-- Check row counts (should be 0 for new tables)
SELECT 
    'workflow_instances' as table_name, COUNT(*) as row_count FROM workflow_instances
UNION ALL
SELECT 
    'workflow_instance_events', COUNT(*) FROM workflow_instance_events
UNION ALL
SELECT 
    'workflow_approvals_inbox', COUNT(*) FROM workflow_approvals_inbox;

-- Check indexes
SELECT 
    tablename, 
    indexname 
FROM pg_indexes 
WHERE tablename LIKE 'workflow%'
ORDER BY tablename, indexname;
```

## Troubleshooting

### Error: "relation already exists"
The migration is idempotent - it uses `IF NOT EXISTS` clauses. You can safely re-run it.

### Error: "database connection failed"
Check your `.env` file and ensure `DATABASE_URL` is correct:
```
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

### Error: "permission denied"
Ensure your database user has CREATE TABLE permissions:
```sql
GRANT CREATE ON SCHEMA public TO your_username;
```

## Next Steps

Once the migration is successful, you can proceed to **Checkpoint 0: Runtime Guards**.
