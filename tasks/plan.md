## v8.8.1 ? Adaptive Doc Intelligence (Pairing + Field Context + Selection + Table Enhancements + Eval)

**Date:** 2026-02-13  
**Scope:** Improve ML suggestion quality and reviewer throughput with pairing/context enrichment, smarter field selection, stricter table detection, and read-only evaluation metrics.  
**Principles:** Minimal localized changes. Backend authoritative. No new dependencies. No background automation. Preserve auditability-first.

---

## 0) Preconditions / Guardrails

**Prerequisites:**
- [ ] v8.6 baseline review flow exists and is stable.  
  Evidence: `tasks/executionnotes.md` entries for v8.6 milestones (2026-02-06 to 2026-02-11).
- [ ] v8.8 ML suggestions and table suggestion flows are complete.  
  Evidence: `tasks/executionnotes.md` entries dated 2026-02-12 to 2026-02-13.
- [ ] ML service and ML API module exist.  
  Evidence: `tasks/codemapcc.md` Backend Map and Repo Index list `apps/ml-service` and `apps/api/src/ml/*`.
- [ ] Review `tasks/lessons.md` for v8.8 patterns before starting.  
  Evidence: 2026-02-13 entries on table detection.

**Out of Scope:**
- [ ] Learning or memory (v8.9+ training and fine-tuning).
- [ ] Auto-assignment or auto-confirm behavior.
- [ ] Background jobs or cron-based processing.
- [ ] New dependencies outside existing package.json and requirements.txt.

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Missing Infrastructure:** If `extracted_text_segments` or `baseline_field_assignments` is not present in `apps/api/src/db/schema.ts` and `tasks/codemapcc.md`.
- **STOP - Missing File/Codemap Entry:** If any new controller/service/page path is not added to `tasks/codemapcc.md` before implementation.
- **STOP - New Dependency Request:** If implementation requires any new npm or pip dependencies.
- **STOP - Ambiguous Requirement:** If pairing/context heuristic thresholds are unclear for a concrete example.
- **STOP - Scope Creep:** If work requires v8.9 model training or cross-baseline memory.

---

## 1) Pairing + Context Provenance (P0)

> **Context:** Provide derived label/value pairing and context for better matching, with full provenance stored alongside suggestions.

### A1 ? Suggestion Context Schema + API Surface (Complexity: Medium) ? Status: ? Completed on 2026-02-13 (VERIFIED)

**Problem statement**  
We need to persist pairing provenance (label/value segment IDs and context segments) as derived metadata without changing authoritative data.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` ? add `suggestionContext` jsonb column to `baseline_field_assignments`.
- Backend: `apps/api/src/db/migrations/` ? add forward and rollback migration for `suggestion_context`.
- Backend: `apps/api/drizzle/` ? add Drizzle SQL migration for the same column.
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` ? include `suggestionContext` in reads.
- Backend: `apps/api/src/baseline/dto/assign-baseline-field.dto.ts` ? allow optional `suggestionContext`.
- Frontend: `apps/web/app/types.ts` ? add `suggestionContext` to `Assignment`.
- Docs: `tasks/codemapcc.md` ? update Data Model Map and type notes.

**Implementation plan**
1. Add `suggestion_context` jsonb column (nullable) to `baseline_field_assignments`.
2. Update Drizzle schema and add migrations (forward + rollback).
3. Extend DTOs and assignment serialization to include `suggestionContext`.
4. Update frontend types to accept `suggestionContext`.
5. Update `tasks/codemapcc.md`.

**Checkpoint A1 ? Verification**
- Manual: Load `/attachments/<id>/review` and confirm assignment payload includes `suggestionContext` (even if null).
- DB:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'baseline_field_assignments'
  AND column_name = 'suggestion_context';
```
  Expected result: one row with `data_type = jsonb`.
- Logs: API starts without schema errors after migration.
- Regression: Existing assignment reads still work.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### A2 ? Pairing + Context Pre-Processor in API (Complexity: Complex) ? Status: ? Completed on 2026-02-13 (VERIFIED)

**Problem statement**  
We need to derive label/value pairing candidates and context for segments before sending data to the ML service.

**Files / Locations**
- Backend: `apps/api/src/ml/field-suggestion.service.ts` ? build pairing/context derivations and enrich ML payload.
- Backend: `apps/api/src/ml/ml.service.ts` ? update payload types to include context and pairing candidates.
- Docs: `tasks/codemapcc.md` ? document new ML payload fields.

**Implementation plan**
1. Build a pairing pre-processor using OCR segment bounding boxes and page numbers:
   - Identify label-like segments (short text, non-numeric).
   - For each label, find nearest value segment to the right or below.
   - Emit `pairCandidates` with `labelSegmentId`, `valueSegmentId`, `pairConfidence`, `relation`, `pageNumber`.
2. Build `segmentContext` for each segment:
   - Neighbor text on same row (left and right).
   - Nearest header above (same column).
   - `contextSegmentIds` and `contextText` (concatenated, trimmed).
3. Add `pairCandidates` and `segmentContext` to ML payload.
4. Add audit log details for `pairCandidateCount` and `contextSegmentCount`.

**Checkpoint A2 ? Verification**
- Manual: Click "Get Suggestions" and confirm request completes without errors.
- DB:
```sql
SELECT details->>'pairCandidateCount' AS pair_candidates,
       details->>'contextSegmentCount' AS context_segments
FROM audit_logs
WHERE action = 'ml.suggest.generate'
ORDER BY created_at DESC
LIMIT 1;
```
  Expected result: non-null counts.
- Logs: API log includes `ml.suggest.generate` with `pairCandidateCount` and `contextSegmentCount`.
- Regression: Suggestions still generate without pairing (fallback).

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

### A3 ? ML Service Pairing/Context Reranking (Complexity: Complex) ? Status: ? Completed on 2026-02-13 (VERIFIED)

**Problem statement**  
We need to incorporate pairing candidates and context into the ML service scoring while keeping deterministic behavior.

**Files / Locations**
- ML Service: `apps/ml-service/main.py` ? extend request model and suggestion logic.
- ML Service: `apps/ml-service/model.py` ? no changes expected unless embedding strategy is adjusted.
- Docs: `tasks/codemapcc.md` ? document request/response additions.

**Implementation plan**
1. Extend `/ml/suggest-fields` request model to accept:
   - `pairCandidates` list with label/value IDs and confidence.
   - `segmentContext` list with `segmentId`, `contextText`, `contextSegmentIds`.
2. Use `pairCandidates` to prioritize label-to-value suggestions:
   - If a candidate value segment matches a field label with high confidence, boost score.
   - Ensure pairing is only a confidence boost, not an override.
3. Use `contextText` by embedding "segment text + contextText" when available.
4. Return `suggestions` with `provenance`:
   - `labelSegmentId`, `contextSegmentIds`, `pairConfidence`, `pairStrategy`.
5. Keep deterministic ordering and thresholds.

**Checkpoint A3 ? Verification**
- Manual: For a known attachment with label/value pairs, run "Get Suggestions" and see numeric/date fields pick nearby values.
- Logs: ML logs include `pairCandidateCount` and `contextSegmentCount`.
- Regression: Suggestions still return when pairing/context missing.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

---

## 2) Paired Label/Value Cards UI (P0)

> **Context:** Add client-side label/value pairing in ExtractedTextPool and render paired cards (label + value) above the unpaired list. Dragging a paired card uses the value segment text.

### E1 ? Client-Side Pairing Derivation (Complexity: Medium) ? Status: ? Completed on 2026-02-14

**Problem statement**
We need to mirror backend pairing heuristics on the client to generate paired label/value cards without backend changes.

**Files / Locations**
- Frontend: `apps/web/app/components/ocr/ExtractedTextPool.tsx` ? add pairing helpers and derivation logic.
- Frontend: `apps/web/app/types.ts` ? add `PairCandidate` interface.
- Docs: `tasks/codemapcc.md` ? document pairing logic.

**Implementation plan**
1. Add pairing helper functions mirroring backend heuristics:
   - `detectBoundingBoxScale(segments)` ? determine if coordinates are normalized (0-1) or pixels.
   - `isNumericOrDate(text)` ? detect value-like segments.
   - `isLabelLike(text)` ? detect short, non-numeric label segments.
   - `isValueLike(text)` ? complement to `isLabelLike`.
   - `calculatePairConfidence(label, value, relation, distance)` ? scoring function.
2. Group segments by `pageNumber` (default 1 if missing).
3. For each label candidate, find nearest value to the right or below using bounding box proximity.
4. Compute `PairCandidate` list with `labelSegment`, `valueSegment`, `pairConfidence`, `relation`, `pageNumber`.
5. Sort candidates by `pairConfidence` desc and accept pairs if both segments are unused (avoid duplicates).
6. Output `pairedSegments` and `unpairedSegments` (segments not in any accepted pair).

**Checkpoint E1 ? Verification**
- Manual: Load review page with OCR segments containing label/value pairs (e.g., "Invoice #:" + "12345").
- Console: Log `pairedSegments` and verify label/value pairing is correct.
- Regression: Unpaired segments still render correctly.

**Estimated effort:** 2-3 hours
**Complexity flag:** Medium = GPT-4o preferred

### E2 ? Paired Card Rendering (Complexity: Medium) ? Status: ? Completed on 2026-02-15

**Problem statement**
We need to render paired cards above the unpaired segment list with label + value layout.

**Files / Locations**
- Frontend: `apps/web/app/components/ocr/ExtractedTextPool.tsx` ? add paired card section.
- Frontend: `apps/web/app/components/extracted-text/PairedSegmentCard.tsx` ? new component for paired card.
- Docs: `tasks/codemapcc.md` ? document new component.

**Implementation plan**
1. Add "Paired Segments" section above existing segment list.
2. Create `PairedSegmentCard` component with:
   - Top row: confidence badge + page number.
   - Body: label text (smaller, muted) + value text (primary, larger).
   - Hover highlights value segment in document viewer.
   - Drag uses value segment (not label).
3. Use existing card styles to keep UI consistent.
4. Render unpaired segments in existing list (exclude any segment already in a pair).

**Checkpoint E2 ? Verification**
- Manual:
  - Load review page with paired segments.
  - Paired cards appear above unpaired list.
  - Label and value text display correctly.
- Hover: Hovering paired card highlights value segment in document viewer.
- Regression: Unpaired segment cards render as before.

**Estimated effort:** 2-3 hours
**Complexity flag:** Medium = GPT-4o preferred

### E3 - Paired Selection & Drag Behavior (Complexity: Medium) - Status: ✅ Completed on 2026-02-15

**Problem statement**
We need to support batch selection (both label + value) and drag-to-field using the value segment.

**Files / Locations**
- Frontend: `apps/web/app/components/ocr/ExtractedTextPool.tsx` ? add `onToggleSelectionBatch` handler.
- Frontend: `apps/web/app/components/extracted-text/PairedSegmentCard.tsx` ? wire up selection checkbox and drag.
- Frontend: `apps/web/app/attachments/[id]/review/page.tsx` ? implement batch selection logic.
- Docs: `tasks/codemapcc.md` ? document selection behavior.

**Implementation plan**
1. [x] Add `onToggleSelectionBatch?: (ids: string[], selected: boolean) => void` prop to `ExtractedTextPool`.
2. [x] Paired card shows single checkbox:
   - `selected` means both label + value are selected.
   - Clicking toggles both segments.
3. [x] Implement `onToggleSelectionBatch` in `page.tsx`:
   - If either segment is unselected -> add both.
   - If both selected -> remove both.
4. [x] Drag behavior: call `onDragStart(e, valueSegment)` so field drop logic inserts value text.
5. [x] Preserve existing single-segment selection logic for unpaired segments.

**Checkpoint E3 ? Verification**
- Manual:
  - Click paired card checkbox ? both label + value selected.
  - Click again ? both deselected.
  - Create table ? both segments included.
- Drag: Drag paired card onto field ? value text inserted, `sourceSegmentId` is value segment ID.
- Regression: Unpaired segment selection/drag unchanged.

**Estimated effort:** 2-3 hours
**Complexity flag:** Medium = GPT-4o preferred

---

## 3) Field Selection + Review UI (P1)

> **Context:** Reduce UI noise by defaulting to top-N suggested fields while keeping explicit "Show all fields".

### B1 ? Top-N Field Selection Policy (Complexity: Medium) ? Status: ✅ Completed on 2026-02-15

**Problem statement**  
We need to show a limited set of suggested fields by default, while preserving access to all fields.

**Files / Locations**
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` ? implement selection policy.
- Frontend: `apps/web/app/types.ts` ? confirm assignment fields for confidence sorting.
- Docs: `tasks/codemapcc.md` ? update component behavior notes.

**Implementation plan**
1. Default to showing:
   - Top N suggested fields by confidence (N = 20).
   - Any fields with existing assigned values (manual or suggested).
2. Keep existing "Show all fields" toggle to reveal all fields.
3. Ensure suggested count is accurate and does not include manual-only assignments.

**Checkpoint B1 ? Verification**
- Manual:
  - Load review page with >20 suggested fields.
  - Default view shows 20 suggested + all assigned fields.
  - Click "Show all fields" and confirm full list appears.
- Regression: "Show suggested only" behavior remains consistent.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### B2 ? Pairing/Context Provenance in UI (Complexity: Medium) ? Status: ✅ Completed on 2026-02-14

**Problem statement**  
Reviewers need visibility into why a suggestion was made, using stored provenance.

**Files / Locations**
- Frontend: `apps/web/app/components/suggestions/SuggestedFieldInput.tsx` ? display context tooltip. [DONE]
- Frontend: `apps/web/app/components/FieldAssignmentPanel.tsx` ? pass through `suggestionContext`. [DONE]
- Docs: `tasks/codemapcc.md` ? note UI provenance display. [DONE]

**Implementation plan**
1. Display a "Context" tooltip for suggested fields showing:
   - Label segment text (if present).
   - Neighbor text (left/right/above).
   - Pairing confidence (if present).
2. Keep tooltip hidden for manual assignments.

**Checkpoint B2 ? Verification**
- Manual:
  - Hover a suggested field and confirm context tooltip shows label/value pairing.
  - Manual fields show no context tooltip.
- Regression: Existing confidence badges remain unchanged.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 4) Table Detection Enhancements (P1)

> **Context:** Improve precision by raising thresholds and honoring ignore-forever for repeated detections.

### C1 ? Ignore-Forever Filtering + Threshold Bump (Complexity: Medium) ? Status: ✅ Completed on 2026-02-15 (VERIFIED)

**Problem statement**  
Ignored table suggestions should not reappear for the same attachment, and thresholds should be stricter for precision.

**Files / Locations**
- Backend: `apps/api/src/ml/table-suggestion.service.ts` ? filter detections that overlap ignored suggestions.
- ML Service: `apps/ml-service/main.py` ? raise default threshold for table detection (0.50 -> 0.60).
- Docs: `tasks/codemapcc.md` ? update table detection notes.

**Implementation plan**
1. Load ignored suggestions for the attachment and build bounding box exclusion list.
2. Filter new detections if bounding boxes overlap ignored regions by >50% IoU.
3. Update ML service default threshold to 0.60.
4. Log `ignoredOverlapFiltered` count in `ml.table.detect` audit details.

**Checkpoint C1 ? Verification**
- Manual:
  - Detect tables, ignore one, run detection again.
  - Ignored suggestion does not reappear.
- DB:
```sql
SELECT status, suggested_at
FROM ml_table_suggestions
WHERE attachment_id = '<ATTACHMENT_ID>'
ORDER BY suggested_at DESC;
```
  Expected result: ignored rows remain, no new pending rows for ignored region.
- Logs:
  - Audit log includes `ignoredOverlapFiltered` in `ml.table.detect` details.
- Regression: Convert and ignore actions still work.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 5) Evaluation / Monitoring (P1)

> **Context:** Provide read-only metrics computed from audit logs and assignments without background jobs.

### D1 - [VERIFIED] Admin Metrics API (Calculates acceptance/modify/clear rates) (Complexity: Medium) ? Status: [VERIFIED]
Status: ✅ Completed on 2026-02-15 (VERIFIED)

**Problem statement**  
We need an admin-only endpoint that returns acceptance/modification/clear rates, top-1 accuracy, and per-field confusion.

**Files / Locations**
- Backend: `apps/api/src/ml/ml.module.ts` ? register metrics controller.
- Backend: `apps/api/src/ml/ml-metrics.controller.ts` ? new controller (admin-only).
- Backend: `apps/api/src/ml/ml-metrics.service.ts` ? query logic.
- Docs: `tasks/codemapcc.md` ? document admin endpoint.

**Implementation plan**
1. Add `GET /admin/ml/metrics` with optional `startDate` and `endDate`.
2. Compute metrics from:
   - `baseline_field_assignments` suggestion columns for accept/modify rates.
   - `audit_logs` for clears and suggestion generation counts.
3. Return JSON:
   - `acceptRate`, `modifyRate`, `clearRate`, `top1Accuracy`, `fieldConfusion[]`.
4. Ensure admin guard enforced.

**Checkpoint D1 ? Verification**
- Manual:
  - Call endpoint as admin and confirm JSON response.
  - Call as non-admin and confirm 403.
- DB:
```sql
SELECT
  COUNT(*) FILTER (WHERE suggestion_accepted = true) AS accepted,
  COUNT(*) FILTER (WHERE suggestion_accepted = false) AS modified,
  COUNT(*) FILTER (WHERE suggestion_accepted IS NULL AND suggestion_confidence IS NOT NULL) AS suggested
FROM baseline_field_assignments;
```
  Expected result: counts align with API output.
- Logs: API log includes `ml.metrics.fetch` with date range.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### D2 ? Admin Metrics UI (Complexity: Medium) ? Status: ✅ Completed on 2026-02-15 (VERIFIED)

**Problem statement**  
We need a simple admin UI view to display ML metrics without new dependencies.

**Files / Locations**
- Frontend: `apps/web/app/admin/ml/page.tsx` ? new admin page.
- Frontend: `apps/web/app/lib/api/admin.ts` ? add `fetchMlMetrics` helper.
- Docs: `tasks/codemapcc.md` ? add admin route.

**Implementation plan**
1. Build `/admin/ml` page with table view for:
   - Acceptance, modification, clear rates.
   - Top-1 accuracy.
   - Confusion by field (top 10 by error rate).
2. Add date range inputs and "Refresh" button (explicit action).
3. Guard page for admin only.

**Checkpoint D2 ? Verification**
- Manual:
  - Navigate to `/admin/ml` as admin and see metrics table.
  - Non-admin is redirected or denied.
- Regression: Existing `/admin` page remains functional.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 6) Execution Order (Do Not Skip)

**Critical path dependencies:**
1. **A1** Suggestion context schema ? No dependencies.
2. **A2** API pairing/context pre-processor ? Depends on A1.
3. **A3** ML service pairing/context reranking ? Depends on A2 (payload contract).
4. **E1** Client-side pairing derivation ? No dependencies (client-side only).
5. **E2** Paired card rendering ? Depends on E1 (pairing logic).
6. **E3** Paired selection & drag behavior ? Depends on E2 (paired cards exist).
7. **B1** Top-N field selection ? Depends on A2 (suggestion data available).
8. **B2** Context provenance UI ? Depends on A1 and A3.
9. **C1** Table enhancement ? No dependency on A-series.
10. **D1** Admin metrics API ? Depends on existing v8.8 audit logs (no new dependency).
11. **D2** Admin metrics UI ? Depends on D1.

**Parallel execution opportunities:**
- E1-E3 (paired cards UI) can run in parallel with A1-A3 (backend pairing/context).
- C1 can run in parallel with A1-A3 and E1-E3.
- D1 can run in parallel with A2-A3 and E1-E3.

**Blocking relationships:**
- Paired card rendering (E2) is BLOCKED until pairing derivation (E1).
- Paired drag/selection (E3) is BLOCKED until paired cards render (E2).
- UI provenance display (B2) is BLOCKED until API provides `suggestionContext` (A1/A3).
- Metrics UI (D2) is BLOCKED until metrics API (D1).

---

## 7) Definition of Done

**Feature Completeness:**
- Pairing and context data are derived and stored per suggestion.
- Client-side paired label/value cards render above unpaired segments.
- Dragging paired cards uses value segment text.
- Paired card selection toggles both label + value segments.
- Suggested fields default to top-N view with explicit "Show all fields".
- Table detection respects ignore-forever and uses stricter threshold.
- Admin metrics endpoint and UI show acceptance/modify/clear rates and top-1 accuracy.

**Data Integrity:**
- Suggestion provenance stored as derived metadata only.
- No authoritative data is overwritten by suggestion logic.
- Audit logs include pairing/context counts and table filtering metrics.

**No Regressions:**
- API builds without errors (`npm run build` in `apps/api`).
- Web builds without errors (`npm run build` in `apps/web`).
- Review page still supports manual assignment and table creation.

**Documentation:**
- `tasks/codemapcc.md` updated with new schema fields, endpoints, and routes.
- `tasks/executionnotes.md` updated with completion evidence.

---

## 8) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (Run After Every Task):**
- [ ] API builds: `cd apps/api && npm run build` -> no errors.
- [ ] Web builds: `cd apps/web && npm run build` -> exit code 0.
- [ ] Login flow works: Navigate to `/login` -> enter credentials -> redirects to `/`.

**Task Group A ? Pairing/Context:**
- [ ] Generate suggestions and verify context stored
  - Steps: Open `/attachments/<id>/review` -> click "Get Suggestions".
  - Expected: Audit log includes pairing counts and suggestions appear.
- [ ] Provenance stored
  - DB query:
```sql
SELECT field_key, suggestion_context
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>'
  AND suggestion_confidence IS NOT NULL
LIMIT 5;
```
  - Expected: `suggestion_context` contains label/value segment IDs.

**Task Group E ? Paired Cards UI:**
- [ ] Paired cards render
  - Steps: Load review page with label/value OCR segments.
  - Expected: Paired cards appear above unpaired list with label + value text.
- [ ] Paired card hover
  - Steps: Hover paired card.
  - Expected: Value segment highlights in document viewer.
- [ ] Paired card drag
  - Steps: Drag paired card onto field.
  - Expected: Value text inserted, `sourceSegmentId` is value segment ID.
- [ ] Paired selection
  - Steps: Click paired card checkbox.
  - Expected: Both label + value selected; clicking again deselects both.
- [ ] Table creation with paired segments
  - Steps: Select paired cards and create table.
  - Expected: Both label + value segments included in table.

**Task Group B ? Field Selection:**
- [ ] Default top-N display
  - Steps: Load review page with many suggestions -> only top 20 shown by default.
  - Expected: "Show all fields" reveals full list.
- [ ] Context tooltip
  - Steps: Hover suggested field -> tooltip shows label segment text and pairing confidence.

**Task Group C ? Table Enhancements:**
- [ ] Ignore-forever behavior
  - Steps: Detect tables -> ignore one -> detect again.
  - Expected: Ignored suggestion does not reappear.

**Task Group D ? Evaluation:**
- [ ] Admin metrics endpoint
  - Steps: `GET /admin/ml/metrics?startDate=2026-02-01&endDate=2026-02-13`
  - Expected: JSON includes rates and `fieldConfusion` array.
- [ ] Admin metrics UI
  - Steps: Visit `/admin/ml` -> metrics table renders.

**Integration Tests (Run After All Tasks Complete):**
- [ ] Run suggestions -> accept 1, modify 1, clear 1 -> verify metrics reflect these actions.

**Regression Tests:**
- [ ] Manual field assignment still works without suggestions.
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
- [ ] Tag commit: `git tag v8.8.1 -m "Adaptive Doc Intelligence complete"`

---

