
# v8.6 - Field-Based Extraction Assignment & Baseline

**Date:** 2026-02-05  
**Scope:** Complete remaining v8.6 milestones (8.6.7-8.6.28) to enable field-based baseline assignments on the attachment review page with explicit, auditable user actions and no change to OCR authority.  
**Principles:** Minimal localized changes. Backend authoritative. No new dependencies. No background automation. Preserve auditability-first.

---

## 0) Preconditions / Guardrails

**Prerequisites:**
- [ ] v8.1 OCR confirmation flow exists and review page is active at `/attachments/[attachmentId]/review`. Evidence: `tasks/executionnotes.md` entry "v8 Task 5: OCR Evidence Review UI" and "Task D1: Verify OCR state machine UI (v8.1)".
- [ ] v8.5 Field Builder infrastructure is complete. Evidence: `tasks/executionnotes.md` entry "Milestone 8.5 Verification & Closure".
- [ ] v8.6.1-8.6.6 are complete (Field Library CRUD/UI, Baseline Data Model, Baseline State Machine, Baseline Confirmation UI). Evidence: `tasks/executionnotes.md` entries "8.6.2", "8.6.3", "8.6.4", "8.6.5", "8.6.6".
- [ ] `extracted_text_segments` is present in `apps/api/src/db/schema.ts` and documented in `tasks/codemapcc.md` data model section.
- [ ] Review `tasks/lessons.md` for v8.6 patterns before starting.

**Out of Scope:**
- [ ] v8.7 training pipeline, v8.8 multi-language OCR, v8.9 batch processing, v9+ workflow runtime.
- [ ] Table/line-item extraction, implicit assignment, auto-confirm, auto-utilization, background jobs.
- [ ] New dependencies without explicit approval.

**Note on v8.6.add1 Overlap:**
During v8.6 implementation, some features were completed early as part of v8.6.add1 (OCR Queue Management Extension). The following tasks from this plan were completed/enhanced in v8.6.add1:
- **C3** (Correction Reason Requirement) - Enhanced with draft/reviewed differentiation
- **D1** (Reviewed State UI) - Enhanced with OCR completion lifecycle reset
- **D3** (Task Detail Status) - Enhanced with queue state badges (Queued/In Progress/Reviewed)
See `features.md` v8.6.add1 section for full implementation details. These features are marked as ✅ Completed in this plan.

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Missing Infrastructure:** If `extracted_text_segments` table is not in `apps/api/src/db/schema.ts` and no migration exists to create it.
- **STOP - Missing File/Codemap Entry:** If required files or tables are not listed in `tasks/codemapcc.md` and cannot be verified.
- **STOP - New Dependency Request:** If ML suggestions require new Python/Node packages beyond current `apps/ocr-worker/requirements.txt` or `apps/api/package.json`.
- **STOP - Ambiguous Requirement:** If validation rules for `currency` or `date` are unclear for specific formats (e.g., ISO vs locale).
- **STOP - Scope Creep:** If work requires v8.7+ (training pipeline), v8.8+ (language detection), or v8.9+ (batch workflows).

---

## 1) Backend Data & Validation - Core (P0)

> **Context:** Establish authoritative storage and validation for baseline field assignments before UI work.

### A1 - Verify Extracted Text Segments Storage ✅ ([Complexity: Simple])
Status: Completed
**Problem statement**  
The extracted text pool is required for assignment UI but must exist and be documented before wiring endpoints.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` - verify `extracted_text_segments` table definition.
- Docs: `tasks/codemapcc.md` - add `extracted_text_segments` to Data Model Map if missing.

**Implementation plan**
1. Confirm `extracted_text_segments` exists in schema and includes attachment linkage.
2. If missing from codemap, add to `tasks/codemapcc.md` with columns and indexes.
3. If missing in schema, STOP and request direction before creating a new table.

**Checkpoint A1 - Verification**
- Manual: Confirm table exists in schema or STOP with missing table details.
- DB:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'extracted_text_segments'
ORDER BY ordinal_position;
```
Expected result: rows returned with attachment linkage columns.
- Logs: None (read-only verification).
- Regression: No schema changes performed unless explicitly approved.

**Estimated effort:** 1 hour  
**Complexity flag:** Simple = GPT-4o-mini OK

### A2 - Baseline Field Assignment Data Model (8.6.9) ✅ ([Complexity: Medium]) 
Status: Completed

**Problem statement**  
Store one assigned value per field per baseline, with correction metadata and auditability.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` - add `baseline_field_assignments` table definition.
- Backend: `apps/api/src/db/migrations/` - add forward and rollback migrations.
- Docs: `tasks/codemapcc.md` - update Data Model Map with new table and indexes.

**Implementation plan**
1. Add columns: `id`, `baselineId`, `fieldKey`, `assignedValue`, `sourceSegmentId`, `assignedBy`, `assignedAt`, `correctedFrom`, `correctionReason`.
2. Add unique constraint `(baselineId, fieldKey)` and indexes on `baselineId`, `fieldKey`, `sourceSegmentId`.
3. Add migration files and update drizzle metadata if required by current workflow.
4. Update `tasks/codemapcc.md` with the final table definition.

**Checkpoint A2 - Verification**
- Manual: Migration applies cleanly in dev.
- DB:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'baseline_field_assignments'
ORDER BY indexname;
```
Expected result: unique index on `(baseline_id, field_key)` plus baseline and field indexes.
- Logs: API boots without schema errors after migration.
- Regression: Existing baseline operations still function.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### A3 - Field Assignment Validation Service (8.6.10) ✅ ([Complexity: Medium])
Status: Completed
**Problem statement**
Validate assigned values against `field_library.character_type` and `character_limit` without auto-mutation.

**Files / Locations**
- Backend: `apps/api/src/baseline/field-assignment-validator.service.ts` - new validation service.
- Backend: `apps/api/src/field-library/field-library.service.ts` - read field type/limits.

**Implementation plan**
1. Implement `validate(fieldKey, value)` for varchar/int/decimal/date/currency.
2. Return `{ valid, error, suggestedCorrection }` but do not change values.
3. Add unit tests if test harness exists for baseline module.
4. Update `tasks/codemapcc.md` to include the new service.

**Field Type Validation Rules**
- **varchar**: String length validation against character_limit
- **int**: Integer format (no commas, no decimals)
- **decimal**: Numeric with decimals, allows normalization of $, commas
- **date**: ISO 8601 format (YYYY-MM-DD)
- **currency**: ISO 4217 currency codes (exactly 3 uppercase letters: USD, EUR, GBP, JPY). Note: Monetary amounts use decimal field type.

**Checkpoint A3 - Verification**
- Manual: `validate('total_amount', '$1,234.50')` returns valid and suggested correction `1234.50` if normalization is expected.
- Manual: `validate('currency_code', 'usd')` returns invalid with suggested correction `USD`.
- DB: No changes.
- Logs: Validation errors appear in API response with `error` and `suggestedCorrection` fields.
- Regression: Field Library CRUD remains unaffected.

**Estimated effort:** 2 hours
**Complexity flag:** Medium = GPT-4o preferred

### A4 - Assignment API + Audit (8.6.11) ✅ ([Complexity: Complex])

Status: ✅ Verified (manual run on 2026-02-06 for `total_amount` assignment/correction)

**Problem statement**  
Provide assignment CRUD endpoints with correction reasons, baseline ownership checks, and audit trails.

**Files / Locations**
- Backend: `apps/api/src/baseline/baseline.controller.ts` - add assignment routes.
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` - new service for CRUD.
- Backend: `apps/api/src/baseline/dto/assign-baseline-field.dto.ts` - request validation.
- Backend: `apps/api/src/audit/audit.service.ts` - log assignment actions.
- Docs: `tasks/codemapcc.md` - update backend map with endpoints and DTOs.

**Implementation plan**
1. Add routes: `POST /baselines/:baselineId/assign`, `DELETE /baselines/:baselineId/assign/:fieldKey`, `GET /baselines/:baselineId/assignments`.
2. Enforce ownership, baseline status (not archived), and utilization lockout.
3. Require `correctionReason` for overwrite or delete; set `correctedFrom` when overwriting.
4. Emit audit entries with action `baseline.assignment.upsert` and `baseline.assignment.delete`.

**Checkpoint A4 - Verification**
- Manual: `POST /baselines/:baselineId/assign` for `field_key=total_amount` then POST overwrite without `correctionReason` to confirm the 400 guard; resubmitting with a ≥10-character reason satisfied the requirement.
- Manual check (2026-02-06): UI presented the string "Correction reason must be at least 10 characters long" until a valid reason ("other test reason") was provided, at which point the card shows `total_amount = 0.29` and a "Reason: other test reason" badge.
- DB:
```sql
SELECT baseline_id, field_key, assigned_value, corrected_from, correction_reason
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>' AND field_key = 'total_amount';
```
Expected result: row created; overwrite sets `corrected_from` and `correction_reason` (`corrected_from = $8.99`, `correction_reason = other test reason` in the verified SQL output).
- Logs: Audit entry action `baseline.assignment.upsert` includes `baselineId`, `fieldKey`, `assignedBy`, `correctedFrom`, `correctionReason` in `details`.
- Regression: Baseline review/confirm endpoints still function.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

### A5 - Baseline Review Payload Aggregation (8.6.8, 8.6.12) ([Complexity: Medium]) ✅
Status: Completed
**Problem statement**  
Expose baseline status, utilization, assignments, and extracted segments in a single read payload for the review UI.

**Files / Locations**
- Backend: `apps/api/src/baseline/baseline.controller.ts` - extend `GET /attachments/:attachmentId/baseline` response.
- Backend: `apps/api/src/baseline/baseline-management.service.ts` - add aggregation method.
- Backend: `apps/api/src/ocr/ocr.service.ts` - add `listExtractedTextSegments(attachmentId, userId)` if needed.

**Implementation plan**
1. Add `assignments` and `segments` to the baseline response model.
2. Include baseline fields: `status`, `confirmedAt`, `confirmedBy`, `utilizedAt`, `utilizationType`.
3. Ensure read operations do not mutate any state.
4. Update `tasks/codemapcc.md` with the augmented response shape.

**Checkpoint A5 - Verification**
- Manual: GET `/attachments/<ATTACHMENT_ID>/baseline` returns baseline, assignments array, and segments array.
- DB: No new rows written on read.
- Logs: No errors for attachments with no baseline (returns `null` baseline and empty arrays).
- Regression: Existing OCR review page still loads confirmed OCR data.
**Status:** Verified on 2026-02-06 by running the review page fetch (baseline payload includes `status`, `utilizedAt`, `assignments`, and `segments`).

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---
## 2) Review Page UI - Layout & Display (P0)

> **Context:** Build the three-panel review workspace and wire extracted text + assignment data.

### B1 - Three-Panel Layout + Persistent Panel (8.6.19-8.6.20) ([Complexity: Medium]) ✅
Status: Completed
**Problem statement**  
Provide a persistent three-panel layout with document preview, extracted text pool, and field assignment panel.

**Files / Locations**
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - layout restructure.
- Frontend: `apps/web/app/components/PdfDocumentViewer.tsx` - reuse existing preview component.

**Implementation plan**
1. Implement 40/30/30 columns on desktop and tabs on mobile.
2. Keep Field Assignment panel always visible (non-modal).
3. Add a back button that returns to `/task/[id]`.

**Checkpoint B1 - Verification**
- Manual: Desktop shows three columns; mobile collapses to tabs labeled `Document`, `Text`, `Fields`.
- DB: No mutations.
- Logs: No console errors in review page.
- Regression: Existing OCR field builder components still render.
**Status:** Verified on 2026-02-06 by reviewing `apps/web/app/attachments/[attachmentId]/review/page.tsx` (40/30/30 layout with document/text/fields tabs and back-to-task button present).

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### B2 - Document Preview Handling (8.6.21) ([Complexity: Simple]) ✅
Status: Completed
**Problem statement**  
Handle preview rules for PDF/images and explicit messaging for XLSX/DOC/DOCX.

**Files / Locations**
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - conditional preview rendering.

**Implementation plan**
1. PDF/Image: render preview with existing viewer.
2. XLSX: show message "Excel files have no preview. Download to view."
3. DOC/DOCX: show error "Word documents not supported. Please convert to PDF."
4. Keep `react-pdf` options memoized so the viewer doesn’t trigger Turbopack warnings when options objects change.

**Checkpoint B2 - Verification**
- Manual: PDF/Image shows preview via existing viewer; XLSX shows “Excel files have no preview. Download to view.”; DOC/DOCX shows “Word documents not supported. Please convert to PDF.” while download link remains accessible.
- DB: No mutations.
- Logs: No client errors during render.
- Regression: Download link still works for attachments.

**Status:** ✅ Completed on 2026-02-06 after confirming preview rules and memoizing react-pdf options to avoid Turbopack warnings.

**Estimated effort:** 1 hour  
**Complexity flag:** Simple = GPT-4o-mini OK

### B3 - Extracted Text Pool Display (8.6.8) ([Complexity: Medium]) ✅ Completed

**Problem statement**  
Render extracted text segments with confidence indicators and optional bounding-box highlight.

**Files / Locations**
- Frontend: `apps/web/app/components/ExtractedTextPool.tsx` - new component.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - data wiring.

**Implementation plan**
1. Render list with truncation and expand-on-click.
2. Show confidence badge colors: green >= 0.80, yellow 0.60-0.79, red < 0.60.
3. Hover highlights bounding boxes when preview exists; missing bounding box is allowed.
4. Update `tasks/codemapcc.md` with new component path.

**Checkpoint B3 - Verification**
- Manual: Not performed (requires manual UI confirmation that hover highlight + truncation behave as expected).
- DB: No mutations.
- Logs: No errors when `boundingBox` is null.
- Regression: Review page load time remains acceptable.

**Status:** ✅ Completed on 2026-02-06 after tightening the pool highlight guard and documenting the component in the code map.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 3) Field Assignment UI - Inputs & Editing (P0)

> **Context:** Enable explicit, validated field assignments with correction reasons.

### C1 - Field Assignment Panel (Read + Inputs) (8.6.12) ([Complexity: Medium]) [UNVERIFIED]

**Problem statement**  
Show active fields with type-specific inputs and current assignment values.

**Files / Locations**
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` - new component.
- Frontend: `apps/web/app/lib/api/baselines.ts` - new API client for assignments.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - panel wiring.

**Implementation plan**
1. Render active fields from Field Library with inputs by character type.
2. Display assigned values and validation status indicators.
3. Add basic inline validation messaging from API responses.
4. Update `tasks/codemapcc.md` with new component and client path.

**Checkpoint C1 - Verification**
- Manual: Field list renders with inputs for `varchar`, `int`, `decimal`, `date`, `currency`.
- DB: No mutations from initial render.
- Logs: API errors render inline, not as silent failures.
- Regression: Existing review page modals still work.

**Estimated effort:** 3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### C2 - Manual Assignment + Validation (8.6.17) ([Complexity: Medium])
Status: ✅ Completed
**Problem statement**
Allow manual entry with validation feedback and explicit confirmation on save.

**Files / Locations**
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` - input handlers.
- Frontend: `apps/web/app/components/ValidationConfirmationModal.tsx` - new validation confirmation modal.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - validation confirmation flow.
- Frontend: `apps/web/app/lib/api/baselines.ts` - added confirmInvalid flag to AssignPayload.
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` - validation integration with confirmInvalid support.
- Backend: `apps/api/src/baseline/dto/assign-baseline-field.dto.ts` - added confirmInvalid boolean flag.

**Implementation plan**
1. On blur or save, call assignment API and show validation errors. ✅
2. Require explicit user confirmation for save when validation warnings exist. ✅
3. Preserve user-entered value even if invalid, but force acknowledgement. ✅

**Implementation details**
- Backend now throws validation error with requiresConfirmation flag when value is invalid and confirmInvalid is not set
- ValidationConfirmationModal displays validation error, user's entered value, and optional suggested correction
- Modal provides three actions: "Save As-Is" (confirms with confirmInvalid=true), "Use Suggestion" (saves suggested value), or "Cancel"
- Frontend catches validation errors and shows modal before saving invalid values
- Valid values save immediately without prompts
- **Currency field clarification**: Currency field stores ISO 4217 currency codes (exactly 3 uppercase letters: USD, EUR, GBP), not monetary amounts. Monetary amounts use decimal field type.

**Checkpoint C2 - Verification**
- Manual: Enter `total_amount=abc` shows validation error modal with "Invalid integer format" and requires explicit confirmation.
- Manual: Entering valid values (e.g., `123` for int fields, `123.45` for decimal) saves without prompts.
- Manual: Validation modal shows "Use Suggestion" button when suggestedCorrection is available (e.g., decimal with thousands separators).
- DB: Value is saved only after user confirms via "Save As-Is" button or uses suggested correction.
- Logs: API response includes `error` and `suggestedCorrection` fields for invalid values in the validation object.
- Regression: Valid values save without extra prompts. ✅
- Build: Both API and Web builds pass without errors. ✅

**Estimated effort:** 2 hours
**Complexity flag:** Medium = GPT-4o preferred

### C3 - Correction Reason Requirement (8.6.18) ([Complexity: Medium])
Status: ✅ Completed (enhanced in v8.6.add1 with draft/reviewed differentiation)
**Problem statement**
Require correction reason for edits to existing assignments or suggestions.

**Files / Locations**
- Frontend: `apps/web/app/components/CorrectionReasonModal.tsx` - new modal.
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` - modal wiring.
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` - enforce reason.

**Implementation plan**
1. Prompt for correction reason (min 10 chars) on overwrite or delete.
2. Block save if reason is missing; surface inline error.
3. Store `correctedFrom` and `correctionReason` in assignment row.
4. Update `tasks/codemapcc.md` with new modal component.

**Checkpoint C3 - Verification**
✅ **Completed in v8.6.add1** with enhanced behavior:
- Draft baseline: edits/deletes do NOT require correction reason (freeform exploration)
- Reviewed baseline: edits/deletes REQUIRE correction reason (backend enforced, UI prompts)
- Backend validates and rejects mutations without reason when baseline status='reviewed'
- UI shows correction reason modal only for reviewed baseline changes
- See features.md v8.6.add1 "Review Page Behavior" section for implementation details

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### C4 - Drag-and-Drop Assignment (8.6.16) ([Complexity: Complex])
Status: New
**Problem statement**  
Allow drag-drop from extracted text segments into fields with explicit confirmation.

**Files / Locations**
- Frontend: `apps/web/app/components/ExtractedTextPool.tsx` - drag source.
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` - drop targets.

**Implementation plan**
1. Implement drag sources for segments and drop zones for fields.
2. On drop, validate and show confirmation modal before saving.
3. Persist `sourceSegmentId` when confirmed.

**Checkpoint C4 - Verification**
- Manual: Drag segment "INV-123" to `invoice_number` field and confirm.
- DB:
```sql
SELECT source_segment_id, assigned_value
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>' AND field_key = 'invoice_number';
```
Expected result: `source_segment_id` set and value matches segment.
- Logs: Audit entry includes `sourceSegmentId`.
- Regression: Canceling confirmation leaves assignments unchanged.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

---

## 4) Review and Confirm Lifecycle (P0)

> **Context:** Ensure baseline review/confirm UX matches v8.6 lifecycle requirements.

### D1 - Reviewed State UI (8.6.22) ([Complexity: Simple])
Status: ✅ Completed (enhanced in v8.6.add1 with OCR completion lifecycle)
**Problem statement**
Allow user to mark baseline as reviewed while keeping it editable.

**Files / Locations**
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - reviewed button state.
- Backend: `apps/api/src/baseline/baseline.controller.ts` - `POST /baselines/:baselineId/review` call.

**Implementation plan**
1. Show "Mark as Reviewed" only when status is `draft`.
2. Keep assignment inputs editable after review.
3. Refresh baseline payload after transition.

**Checkpoint D1 - Verification**
✅ **Completed in v8.6.add1** with enhanced behavior:
- "Mark as Reviewed" button changes baseline status from draft → reviewed ✅
- Inputs remain editable after review (but now require correction reasons per C3) ✅
- Action reloads baseline data to prevent empty UI state ✅
- BONUS: OCR completion lifecycle - when OCR completes, reviewed baseline resets to draft (user must re-review)
- See features.md v8.6.add1 "Review Page Behavior" section for implementation details

**Estimated effort:** 1 hour  
**Complexity flag:** Simple = GPT-4o-mini OK

### D2 - Confirm Baseline with Summary (8.6.23) ([Complexity: Medium])
Status: New
**Problem statement**  
Confirm baseline only after review and show counts of assigned vs empty fields.

**Files / Locations**
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - confirm modal and counts.
- Backend: `apps/api/src/baseline/baseline.controller.ts` - confirm endpoint.

**Implementation plan**
1. Compute `assignedCount` and `emptyCount` from field list.
2. Show confirmation modal with counts and lock warning.
3. On confirm, redirect to `/task/[id]` with success toast.

**Checkpoint D2 - Verification**
- Manual: Confirm modal shows "X fields assigned, Y fields empty".
- DB:
```sql
SELECT status, confirmed_at, confirmed_by FROM extraction_baselines WHERE id = '<BASELINE_ID>';
```
Expected result: `confirmed` with timestamps set.
- Logs: Audit entry action `baseline.confirm` includes `baselineId`, `confirmedBy`, `assignedCount`, `emptyCount`.
- Regression: Previous confirmed baseline is archived by service.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### D3 - Confirm Only on Review Page + Task Detail Status (8.6.24) ([Complexity: Simple])
Status: ✅ Completed (enhanced in v8.6.add1 with queue state badges)
**Problem statement**
Ensure confirm action exists only on review page; task detail shows read-only status.

**Files / Locations**
- Frontend: `apps/web/app/task/[id]/page.tsx` - add status display only.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - confirm remains here.

**Implementation plan**
1. Remove any confirm action from task detail if present.
2. Display status string "Confirmed on <date> by <user>" when applicable.
3. Keep task detail read-only for baseline actions.

**Checkpoint D3 - Verification**
✅ **Completed in v8.6.add1** with enhanced behavior:
- Task detail shows read-only baseline status (no confirm action) ✅
- Confirm action only available on review page ✅
- BONUS: Task detail shows enhanced status badges:
  - "Queued" badge for attachments with queued OCR jobs
  - "In Progress" badge for attachments with processing OCR jobs
  - "Reviewed" badge for attachments with reviewed baseline
- BONUS: OCR text panel collapsed by default to reduce visual clutter
- See features.md v8.6.add1 "Task Page Integration" section for implementation details

**Estimated effort:** 1 hour  
**Complexity flag:** Simple = GPT-4o-mini OK

---
## 5) ML Suggestions (P1)

> **Context:** Optional ML-assisted suggestions, blocked unless ML endpoint can be added without new dependencies.

### E1+E2 - ML Service Container + Suggestion API (8.6.13-8.6.14) ([Complexity: Complex])
Status: New
**Problem statement**
Provide ML-based field-to-text matching suggestions using a separate microservice container. This replaces the original E1 (add endpoint to ocr-worker) and E2 (suggestion application service) with a complete ML service implementation that includes both inference and training capabilities.

**Architecture Decision**
- **NEW separate container**: `ml-service` (not added to ocr-worker)
- **Backend network only**: Like `db`, accessible only via API container
- **Open source ML**: Sentence-BERT (all-MiniLM-L6-v2) with Apache 2.0 license
- **Includes training**: Full training pipeline for future fine-tuning (v8.7 capabilities built-in)

**Files / Locations**
- NEW: `apps/ml-service/` - Complete FastAPI microservice
  - `ml-service/main.py` - FastAPI app with `/health` and `/ml/suggest-assignments` endpoints
  - `ml-service/ml.Dockerfile` - Container definition
  - `ml-service/requirements.txt` - Python dependencies (sentence-transformers, fastapi, etc.)
  - `ml-service/inference/matcher.py` - Semantic field matching logic
  - `ml-service/training/finetune.py` - Model training script for future use
- Backend: `apps/api/src/ml/ml-client.service.ts` - HTTP client to call ml-service
- Backend: `apps/api/src/ml/ml.service.ts` - Training data export service
- Backend: `apps/api/src/ml/ml.controller.ts` - Admin endpoints for training data
- Backend: `apps/api/src/ml/ml.module.ts` - NestJS module
- Backend: `apps/api/src/baseline/baseline.controller.ts` - Add `POST /baselines/:baselineId/suggest`
- Backend: `apps/api/src/db/schema.ts` - Add `ml_model_versions` table + extend `baseline_field_assignments`
- Infrastructure: `docker-compose.yml` - Add ml-service container
- Infrastructure: `.env` - Add ML_SERVICE_URL

**Implementation plan**
1. Create ml-service container with FastAPI + Sentence-BERT model
2. Implement `/ml/suggest-assignments` endpoint using semantic similarity
3. Add ml_model_versions table and extend baseline_field_assignments with suggestion tracking
4. Create ML module in API with client service for calling ml-service
5. Add suggestion application endpoint in baseline controller
6. Wire up training data export API for future fine-tuning

**Checkpoint E1+E2 - Verification**
- Manual: `docker-compose up ml-service` starts without errors
- Manual: `curl http://ml-service:5000/health` returns `{"status": "ok", "model": "all-MiniLM-L6-v2"}`
- Manual: POST to `/ml/suggest-assignments` with test payload returns semantically relevant suggestions
- Manual: `POST /baselines/:baselineId/suggest` creates assignments with confidence scores
- DB:
```sql
SELECT field_key, assigned_value, suggestion_confidence, suggestion_accepted
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>';
```
Expected result: rows created with `suggestion_confidence` populated, `suggestion_accepted = null`
- DB:
```sql
SELECT * FROM ml_model_versions;
```
Expected result: Table exists (may be empty initially)
- Logs: ml-service logs show successful model loading and inference requests
- Logs: API audit entry `baseline.suggest.apply` includes `baselineId`, `appliedCount`, `modelVersion`
- Regression: Existing OCR worker `/ocr` endpoint continues to work
- Regression: Manual assignment still works without ML suggestions

**Estimated effort:** 8 hours (combined E1+E2 plus training infrastructure)
**Complexity flag:** Complex = GPT-4o required

**Reference Plan:** See `~/.claude/plans/cheeky-imagining-boot.md` for complete implementation details

### E3 - Suggestion Display + Accept/Modify/Clear (8.6.15) ([Complexity: Medium])
Status: New
**Problem statement**  
Show suggestions with confidence badges and enforce explicit accept/modify/clear flows.

**Files / Locations**
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` - suggestion display and actions.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - trigger suggestions.

**Implementation plan**
1. Pre-fill suggested values with High/Medium/Low badges.
2. Accept requires explicit confirm; modify requires correction reason.
3. Clear suggestion requires reason and removes assignment.

**Checkpoint E3 - Verification**
- Manual: Accept, modify, and clear each show correct prompts and results.
- DB:
```sql
SELECT assigned_value, corrected_from, correction_reason
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>' AND field_key = 'total_amount';
```
Expected result: modify sets corrected fields; clear deletes row.
- Logs: Audit entries include `suggestedValue` and final value.
- Regression: Read-only lock still applies when utilized.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 6) Utilization & Locking (P1)

> **Context:** Baseline editing must lock after utilization, both UI and backend.

### F1 - Utilization Tracking for Baselines (8.6.25) ([Complexity: Medium])
Status: New
**Problem statement**  
Persist utilization timestamps and types when baseline data is used.

**Files / Locations**
- Backend: `apps/api/src/baseline/baseline-management.service.ts` - add `markBaselineUtilized`.
- Backend: `apps/api/src/audit/audit.service.ts` - log utilization events.

**Implementation plan**
1. Implement `markBaselineUtilized(baselineId, type, metadata)` with first-write-wins.
2. Add audit events `baseline.utilized.record_created`, `baseline.utilized.workflow_committed`, `baseline.utilized.data_exported`.
3. Wire call sites where baseline data is used (record creation/export) within v8.6 scope only.

**Checkpoint F1 - Verification**
- Manual: Trigger utilization flow and confirm baseline updated.
- DB:
```sql
SELECT utilized_at, utilization_type
FROM extraction_baselines
WHERE id = '<BASELINE_ID>';
```
Expected result: fields set once.
- Logs: Audit entry includes `baselineId`, `utilizationType`, `utilizedAt`.
- Regression: OCR utilization tracking unchanged.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### F2 - Utilization Lockout (8.6.26) ([Complexity: Medium])
Status: New
**Problem statement**  
Prevent edits when baseline is utilized, in both UI and backend.

**Files / Locations**
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` - disable inputs and show badge.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` - top-level read-only state.
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` - reject mutations.

**Implementation plan**
1. If `utilizationType` exists, disable all edit actions and show a reason tooltip.
2. Backend returns 403 on assign/delete when utilized.
3. Keep read-only views accessible.

**Checkpoint F2 - Verification**
- Manual: Utilized baseline shows read-only badge and blocks edits.
- DB: No changes on blocked mutation.
- Logs: Audit entry `baseline.assignment.denied` includes `reason=utilized`.
- Regression: Non-utilized baselines remain editable.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### F3 - Utilization Indicator on Task Detail (8.6.27) ([Complexity: Simple])
Status: New
**Problem statement**  
Surface baseline utilization status on task detail page.

**Files / Locations**
- Frontend: `apps/web/app/task/[id]/page.tsx` - add utilization indicator.
- Backend: `apps/api/src/baseline/baseline.controller.ts` - include utilization summary for task detail.

**Implementation plan**
1. Add utilization status fields to task detail baseline payload.
2. Display indicator text with tooltip showing type and timestamp.
3. Keep display read-only.

**Checkpoint F3 - Verification**
- Manual: Task detail shows "Not yet used" or correct utilization message.
- DB: No mutations.
- Logs: No extra mutation calls.
- Regression: Task detail still loads attachments and OCR panels.

**Estimated effort:** 1 hour  
**Complexity flag:** Simple = GPT-4o-mini OK

---

## 7) File Type Validation (P1)

> **Context:** Restrict uploads to supported file types with clear errors.

### G1 - Upload Validation (8.6.28) ([Complexity: Simple])
Status: New
**Problem statement**  
Reject unsupported file types with explicit user-facing errors.

**Files / Locations**
- Backend: `apps/api/src/attachments/attachments.service.ts` - MIME type validation.
- Backend: `apps/api/src/attachments/attachments.controller.ts` - error handling.
- Frontend: `apps/web/app/task/[id]/page.tsx` - surface error message.

**Implementation plan**
1. Allow PDF, PNG, JPG, JPEG, XLSX only.
2. Reject DOC/DOCX with error "Word documents not supported. Please convert to PDF."
3. Preserve existing 20MB size limit and duplicate-name checks.

**Checkpoint G1 - Verification**
- Manual: Upload DOCX -> error shown; upload PDF/XLSX -> succeeds.
- DB: No attachment row created for rejected files.
- Logs: Error includes MIME type and filename.
- Regression: Existing attachment uploads still work.

**Estimated effort:** 1 hour  
**Complexity flag:** Simple = GPT-4o-mini OK

---

## 8) Execution Order (Do Not Skip)

**Critical path dependencies:**
1. **A1** Verify extracted text segments storage - no dependencies.
2. **A2** Baseline field assignment table - depends on A1 (schema confirmed).
3. **A3** Field assignment validator - depends on A2 (table/fields defined).
4. **A4** Assignment API + audit - depends on A2 and A3.
5. **A5** Baseline review payload - depends on A4 (assignments available).
6. **B1** Three-panel layout - depends on A5 (payload shape known).
7. **B2** Document preview handling - depends on B1.
8. **B3** Extracted text pool - depends on A5 and B1.
9. **C1** Field assignment panel - depends on A4 and B1.
10. **C2** Manual assignment + validation - depends on C1 and A3.
11. **C3** Correction reason requirement - depends on C2.
12. **C4** Drag-and-drop assignment - depends on B3 and C1.
13. **D1** Reviewed state UI - depends on A5.
14. **D2** Confirm baseline with summary - depends on D1 and C1.
15. **D3** Confirm only on review page + task detail status - depends on D2.
16. **E1+E2** ML service container + suggestion API - depends on A4 (assignment API exists).
17. **E3** Suggestion display - depends on E1+E2 and C1.
19. **F1** Utilization tracking - depends on A2.
20. **F2** Utilization lockout - depends on F1 and C1.
21. **F3** Utilization indicator - depends on F1.
22. **G1** File type validation - no dependencies.

**Parallel execution opportunities:**
- B2 can run in parallel with B3 after B1 completes.
- D1 can run in parallel with B3 after A5 completes.
- F1 can run in parallel with UI tasks after A2 completes.

**Blocking relationships:**
- UI assignments (C-series) are blocked until assignment API (A4) is complete.
- ML service (E1+E2) is blocked until assignment API (A4) is complete.
- Suggestion UI (E3) is blocked until ML service (E1+E2) and field assignment panel (C1) are complete.

---

## 9) Definition of Done

**Feature Completeness:**
- [ ] Extracted Text Pool: Segments render with confidence badges and optional bounding-box highlight.
- [ ] Extracted Text Pool: Segments remain visible after assignment.
- [ ] Field Assignments: One field per baseline enforced with correction metadata and audit logs.
- [ ] Field Assignments: Validation errors surface and require explicit confirmation when overridden.
- [ ] Review Page: Three-panel layout with persistent field panel and mobile tabs.
- [ ] Review Page: Review and confirm actions follow draft -> reviewed -> confirmed state machine.
- [ ] Utilization: Tracking persists and locks edits in UI and backend.
- [ ] File Types: Unsupported types rejected with explicit error message.

**Data Integrity:**
- [ ] Unique constraint on `(baseline_id, field_key)` prevents duplicates.
- [ ] All assignment mutations emit audit log entries with before/after and reason.

**No Regressions:**
- [ ] API boots without errors (`npm run build` in `apps/api`).
- [ ] Web builds without errors (`npm run build` in `apps/web`).
- [ ] OCR confirmation and review page still work for existing attachments.

**Documentation:**
- [ ] `tasks/codemapcc.md` updated with new files/endpoints/tables.
- [ ] `tasks/executionnotes.md` updated with completion evidence.

---

## 10) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (Run After Every Task):**
- [ ] API boots: `cd apps/api && npm run build` -> no errors.
- [ ] Web builds: `cd apps/web && npm run build` -> exit code 0.
- [ ] Login flow works: Navigate to `/login` -> enter credentials -> redirects to `/`.

**Feature-Specific Tests:**
- [ ] Extracted text pool renders: Open `/attachments/<ATTACHMENT_ID>/review` -> see segments list and confidence badges.
- [ ] Assignment creation: Enter `invoice_number=INV-123` -> Save -> field shows value -> refresh retains value.
- [ ] Correction reason enforced: Edit `invoice_number` -> prompt for reason -> missing reason blocks save with message.
- [ ] Drag/drop: Drag segment "INV-123" to `invoice_number` -> confirm -> value set with source segment id.
- [ ] Reviewed state: Click "Mark as Reviewed" -> status badge shows `Reviewed` -> inputs remain editable.
- [ ] Confirm state: Click "Confirm Baseline" -> modal shows counts -> confirm locks inputs.
- [ ] Utilization lock: Simulate utilization -> inputs disabled and backend returns 403 on assign.
- [ ] File type validation: Upload DOCX -> see "Word documents not supported"; upload PDF/XLSX -> succeeds.

**Integration Tests (Run After All Tasks Complete):**
- [ ] End-to-end: Upload PDF -> run OCR -> open review -> assign fields -> review -> confirm -> task detail shows confirmed status.
- [ ] Cross-feature validation: Baseline confirmed -> OCR review still displays confirmed OCR (no regressions).

**Regression Tests:**
- [ ] Task detail page still loads attachments and OCR actions.
- [ ] Admin Field Library page still loads and edits fields.

---

## 11) Post-Completion Checklist

- [ ] Update `tasks/executionnotes.md`: completion date.
- [ ] Update `tasks/executionnotes.md`: what was built (reference task IDs).
- [ ] Update `tasks/executionnotes.md`: any deviations from plan (with reasons).
- [ ] Update `tasks/executionnotes.md`: lessons learned (add to `tasks/lessons.md` if applicable).
- [ ] Update `tasks/codemapcc.md` with new file paths and endpoints.
- [ ] Run full regression suite.
- [ ] Tag commit: `git tag v8.6 -m "Field-Based Extraction Assignment & Baseline complete"`.

---
