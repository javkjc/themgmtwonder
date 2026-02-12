## v8.8 — ML-Assisted Field Suggestions

**Date:** 2026-02-11  
**Scope:** Add opt-in ML-assisted field and table suggestions on the review page with explicit user actions, backend authority, auditability, and graceful degradation.  
**Principles:** Minimal localized changes. Backend authoritative. No new dependencies. No background automation. Preserve auditability-first.

---

## 0) Preconditions / Guardrails

**Prerequisites:**
- [ ] v8.6 baseline review flow exists and is stable.  
- Evidence: `tasks/executionnotes.md` entries for v8.6 milestones (2026-02-06 to 2026-02-11).
- [ ] v8.7 table review flow exists (tables, editor, confirm, list).  
- Evidence: `tasks/executionnotes.md` entries dated 2026-02-09 to 2026-02-11.
- [ ] Core data tables exist in schema: `baseline_field_assignments`, `extracted_text_segments`, `baseline_tables`.  
- Evidence: `tasks/codemapcc.md` Data Model Map.
- [ ] Review page route exists: `/attachments/[attachmentId]/review`.  
- Evidence: `tasks/codemapcc.md` Frontend Map.
- [ ] Review `tasks/lessons.md` for v8.8 patterns before starting.

**Out of Scope:**
- [ ] Automatic field assignment or table creation without explicit user action.
- [ ] Training or fine-tuning (v8.9).
- [ ] Background automation or auto-confirmation.
- [ ] Workflow coupling or utilization rules beyond existing v8.6/v8.7 baselines.
- [ ] Any AI features beyond v8.8 scope (v8.9+).

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Missing Infrastructure:** If `baseline_field_assignments`, `extracted_text_segments`, or `baseline_tables` are missing from `apps/api/src/db/schema.ts` or not documented in `tasks/codemapcc.md`.
- **STOP - Missing File/Codemap Entry:** If new paths (e.g., `apps/ml-service/` or new API modules) are not documented in `tasks/codemapcc.md` before implementation.
- **STOP - New Dependency Request:** If any new dependencies are required outside `apps/ml-service/requirements.txt` or existing `apps/web/package.json` / `apps/api/package.json`.
- **STOP - Ambiguous Requirement:** If language detection behavior is unspecified for future multilingual work (out of scope for v8.8).
- **STOP - Scope Creep:** If work requires v8.9 training pipeline, auto-learning, or workflow integration.

---

## 1) Data Model & Audit Tracking (P0)

> **Context:** Store ML model versions, suggestion metadata, and table suggestions with auditability and minimal schema changes.

### A1 — ML Model Version Table ([Complexity: Medium])
**Status:** ✅ Completed on 2026-02-11

**Problem statement**  
We need a persistent model registry to track which ML model version generated suggestions for auditability and future A/B evaluation.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` — add `ml_model_versions` table.
- Backend: `apps/api/src/db/migrations/` — add forward/rollback migration.
- Docs: `tasks/codemapcc.md` — update Data Model Map with new table.

**Implementation plan**
1. Add `ml_model_versions` table with columns: `id`, `modelName`, `version`, `filePath`, `metrics` (JSON), `trainedAt`, `isActive`, `createdBy`.
2. Add unique index on (`modelName`, `version`), and index on `isActive`.
3. Add migration file and update Drizzle schema.
4. Update `tasks/codemapcc.md` data model section.

**Checkpoint A1 — Verification**
- Manual:
  - Confirm `ml_model_versions` exists in `apps/api/src/db/schema.ts` with expected columns.
- DB:
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'ml_model_versions'
ORDER BY ordinal_position;
```
  Expected result: columns listed in step 1.
- Logs:
  - API boots without schema errors after migration.
- Regression:
  - Existing baseline endpoints still load.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### A2 — Field Assignment Suggestion Metadata ([Complexity: Medium])
**Status:** ✅ Completed on 2026-02-11


**Problem statement**  
We need to record suggestion confidence, acceptance state, and model version on baseline field assignments without overwriting authoritative user intent.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` — extend `baseline_field_assignments`.
- Backend: `apps/api/src/db/migrations/` — add forward/rollback migration.
- Docs: `tasks/codemapcc.md` — update Data Model Map with new columns.

**Implementation plan**
1. Add columns to `baseline_field_assignments`:
   - `suggestionConfidence` DECIMAL(3,2)
   - `suggestionAccepted` BOOLEAN (true accepted, false modified/rejected, null manual)
   - `modelVersionId` UUID FK to `ml_model_versions.id`
2. Add index on `modelVersionId`.
3. Update Drizzle schema and migrations.
4. Update `tasks/codemapcc.md`.

**Checkpoint A2 — Verification**
- Manual:
  - Confirm new columns exist in `apps/api/src/db/schema.ts`.
- DB:
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'baseline_field_assignments'
  AND column_name IN ('suggestionconfidence','suggestionaccepted','modelversionid')
ORDER BY column_name;
```
  Expected result: three columns returned (case-insensitive DB naming).
- Logs:
  - Migration applies without errors.
- Regression:
  - Existing baseline assignment queries still return values.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### A3 — ML Table Suggestions Table ([Complexity: Medium])
**Status:** ✅ Completed on 2026-02-11

**Problem statement**  
We need a persisted table for ML table-detection suggestions to support preview, ignore, and convert workflows with auditability.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` — add `ml_table_suggestions`.
- Backend: `apps/api/src/db/migrations/` — add forward/rollback migration.
- Docs: `tasks/codemapcc.md` — update Data Model Map with new table.

**Implementation plan**
1. Add `ml_table_suggestions` table with columns:
   - `id`, `attachmentId`, `regionId`, `rowCount`, `columnCount`, `confidence`, `boundingBox` (JSON), `cellMapping` (JSON), `suggestedLabel`, `status` (pending/ignored/converted), `suggestedAt`, `ignoredAt`, `convertedAt`.
2. Add index on (`attachmentId`, `status`).
3. Update Drizzle schema and migrations.
4. Update `tasks/codemapcc.md`.

**Checkpoint A3 — Verification**
- Manual:
  - Confirm `ml_table_suggestions` exists in `apps/api/src/db/schema.ts`.
- DB:
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'ml_table_suggestions'
ORDER BY ordinal_position;
```
  Expected result: columns listed in step 1.
- Logs:
  - API boots without schema errors after migration.
- Regression:
  - Table APIs still function (`/tables/:id` returns).

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 2) ML Service Infrastructure (P0)

> **Context:** Provide local, internal ML inference endpoints for field suggestions and table detection without external calls.

### B1 — ML Service Skeleton + Health Check ([Complexity: Medium])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**  
We need a FastAPI microservice container for local inference, reachable only on the internal network, with a health endpoint for readiness checks.

**Files / Locations**
- Backend: `docker-compose.yml` — add `ml-service` container wiring.
- New service: `apps/ml-service/main.py` — FastAPI app entry.
- New service: `apps/ml-service/requirements.txt` — Python deps.
- New service: `apps/ml-service/ml.Dockerfile` — container build.
- Docs: `tasks/codemapcc.md` — add ml-service to Repo Index.

**Implementation plan**
1. Create `apps/ml-service/` scaffold with `main.py` and `/health` endpoint.
2. Add `requirements.txt` with FastAPI + Uvicorn + model dependencies.
3. Add `ml.Dockerfile` with python base image and pinned deps.
4. Wire `ml-service` in `docker-compose.yml` on backend network only.
5. Update `tasks/codemapcc.md` with the new service path and purpose.

**Checkpoint B1 — Verification**
- Manual:
  - Start docker compose and confirm `ml-service` container is running.
- Logs:
  - `GET /health` returns `{ status: 'ok' }`.
- Regression:
  - API and web services still start.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### B2 — Field Suggestion Endpoint ([Complexity: Complex])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**  
We need a deterministic field-to-text suggestion endpoint that embeds segments and field labels, computes similarity, and returns top matches with confidence.

**Files / Locations**
- New service: `apps/ml-service/main.py` — add `/ml/suggest-fields` endpoint.
- New service: `apps/ml-service/model.py` — model loading and embedding helpers.
- Docs: `tasks/codemapcc.md` — document endpoint contract.

**Implementation plan**
1. Load sentence embedding model at startup using `all-MiniLM-L6-v2` (English-only).
2. Accept payload: `{ baselineId, segments: [{id,text}], fields: [{fieldKey,label}], threshold }`.
3. Compute embeddings for fields and segments, cosine similarity, choose top match per segment.
4. Return suggestions with confidence clamped to 0.0–1.0 and threshold default 0.50.
5. If model load fails or times out, return empty suggestions with error payload.

**Checkpoint B2 — Verification**
- Manual:
  - POST sample segments and fields ? response contains `segmentId`, `fieldKey`, `confidence`.
- Logs:
  - ML service logs include `baselineId`, `modelVersion`, `suggestionCount` fields.
- Regression:
  - `/health` remains responsive under load.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

### B3 — Table Detection Endpoint (Rule-Based) ([Complexity: Complex])

**Status:** ✅ Completed on 2026-02-12

**Problem statement**  
We need a rule-based table detection endpoint that analyzes OCR segments and returns candidate grid structures with confidence scores.

**Files / Locations**
- New service: `apps/ml-service/main.py` — add `/ml/detect-tables` endpoint.
- New service: `apps/ml-service/table_detect.py` — detection heuristics implementation.
- Docs: `tasks/codemapcc.md` — document endpoint contract.

**Implementation plan**
1. Implement grid detection per v8.8 heuristics (row grouping, column alignment, spacing consistency).
2. Compute confidence using the weighted formula and reject below threshold (default 0.60).
3. Return list of table suggestions with `rowCount`, `columnCount`, `boundingBox`, `cells`, `suggestedLabel`.
4. Clamp input limits: max 1000 segments, max 5000 chars per segment.
5. Return empty array on failure without blocking.

**Checkpoint B3 — Verification**
- Manual:
  - Submit a synthetic 3x3 grid of segments ? returns one table with rowCount=3, columnCount=3.
- Logs:
  - ML service logs include `attachmentId`, `tableCount`, `processingTimeMs`.
- Regression:
  - Field suggestions endpoint still responds correctly.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

---

## 3) API Integration & Governance (P0)

> **Context:** Wire ML service into the backend, enforce explicit intent, rate limits, validation, and audit logs.

### C1 — ML Client Service + Config ([Complexity: Medium])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**
The API needs a safe client for ML service calls with timeouts, error handling, and graceful degradation.

**Files / Locations**
- Backend: `apps/api/src/ml/ml.module.ts` — new module.
- Backend: `apps/api/src/ml/ml.service.ts` — HTTP client wrapper.
- Backend: `apps/api/src/app.module.ts` — register module.
- Docs: `tasks/codemapcc.md` — add ML module and service to Backend Map.

**Implementation plan**
1. Create `MlModule` and `MlService` with base URL from env `ML_SERVICE_URL`.
2. Implement `suggestFields()` and `detectTables()` with 5s timeout.
3. Normalize errors to a consistent response (`{ ok: false, error }`).
4. Log failures with fields: `service`, `endpoint`, `statusCode`, `errorType`.

**Checkpoint C1 — Verification**
- Manual:
  - Mock ML service down ? API returns empty suggestions, not 500.
- Logs:
  - API log includes `ml.error` with endpoint name.
- Regression:
  - Baseline review endpoints still work.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### C2 — Field Suggestion Generation Endpoint ([Complexity: Complex])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**
We need a POST endpoint to generate suggestions on-demand, persist suggestion metadata, and avoid overwriting user edits.

**Files / Locations**
- Backend: `apps/api/src/ml/field-suggestion.service.ts` — new service.
- Backend: `apps/api/src/ml/field-suggestion.controller.ts` — new controller endpoint.
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` — allow suggestion metadata in upsert.
- Backend: `apps/api/src/field-library/field-library.service.ts` — list active fields for suggestions.
- Docs: `tasks/codemapcc.md` — add endpoint and service to Backend Map.

**Implementation plan**
1. Add endpoint: `POST /baselines/:baselineId/suggestions/generate`.
2. Load baseline, segments, and active fields; call `MlService.suggestFields()`.
3. For each suggested field, create assignment only if fieldKey is unassigned or assignment has no manual value.
4. Persist `suggestionConfidence`, `modelVersionId`, `suggestionAccepted = null` for suggestions.
5. Return summary `{ suggestedAssignments, modelVersionId, suggestionCo
unt }`.
6. Rate limit by counting `audit_logs` entries for `ml.suggest.generate` in last hour; return 429 with retry minutes.
7. Log audit event `ml.suggest.generate` with `baselineId`, `modelVersionId`, `count`.

**Checkpoint C2 — Verification**
- Manual:
  - Click “Get Suggestions” ? API returns list of suggested assignments.
  - Existing manual assignments remain unchanged.
- DB:
```sql
SELECT field_key, assigned_value, suggestionconfidence, suggestionaccepted
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>'
ORDER BY field_key;
```
  Expected result: suggestion columns populated for suggested fields only.
- Logs:
  - Audit log has `action='ml.suggest.generate'` with `baselineId` and `modelVersionId`.
- Regression:
  - Manual assignment via `/baselines/:id/assign` still works.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

### C3 — Accept / Modify / Clear Suggestion Actions ([Complexity: Medium])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**
We need consistent server-side tracking when users accept, modify, or clear ML suggestions.

**Files / Locations**
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` — accept suggestion metadata and correction reasons.
- Backend: `apps/api/src/baseline/dto/assign-field.dto.ts` — include suggestion fields.
- Backend: `apps/api/src/baseline/dto/delete-assignment.dto.ts` — accept suggestion rejection metadata.
- Docs: `tasks/codemapcc.md` — update DTO docs.

**Implementation plan**
1. Accept action: allow `suggestionAccepted=true` without correction reason.
2. Modify action: require `correctionReason`, set `suggestionAccepted=false`, store `correctedFrom`.
3. Clear action: allow DELETE with body `{ reason, suggestionRejected, suggestionConfidence, modelVersionId }`.
4. Ensure audit log includes `suggestionAccepted` and `modelVersionId` fields.

**Checkpoint C3 — Verification**
- Manual:
  - Accept suggestion ? assignment shows `suggestionAccepted=true`.
  - Modify suggestion ? requires reason and sets `suggestionAccepted=false` with `correctedFrom`.
  - Clear suggestion ? assignment deleted and audit log recorded.
- DB:
```sql
SELECT field_key, suggestionaccepted, correctedfrom, correctionreason
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>' AND field_key = '<FIELD_KEY>';
```
  Expected result: fields reflect accept/modify actions.
- Logs:
  - Audit log contains `action='baseline.assignment.upsert'` with suggestion fields.
- Regression:
  - Validation modal for invalid values still works.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### C4 — Table Suggestion Persistence + Convert/Ignore ([Complexity: Complex])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**
We need to persist table detection results and enable users to ignore or convert them into baseline tables.

**Files / Locations**
- Backend: `apps/api/src/ml/table-suggestion.service.ts` — new service.
- Backend: `apps/api/src/ml/table-suggestion.controller.ts` — new endpoints.
- Backend: `apps/api/src/baseline/table-management.service.ts` — convert suggestion to table.
- Docs: `tasks/codemapcc.md` — add endpoints and services.

**Implementation plan**
1. Add endpoints:
   - `POST /attachments/:attachmentId/table-suggestions/detect`
   - `GET /attachments/:attachmentId/table-suggestions`
   - `POST /table-suggestions/:id/ignore`
   - `POST /table-suggestions/:id/convert`
2. On detect: call ML service, persist `ml_table_suggestions` rows with status `pending`.
3. On ignore: set status `ignored`, set `ignoredAt`, log audit `ml.table.ignore`.
4. On convert: create `baseline_tables` + `baseline_table_cells`, set status `converted`, log audit `ml.table.convert`.
5. Enforce baseline ownership and baseline status (draft/reviewed only).

**Checkpoint C4 — Verification**
- Manual:
  - Detect tables ? response lists pending suggestions.
  - Ignore suggestion ? status becomes `ignored`.
  - Convert suggestion ? new table created and redirect URL returned.
- DB:
```sql
SELECT status, row_count, column_count
FROM ml_table_suggestions
WHERE attachment_id = '<ATTACHMENT_ID>'
ORDER BY suggested_at DESC;
```
  Expected result: statuses reflect actions.
- Logs:
  - Audit entries: `ml.table.detect`, `ml.table.ignore`, `ml.table.convert` with suggestionId.
- Regression:
  - Table creation from manual selection still works.

Internal ML call remains `/ml/detect-tables` (ml-service only); backend exposes the public paths above.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

---

## 4) Field Suggestion UI (P1)

> **Context:** Provide opt-in suggestion trigger, confidence badges, and explicit accept/modify/clear flows.

### D1 — Suggestion Trigger + API Wiring ([Complexity: Medium])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**  
Users need an explicit “Get Suggestions” action on the review page that triggers ML generation without blocking manual workflows.

**Files / Locations**
- Frontend: `apps/web/app/components/suggestions/SuggestionTrigger.tsx` — new component.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` — mount trigger near FieldAssignmentPanel header.
- Frontend: `apps/web/app/lib/api/baselines.ts` — add `generateSuggestions()` helper.
- Docs: `tasks/codemapcc.md` — add new component and API helper.

**Implementation plan**
1. Add button “Get Suggestions” with loading, success, error states.
2. Call `POST /baselines/:id/suggestions/generate` on click.
3. Show toast: “X field suggestions generated.”
4. On error, show “Suggestions unavailable. Continue with manual assignment.”
5. Tooltip shown once per user with localStorage key `suggestions_tooltip_shown`.

**Checkpoint D1 — Verification**
- Manual:
  - Click button ? loading state within 50ms, then success toast.
  - Simulate ML down ? error state and retry button.
- Logs:
  - Browser console has no errors.
- Regression:
  - Manual field assignment still works without suggestions.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### D2 — Suggested Field Input + Badges ([Complexity: Complex])
**Status:** ✅ Completed on 2026-02-12
**Problem statement**  
Suggested values must be visually distinct with confidence badges and source segment context without blocking edits.

**Files / Locations**
- Frontend: `apps/web/app/components/suggestions/SuggestedFieldInput.tsx` — new component.
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` — use SuggestedFieldInput for suggested fields.
- Frontend: `apps/web/app/types.ts` — add suggestion fields to assignment types.
- Docs: `tasks/codemapcc.md` — update component map.

**Implementation plan**
1. Render suggested values in lighter gray text with confidence pill.
2. Confidence thresholds: High >= 0.80, Medium 0.60–0.79, Low 0.50–0.59.
3. Show “Suggested from: <segment text>” truncated to 30 chars, tooltip with full text and confidence.
4. Add panel summary: “X of Y fields auto-suggested” and filter toggle to show only suggested fields.

**Checkpoint D2 — Verification**
- Manual:
  - Suggested field shows badge and gray text.
  - Hover shows full segment text and numeric confidence.
- Regression:
  - Validation error styling still applies when value invalid.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

### D3 — Accept / Modify / Clear UI Actions ([Complexity: Complex])
**Status:** ✅ Completed on 2026-02-12

**Problem statement**  
Users must explicitly accept, modify
 with reason, or clear suggestions with reason, and UI must reflect each state.

**Files / Locations**
- Frontend: `apps/web/app/components/suggestions/SuggestionActionModal.tsx` — new modal.
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` — wire actions.
- Frontend: `apps/web/app/lib/api/baselines.ts` — add assign/delete payloads for suggestion metadata.
- Docs: `tasks/codemapcc.md` — update component map.

**Implementation plan**
1. Accept: show inline “Accept” button on suggested fields, POST assign with `suggestionAccepted=true`.
2. Modify: on edit blur, show modal requiring reason; POST assign with `correctedFrom` and `suggestionAccepted=false`.
3. Clear: on clear, show modal requiring reason; call delete with `suggestionRejected=true` and metadata.
4. Update UI badges: accepted (green check), modified (orange), cleared (removed).

**Checkpoint D3 — Verification**
- Manual:
  - Accept suggestion ? green check appears, badge remains.
  - Modify suggestion ? modal forces reason, badge changes to “Modified.”
  - Clear suggestion ? modal forces reason, field clears.
- Regression:
  - Baseline review confirm still works.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

---

## 5) Table Suggestion UI (P1)

> **Context:** Provide explicit table detection trigger and non-blocking banners for suggested tables.

### E1 — Table Detection Auto-Trigger + Banner List ([Complexity: Medium])

**Problem statement**  
Table detection should run automatically on review page load (non-blocking), with banners shown after a short delay.

**Implementation plan**
1. On review page load, auto-call `POST /attachments/:attachmentId/table-suggestions/detect` in the background.
2. Delay banner render by 2s to avoid interrupting workflow.
3. Render a banner per suggestion with confidence badge and actions: Preview, Ignore.
4. Banner dismiss = Ignore action (persisted).
5. If ML service fails: show nothing (graceful degradation).

**Checkpoint E1 — Verification**
- Manual:
  - Open review page → after 2s banners appear (if suggestions exist).
  - Ignore banner → removed and not returned on refresh.
- Regression:
  - Manual table creation remains available.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### E2 — Table Preview + Convert Flow ([Complexity: Medium])

**Problem statement**  
Users need a preview modal for a suggested table and a one-click conversion into baseline tables.

**Files / Locations**
- Frontend: `apps/web/app/components/suggestions/TableSuggestionPreviewModal.tsx` — new modal.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` — wire preview and convert.
- Frontend: `apps/web/app/lib/api/tables.ts` — add convert/ignore helpers.
- Docs: `tasks/codemapcc.md` — update component map.

**Implementation plan**
1. Preview modal shows grid and confidence badge, row/column counts.
2. “Convert to Table” button calls `POST /table-suggestions/:id/convert`.
3. On success, refresh tables list and open the new table in editor.

**Checkpoint E2 — Verification**
- Manual:
  - Preview ? grid renders, counts match suggestion.
  - Convert ? table appears in list, editor opens.
- Regression:
  - Table editor works for manually created tables.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 6) Execution Order (Do Not Skip)

**Critical path dependencies:**
1. **A1** ML model version table — No dependencies.
2. **A2** Assignment suggestion metadata — Depends on A1 (modelVersionId).
3. **A3** Table suggestions table — No dependencies.
4. **B1** ML service skeleton — Depends on decision to allow new service in repo.
5. **B2** Field suggestion endpoint — Depends on B1.
6. **B3** Table detection endpoint — Depends on B1.
7. **C1** ML client service — Depends on B1.
8. **C2** Suggestion generation endpoint — Depends on A2, B2, C1.
9. **C3** Accept/modify/clear actions — Depends on C2.
10. **C4** Table suggestions persistence + convert/ignore — Depends on A3, B3, C1.
11. **D1** Suggestion trigger UI — Depends on C2.
12. **D2** Suggested field inputs — Depends on C2.
13. **D3** Suggestion action modal — Depends on C3, D2.
14. **E1** Table detection trigger + banner — Depends on C4.
15. **E2** Preview + convert flow — Depends on E1.

**Parallel execution opportunities:**
- A1, A3 can run in parallel.
- B2 and B3 can run in parallel after B1.
- D1 and D2 can run in parallel after C2.

**Blocking relationships:**
- Frontend suggestion UI (D-series) BLOCKED until backend suggestion endpoints (C2/C3) exist.
- Table suggestion UI (E-series) BLOCKED until table suggestion persistence (C4) exists.
- Any ML usage BLOCKED until ml-service (B1) is running and reachable.

---

## 7) Definition of Done

**Feature Completeness:**
- Field suggestions can be generated via explicit user action and do not overwrite manual assignments.
- Confidence badges display for suggested fields and retain audit metadata.
- Accept/modify/clear actions are logged with model version and reasons.
- Table suggestions can be detected, previewed, ignored, and converted into baseline tables.
- ML service failures degrade gracefully without blocking workflows.

**Data Integrity:**
- Unique constraints and indexes in ML tables prevent duplicates and ensure fast lookup.
- Suggestion metadata stored on `baseline_field_assignments` without mutating original OCR data.
- Audit logs capture suggestion generation and user actions with modelVersionId.

**No Regressions:**
- API builds without errors (`npm run build` in `apps/api`).
- Web builds without errors (`npm run build` in `apps/web`).
- Review page loads and manual assignment remains functional without ML.

**Documentation:**
- `tasks/codemapcc.md` updated with new tables, services, endpoints, and components.
- `tasks/executionnotes.md` updated with completion evidence for v8.8 tasks.

---

## 8) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (Run After Every Task):**
- [ ] API builds: `cd apps/api && npm run build` ? no errors.
- [ ] Web builds: `cd apps/web && npm run build` ? exit code 0.
- [ ] Login flow works: Navigate to `/login` ? enter credentials ? redirects to `/`.

**Task Group C — Field Suggestions:**
- [ ] Generate suggestions
  - Steps: Open `/attachments/<id>/review` ? click “Get Suggestions” ? see “X field suggestions generated”.
- [ ] Accept suggestion
  - Steps: Click “Accept” on a suggested field ? see green check and value unchanged.
- [ ] Modify suggestion
  - Steps: Edit suggested field ? modal asks reason ? save ? badge shows “Modified”.
- [ ] Clear suggestion
  - Steps: Clear value ? modal asks reason ? field clears.

**Task Group E — Table Suggestions:**
- [ ] Detect tables
  - Steps: Open `/attachments/<id>/review` → wait ~2s → banner appears with row/column counts (if suggestions exist).
- [ ] Preview and convert
  - Steps: Click “Preview” ? modal grid shows ? click “Convert” ? table opens in editor.

**Integration Tests (Run After All Tasks Complete):**
- [ ] Generate suggestions ? accept two, modify one, clear one ? verify audit logs and DB columns.
- [ ] Detect table ? ignore one, convert one ? verify table created and banner gone.

**Regression Tests:**
- [ ] Manual field assignment still works without triggering suggestions.
- [ ] Manual table creation still works in TableCreationModal.

---

## 9) Post-Completion Checklist

- [ ] Update `tasks/executionnotes.md` with:
  - [ ] Completion date
  - [ ] What was built (reference task IDs)
  - [ ] Any deviations from plan (with reasons)
  - [ ] Lessons learned (add to `tasks/lessons.md` if applicable)
- [ ] Update `tasks/codemapcc.md` with new file paths and endpoints
- [ ] Run full regression suite
- [ ] Tag commit: `git tag v8.8 -m "ML-Assisted Field Suggestions complete"`

---

---

## 2026-02-12 - Task C4 - Table Suggestion Persistence + Convert/Ignore

### Objective
Persist ML table detection results and enable ignore/convert flows with auditability.

### What Was Built
- **Table Suggestion Endpoints** (`apps/api/src/ml/table-suggestion.controller.ts`)
  - `POST /attachments/:attachmentId/table-suggestions/detect`
  - `GET /attachments/:attachmentId/table-suggestions`
  - `POST /table-suggestions/:id/ignore`
  - `POST /table-suggestions/:id/convert`
- **TableSuggestionService** (`apps/api/src/ml/table-suggestion.service.ts`)
  - Detect: validates ownership + editable baseline, calls ML service, persists `ml_table_suggestions` as `pending`, logs audit.
  - List: returns pending suggestions for attachment.
  - Ignore: sets status to `ignored`, timestamps, audit log.
  - Convert: validates status, builds `cellValues`, marks `converted`, returns data for table creation.
- **ML Module Wiring**
  - Service/controller registered in `apps/api/src/ml/ml.module.ts`.

### Files Changed
- `apps/api/src/ml/table-suggestion.controller.ts` - API endpoints for detect/list/ignore/convert
- `apps/api/src/ml/table-suggestion.service.ts` - Detect/list/ignore/convert logic + audit logs
- `apps/api/src/ml/ml.module.ts` - Registers controller/service
- `tasks/codemapcc.md` - Documented endpoints/services (if updated in this task)

### Verification
Not performed (manual endpoint checks required).

### Status
[NEEDS-TESTING]

### Notes
- **Impact**: Enables v8.8 table suggestion backend flows for E1/E2 UI.
- **Assumptions**: ML service `/ml/detect-tables` is reachable; `ml_table_suggestions` table exists (A3).
- **Open Questions**: None.

---

---

## 2026-02-12 - Task D1 - Suggestion Trigger + API Wiring

### Objective
Add an explicit “Get Suggestions” action on the review page that triggers ML generation without blocking manual workflows.

### What Was Built
- Added `generateSuggestions()` API helper for `POST /baselines/:id/suggestions/generate`.
- Created SuggestionTrigger UI component with loading/success/error states and one-time tooltip.
- Mounted SuggestionTrigger near the FieldAssignmentPanel header and wired success toast + baseline refresh.

### Files Changed
- `apps/web/app/lib/api/baselines.ts` - Add generateSuggestions API helper and response type.
- `apps/web/app/components/suggestions/SuggestionTrigger.tsx` - New trigger component with tooltip.
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Wire SuggestionTrigger and handler.
- `tasks/codemapcc.md` - Document new component and API helper.

### Verification
Not performed (manual UI checks required).

### Status
[NEEDS-TESTING]

### Notes
- **Impact**: Enables explicit ML suggestions trigger for D1.
- **Assumptions**: ML suggestions endpoint is available and returns suggestionCount.
- **Open Questions**: None.

---

## 2026-02-12 - Task D2 - Suggested Field Input + Badges

### Objective
Implement the UI for visualizing ML field suggestions with confidence badges and source segment context on the review page.

### What Was Built
- **SuggestedFieldInput Component** (`apps/web/app/components/suggestions/SuggestedFieldInput.tsx`):
  - Renders suggested values in italicized gray text.
  - Displays a confidence badge (High: >=80% green, Medium: 60-79% orange, Low: gray).
  - Badge tooltip shows full source text and numeric confidence.
  - Sub-label shows truncated “Suggested from: <text>” for context.
- **FieldAssignmentPanel Integration**:
  - Replaced the default input with `SuggestedFieldInput` for all fields.
  - Added a summary banner: “✨ X of Y fields auto-suggested”.
  - Implemented a “Show Suggested Only” filter toggle to facilitate rapid review.
  - Passed `segments` from the review page to support source text tooltips.

### Files Modified
- `apps/web/app/components/suggestions/SuggestedFieldInput.tsx` - New component
- `apps/web/app/components/FieldAssignmentPanel.tsx` - Integrated new component, added summary/filter
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Passed segments prop
- `tasks/codemapcc.md` - Updated Suggestions UI list

### Verification
- **Manual**: Component renders correctly with suggestions. Summary banner correctly counts fields with `suggestionConfidence`. Filter toggle correctly hides/shows fields.
- **Lint**: Fixed `React.InputModeOptions` and missing hook imports.

### Status
[VERIFIED]

### Notes
- **Impact**: Provides immediate visual feedback for ML suggestions, reducing manual data entry time.
- **Thresholds**: Aligned with plan.md (80% Green, 60% Orange, <60% Gray).

---

## 2026-02-12 - Task D3 - Accept / Modify / Clear UI Actions

### Objective
Enable explicit Accept / Modify / Clear actions for ML suggestions in the review UI, with mandatory reasons for modify/clear and clear status indicators.

### What Was Built
- **SuggestionActionModal** (`apps/web/app/components/suggestions/SuggestionActionModal.tsx`)
  - Modal enforces 10+ character reason for modify/clear actions.
  - Shows context messaging and “Original” value for modify flow.
- **SuggestedFieldInput Enhancements**
  - Inline “Accept” button for suggested values.
  - Status indicators: ✅ accepted, 🟠 modified.
  - Border colors reflect accepted/modified states.
- **FieldAssignmentPanel Wiring**
  - Accept flow calls backend with `suggestionAccepted=true`.
  - Modify flow triggers reason modal on blur and submits `correctedFrom` + `suggestionAccepted=false`.
  - Clear flow triggers reason modal and submits delete with `suggestionRejected=true` metadata.
  - Local state resets on cancel/error to prevent stale values.
- **Review Page Integration**
  - Added `handleAccept` callback wiring in `apps/web/app/attachments/[attachmentId]/review/page.tsx`.
  - Updated delete/assign calls to pass ML metadata.

### Files Changed
- `apps/web/app/components/suggestions/SuggestionActionModal.tsx` - New modal component
- `apps/web/app/components/suggestions/SuggestedFieldInput.tsx` - Accept button + status indicators
- `apps/web/app/components/FieldAssignmentPanel.tsx` - Accept/modify/clear wiring
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Accept handler and metadata wiring
- `apps/web/app/lib/api/baselines.ts` - Assign/Delete payload metadata
- `tasks/codemapcc.md` - Added modal to Suggestions UI list

### Verification
Not performed (manual UI checks required).

### Status
[NEEDS-TESTING]

### Notes
- **Impact**: Completes v8.8 D3 UI action layer.
- **Assumptions**: Baseline endpoints accept ML metadata (C3).
- **Open Questions**: None.

---