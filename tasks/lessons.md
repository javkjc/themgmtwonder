# Lessons Learned
*AI assistants should review this file at session start*

## Purpose
This file captures patterns that caused issues and rules to prevent repeating mistakes. It is updated immediately after any user correction during execution sessions.

## Patterns That Caused Issues

*No patterns captured yet. This file grows through use.*

*After any correction from the user, the AI assistant must append a new pattern entry below with the date, problem, root cause, and rule.*

---

## Rules for AI Assistants

*Rules will be extracted here as patterns accumulate.*

*Example format:*
- Always verify table exists in tasks/codemapcc.md before writing migration
- Never prepend entries to tasks/executionnotes.md — append only (bottom of file)
- Check tasks/prompt_guidelines.md stop conditions before continuing past task boundary

---

## Review Log
- Last reviewed: 2026-02-05
- Sessions since last review: 0
- Total patterns captured: 0

---

**Note**: This file starts empty and grows through use. After any correction from the user, the AI assistant must append a new pattern entry with the date, problem, root cause, and rule.

### Entry Format

```markdown
### [Date] - [Pattern Name]
- **Problem**: What went wrong
- **Root Cause**: Why it happened
- **Rule**: What to do instead
- **Related Feature**: [Link to tasks/features.md if applicable]
```

### 2026-02-12 - Verified Without Full Checkpoint
- **Problem**: Marked C1 as verified while the ML service-down graceful-degradation test was deferred.
- **Root Cause**: Verification status updated before all checkpoint steps were complete.
- **Rule**: Only mark tasks verified when every checkpoint item is executed; otherwise set status to [UNVERIFIED] and document the missing test.
- **Related Feature**: v8.8 ML-Assisted Field Suggestions

### 2026-02-13 - Table Detection Lessons (E1 Revised)
- **Problem**: Table detection initially failed due to tolerance/validation assumptions and duplicated OCR segments.
- **Root Cause**: Assumed pixel-based coordinates for normalized data and strict grid validation; passed duplicate OCR segments to ML.
- **Rule**: Validate coordinate scale before tuning tolerances, keep grid validation flexible for form-like layouts, and deduplicate OCR segments before ML processing.
- **Related Feature**: v8.8 ML-Assisted Field Suggestions

### 2026-02-23 - Windows Migration Commands
- **Problem**: `npm run drizzle:generate` → `spawn EPERM`; `npm run drizzle:migrate` → `SKIP_BOOTSTRAP not recognized`.
- **Root Cause**: `drizzle:generate` hits a Windows file-lock on build output; `drizzle:migrate` uses Unix env-var prefix syntax (`SKIP_BOOTSTRAP=true`) which cmd/PowerShell does not support.
- **Rule**: Always run Drizzle commands inside the container: `docker compose exec api npx drizzle-kit generate` and `docker compose exec api npx drizzle-kit migrate`. If migrate still fails due to journal/DB hash mismatch, apply SQL directly via `docker compose exec db psql -U todo -d todo_db -c "..."` and register the migration hash manually into `drizzle.__drizzle_migrations`.
- **Related Feature**: v8.9 D3 — Global Volume Trigger

### 2026-02-23 - Drizzle Journal/DB Hash Mismatch
- **Problem**: `drizzle:migrate` tried to replay all migrations from idx 0 (including `CREATE TYPE baseline_status`) even though the DB already had those objects, because local journal hashes didn't match the 9 rows in `drizzle.__drizzle_migrations`.
- **Root Cause**: The local journal was regenerated at some point, producing new snapshot UUIDs/hashes that differ from the SHA-256 hashes Drizzle recorded when migrations were originally applied.
- **Rule**: Before running any migration, check `SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3` to confirm the DB's hash scheme matches the local journal. If mismatched: apply new migration SQL directly via psql, compute its hash with `node -e "require('crypto').createHash('sha256').update(require('fs').readFileSync('/app/drizzle/<file>.sql','utf8')).digest('hex')"` inside the container, then insert that hash into `drizzle.__drizzle_migrations` manually.
- **Related Feature**: v8.9 D3 — Global Volume Trigger
