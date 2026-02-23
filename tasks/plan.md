## v8.9 (remainder) + v8.10 — Optimal Extraction Accuracy

**Date:** 2026-02-22
**Scope:** Complete the remaining v8.9 tasks (C1/C2/D3/D4/D5/E1/E2), then build the full v8.10 Optimal Extraction Accuracy milestone: PyMuPDF PDF ingestion, OpenCV preprocessor container, LayoutLMv3 replacing all-MiniLM-L6-v2, zone classifier, per-field confidence tiers, verification UI, LayoutLMv3 fine-tuning pipeline, and spatially-annotated training data capture.
**Principles:** Minimal localized changes. Backend authoritative. Preserve auditability-first. No background automation. No implicit execution. Derived data is never authoritative.

---

## 0) Preconditions / Guardrails

**Prerequisites:**
- [OK] v8.9 A1/A2/B1/B2/B3 complete and tagged.
  Evidence: `tasks/features.md` v8.9 section marks A1–A3, B1–B3 as ✅ Complete; plan.md (prior) shows `Status: ✅ Completed on 2026-02-18/19` for A1, A2, B1, B2, B3.
- [OK] `ml_model_versions` table, `MlModelsService`, `MlModelsController`, `MlTrainingDataService`, `MlTrainingDataController`, `ModelRegistry` all present.
  Evidence: `tasks/codemapcc.md` §3 Backend Map and §4 Data Model Map.
- [OK] `baseline_field_assignments` has `suggestionConfidence`, `suggestionAccepted`, `modelVersionId`, `correctedFrom`, `suggestionContext`.
  Evidence: `tasks/codemapcc.md` §4 Data Model Map.
- [OK] `apps/ml-service` FastAPI service running with `POST /ml/suggest-fields` and `POST /ml/models/activate`.
  Evidence: `tasks/codemapcc.md` §3 ML Service section.

**Out of Scope:**
- [NO] Auto-activation of new models without explicit admin action.
- [NO] Background cron jobs or schedulers (assisted automation in D3/D4 uses volume-only polling, already designed).
- [NO] Deploying LayoutLMv3 to production before fine-tuning pipeline is complete (inference container can be updated incrementally).
- [NO] UI changes outside the review page and `/admin/ml` routes.
- [NO] Changes to PaddleOCR worker character recognition internals.

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Schema Missing:** If `baseline_field_assignments` is missing `confidence_score`, `zone`, `bounding_box`, `extraction_method`, `llm_reviewed`, or `llm_reasoning` after migration runs.
- **STOP - Schema Missing:** If `attachment_ocr_outputs` is missing `document_type_id`, `extraction_path`, `preprocessing_applied`, `overall_confidence`, or `processing_duration_ms` after migration runs.
- **STOP - New Dependency Unapproved:** If any new Python package is needed beyond `transformers`, `datasets`, `torch`, `PyMuPDF`, `opencv-python-headless` — stop and request approval.
- **STOP - Missing Codemap Entry:** Any new file path must be added to `tasks/codemapcc.md` before implementation.
- **STOP - Ambiguous Confidence Tier:** If `ML_TIER_AUTOCONFIRM` or `ML_TIER_VERIFY` env values are not set, use defaults (0.90 / 0.70) and log a warning — do not halt.
- **STOP - Background Automation:** If asked to add cron/scheduler for any purpose outside the D3 volume-polling service already designed.

---

## PART 1 — Remaining v8.9 Tasks

> A1/A2/B1/B2/B3 are complete. The following tasks (C1/C2/D3/D4/D5/E1/E2) remain.

---

## 1) A/B Testing & Suggestion Tracking (P0 — blocks E1/E2)

### C1 — Deterministic A/B Model Selection (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-22 (Verified)

**Problem statement**
We need deterministic 50/50 routing between active and candidate models when A/B testing is enabled, so that suggestion outcomes can be compared per model.

**Files / Locations**
- Backend: `apps/api/src/ml/field-suggestion.service.ts` — add model selection logic.
- Backend: `apps/api/src/ml/ml.service.ts` — pass selected model version to ML service.
- Docs: `tasks/codemapcc.md` — document A/B selection rules.

**Implementation plan**
1. Read `ML_MODEL_AB_TEST` env flag (default `false`).
2. Resolve model A: `isActive=true` in `ml_model_versions` for modelName matching the active architecture.
3. Resolve model B: most recent `isActive=false` row by `trainedAt`.
4. If A/B enabled and model B exists: choose A or B by `parseInt(baselineId.replace(/-/g,''), 16) % 2`.
5. Pass `modelVersionId` and `filePath` to ML service request payload.
6. Add audit detail fields: `abGroup` (`'A'|'B'`), `modelVersionId`, `modelVersion`.
7. Update `tasks/codemapcc.md`.

**Checkpoint C1 — Verification**
- Manual: Run suggestions for two baselines with different IDs; confirm `abGroup` alternates (`A` vs `B`) deterministically on repeated calls.
- DB:
```sql
SELECT model_version_id, COUNT(*) AS suggestions
FROM baseline_field_assignments
WHERE suggestion_confidence IS NOT NULL
  AND assigned_at >= NOW() - INTERVAL '1 day'
GROUP BY model_version_id;
```
Expected: both model version IDs have non-zero counts when A/B enabled.
- Logs: `ml.suggest.generate` audit entry includes `abGroup` and `modelVersionId`.
- Regression: When `ML_MODEL_AB_TEST=false`, only the active model is used.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### C2 — Suggestion Outcome Tracking Integrity (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
Accept/modify/clear outcomes must be recorded consistently on `baseline_field_assignments` so model evaluation data is clean.

**Files / Locations**
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` — confirm suggestion flags are persisted.
- Backend: `apps/api/src/baseline/dto/assign-baseline-field.dto.ts` — ensure `suggestionAccepted` and `modelVersionId` are allowed.
- Backend: `apps/api/src/baseline/dto/delete-assignment.dto.ts` — ensure `suggestionRejected` and `modelVersionId` are allowed.
- Frontend: `apps/web/app/attachments/[id]/review/page.tsx` — confirm correct flags sent for accept/modify/clear.
- Docs: `tasks/codemapcc.md` — document tracking rules.

**Implementation plan**
1. Accept-as-is: set `suggestionAccepted=true`, preserve `modelVersionId`.
2. Modify/clear: set `suggestionAccepted=false`, preserve `modelVersionId`.
3. Manual entry (no suggestion): `suggestionAccepted=NULL`, `modelVersionId=NULL`.
4. Confirm DTOs allow these fields through without stripping them.
5. Update `tasks/codemapcc.md`.

**Checkpoint C2 — Verification**
- Manual: Accept one suggestion, modify one, clear one on `/attachments/<id>/review`.
- DB:
```sql
SELECT field_key, suggestion_accepted, model_version_id
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>'
ORDER BY field_key;
```
Expected: accepted = true, modified/cleared = false, manual = NULL.
- Logs: `baseline.assignment.upsert` includes `suggestionAccepted` when applicable.
- Regression: Manual assignment unaffected.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

## 2) Training Pipeline — Assisted Automation (P1)

> D0 (synthetic generator) and D1 (fine-tuning script) from the original v8.9 plan are superseded by v8.10 LayoutLMv3 pipeline. D2 (register trained model) uses the already-built B1 endpoint and requires no new code. Only D3/D4/D5 remain.

### D3 — Global Volume Trigger + Job State (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
We need a global (system-wide) trigger that runs training automatically when enough qualified corrections have accumulated since the last successful run.

**Rules**
1. **Scope:** Global only. No per-user or per-account triggers.
2. **Trigger condition:** `qualified_corrections_since_last_success >= 1000`.
3. **Qualified corrections:** Must pass A2 filters (no typo, no early-user, no single-user, `suggestionConfidence IS NOT NULL`, `sourceSegmentId IS NOT NULL`).
4. **No schedule / no cooldown:** Volume-only.
5. **No auto-activation:** Activation remains manual.
6. **Stratified buffer:** The 1000 corrections used for fine-tuning must be stratified — see D4 for split logic. The trigger counts volume only; the stratification is applied at training-run time.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-training-automation.service.ts` — new polling + enqueue service.
- Backend: `apps/api/src/ml/ml-training-jobs.service.ts` — job state CRUD.
- Backend: `apps/api/src/ml/ml-training-jobs.controller.ts` — admin visibility (list/status/callbacks).
- Backend: `apps/api/src/db/schema.ts` — new `ml_training_jobs` and `ml_training_state` tables.
- Backend: `apps/api/src/ml/ml.module.ts` — register new services/controllers.
- Docs: `tasks/codemapcc.md` — add new files/endpoints.

**Implementation plan**
1. Add `ml_training_jobs` table: `id`, `status` (queued/running/succeeded/failed), `triggerType` (volume_auto/manual), `windowStart`, `windowEnd`, `qualifiedCorrectionCount`, `candidateVersion`, `modelPath`, `metrics` (jsonb), `startedAt`, `finishedAt`, `errorMessage`.
2. Add `ml_training_state` singleton table: `lastSuccessAssignedAt`, `lastAttemptAt`, `lastAttemptThrough`.
3. `MlTrainingAutomationService.poll()`: count qualified corrections since `lastSuccessAssignedAt`; if ≥1000 and no job queued/running, insert job with `status='queued'`, `triggerType='volume_auto'`.
4. Schedule poll via `setInterval` when `ML_TRAINING_ASSISTED=true` (interval from `ML_TRAINING_POLL_MS`, default 60000).
5. Emit audit log `ml.training.auto.triggered` with `qualifiedCorrectionCount` and window.
6. Update `tasks/codemapcc.md`.

**Checkpoint D3 — Verification**
- Manual: With <1000 qualified corrections → no job created.
- Manual: With ≥1000 qualified corrections → exactly one job created in `ml_training_jobs` with `status='queued'`.
- Logs: `ml.training.auto.triggered` includes `qualifiedCorrectionCount` and `windowStart/windowEnd`.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### D4 — Assisted Training Run + Auto-Register Candidate (Complexity: Complex)

**Problem statement**
When a job is queued, the ML service must run training, register the candidate model, and report back — all without blocking inference.

**Files / Locations**
- ML Service: `apps/ml-service/main.py` — add `POST /ml/training/run`.
- ML Service: `apps/ml-service/training/finetune.py` — invoked by service (v8.10 LayoutLMv3 version, built in Part 2).
- Backend: `apps/api/src/ml/ml-training-jobs.controller.ts` — `POST /admin/ml/training-jobs/:id/complete` and `/fail` callbacks.
- Backend: `apps/api/src/ml/ml-models.service.ts` — auto-register candidate on completion.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. `MlTrainingAutomationService` picks up queued jobs and calls `POST /ml/training/run` with `{jobId, startDate, endDate, minCorrections, candidateVersion, includeZones: true, includeBoundingBoxes: true}`.
2. **Stratified training buffer** — ML service training data export must apply a 70/30 split before fine-tuning begins:
   - **70% (700 rows):** Most recent qualified corrections ordered by `correctedAt DESC` — captures new patterns.
   - **30% (300 rows):** Randomly sampled historic high-confidence anchors from `extraction_training_examples` where `confidence >= 0.90`, sampled across all unique `documentTypeId` values to ensure diversity — prevents catastrophic forgetting on underrepresented document types or vendors.
   - If fewer than 300 historic high-confidence examples exist, sample whatever is available (do not pad with recent corrections — leave the buffer smaller rather than corrupt the diversity guarantee).
   - Log `{recentCount, historicCount, uniqueDocTypes}` to the training job record.
3. ML service runs fine-tuning in a background thread on the stratified dataset; stores model at `/app/models/<candidateVersion>/`; writes `metrics.json`.
4. On success: ML service calls `POST /admin/ml/training-jobs/:id/complete` with `{metrics, modelPath, candidateVersion}`.
5. API updates `ml_training_jobs` to `succeeded`; auto-registers model in `ml_model_versions` with `isActive=false`.
6. On failure: ML service calls `POST /admin/ml/training-jobs/:id/fail` with error; API marks job `failed`.
7. Emit audit logs `ml.training.run.started` (include `{recentCount, historicCount, uniqueDocTypes}`), `ml.training.run.succeeded`, `ml.training.run.failed`.

**Checkpoint D4 — Verification**
- Manual: Trigger a training run → `ml_training_jobs` transitions queued → running → succeeded.
- Manual: Training job log shows `recentCount ≈ 700`, `historicCount ≈ 300`, `uniqueDocTypes ≥ 1`.
- Manual: If only 50 historic high-confidence examples exist → `historicCount = 50`, training proceeds with smaller buffer — no error.
- DB: Candidate model registered in `ml_model_versions` with `isActive=false`.
- Logs: All three audit events present for a complete run; `ml.training.run.started` includes buffer composition.

**Estimated effort:** 4–5 hours
**Complexity flag:** Complex

---

### D5 — Activation Gates (Offline + Online + Golden Set) (Complexity: Medium)

**Problem statement**
Admin activation of a candidate model must be gated by measurable quality thresholds to prevent regressions. Critically, the candidate must also not regress on the static Golden Set — a fixed, manually curated dataset that never changes and is not influenced by production confirmations.

**Rules**
1. Offline gate: candidate must beat active by **≥2% accuracy delta** on recent test set.
2. Online gate: candidate must beat active by **≥5% acceptance delta** and have **≥1000 suggestions**.
3. **Golden Set gate:** candidate accuracy on the Golden Set must be **≥ active model accuracy on the Golden Set**. Regression on the Golden Set auto-kills the build regardless of offline/online gate results.
4. Activation remains explicit admin action only.
5. If Golden Set is empty (not yet populated), gate is skipped with a warning — do not block activation before Golden Set exists.

**Golden Set — Structure and Governance**
- Stored in `golden_set/` directory in the repository root — JSON files, one per document type.
- Each file: `[{documentType, fields: [{fieldKey, expectedValue, fieldType}], sourceDescription}]`.
- **Air-gapped from production UI** — Golden Set entries are never created through the confirm flow. Admin-only PR required to add or modify entries.
- **Version-controlled** — every addition is a PR with commit message stating what schema/edge case it covers.
- Read by the D5 gate at benchmark time; never written to by any automated process.
- Target size: 200–500 entries covering 100% of supported document types and known edge cases.

**Files / Locations**
- New: `golden_set/` directory in repo root — JSON files per document type.
- New: `golden_set/README.md` — governance rules (air gap, PR-only updates, entry format).
- Backend: `apps/api/src/ml/ml-performance.service.ts` — compute gate status per candidate including Golden Set benchmark.
- Backend: `apps/api/src/ml/ml-models.service.ts` — block `activateModel()` if any gate not met.
- Frontend: `apps/web/app/admin/ml/performance/page.tsx` — disable Activate button with tooltip showing which gate failed.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Create `golden_set/` directory with `README.md` documenting governance rules and entry format.
2. `MlPerformanceService.getGateStatus(candidateVersionId)`:
   - Load offline metrics from `ml_model_versions.metrics`.
   - Load online acceptance from `baseline_field_assignments`.
   - **Golden Set benchmark**: load Golden Set JSON files from `golden_set/`; run candidate model inference on each entry; compute accuracy (exact match on `expectedValue` after DSPP cleaning); compare to active model accuracy on same set.
   - Return `{offlineGateMet, onlineGateMet, goldenSetGateMet, goldenSetCandidateAccuracy, goldenSetActiveAccuracy, offlineDelta, onlineDelta, onlineSuggestionCount, goldenSetEmpty}`.
3. `MlModelsService.activateModel()`: call `getGateStatus`; if any gate not met (and `goldenSetEmpty=false` for Golden Set gate), throw `BadRequestException` with gate failure details.
4. Frontend: render Activate button disabled with tooltip showing which specific gate failed and the delta values.
5. Update `tasks/codemapcc.md`.

**Checkpoint D5 — Verification**
- Manual: Register a candidate with accuracy delta <2% → Activate button disabled; tooltip shows offline gate failure.
- Manual: Candidate with <1000 suggestions → Activate button disabled; tooltip shows online gate failure.
- Manual: Candidate regressing on Golden Set (lower accuracy than active) → Activate button disabled; tooltip shows Golden Set gate failure with accuracy delta.
- Manual: Golden Set directory empty → gate skipped; warning logged; other gates still enforced.
- Manual: Candidate meeting all three gates → Activate button enabled; activation succeeds.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

**D6 — Immutable Baseline Policy (Governance — no code task)**
Once a baseline reaches `status = 'confirmed'`, it is permanently locked. This is already enforced by the existing state machine (`confirmBaseline()` is a one-way transactional transition; `correctionReason` is required to overwrite assignments on reviewed baselines). The following rules are policy — document them and enforce them operationally:
- New model versions **never** re-process confirmed baselines. Suggestions only run on `draft` baselines.
- If backfilling improved extraction is required (e.g. after a significant model upgrade), create a new `draft` baseline on the same attachment and run suggestions. The original confirmed baseline remains the human-verified ground truth.
- Confirmed baselines are the training signal source (`D3/D4`); they must never be overwritten by machine-generated data. Human correction is the only valid mutation path.
- The Golden Set (`D5`) is the ultimate expression of this principle — it is the air-gapped, human-curated, immutable reference that no automated process can touch.

---

## 3) Performance Dashboard (P1 — depends on C2, B1)

### E1 — Performance API (Complexity: Medium)

**Problem statement**
Admins need per-model acceptance rates, weekly trends, gate status, and a recommendation signal in a single endpoint.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-performance.controller.ts` — new `GET /admin/ml/performance`.
- Backend: `apps/api/src/ml/ml-performance.service.ts` — aggregation + gate status.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Aggregate per-model suggestion counts and acceptance rates from `baseline_field_assignments`.
2. Build weekly trend data for last 12 weeks using `assigned_at`.
3. For each model version, compute gate status (D5 logic).
4. **Confidence score histogram**: bucket `confidence_score` values from the last 7 days into 10 bands (0.0–0.1, 0.1–0.2, … 0.9–1.0); return as `confidenceHistogram: [{band: string, count: int}]`. This surfaces threshold drift — a spike at 0.89 means the 0.90 auto_confirm threshold is 1% away from saving significant reviewer effort; a high correction rate among confirmed (≥0.90) fields means the threshold is leaking and needs raising.
   ```sql
   SELECT width_bucket(confidence_score::numeric, 0, 1, 10) AS bucket,
          COUNT(*) AS count
   FROM baseline_field_assignments
   WHERE suggestion_confidence IS NOT NULL
     AND assigned_at >= NOW() - INTERVAL '7 days'
   GROUP BY bucket ORDER BY bucket;
   ```
5. Return `{activeModel, candidateModel, models[], trend[], confidenceHistogram[], recommendation}` where `recommendation` appears when candidate beats active by ≥5% acceptance with ≥1000 suggestions.
6. Emit audit log `ml.performance.fetch` with date range.
7. Update `tasks/codemapcc.md`.

**Checkpoint E1 — Verification**
- Manual: `GET /admin/ml/performance?startDate=2026-01-01&endDate=2026-02-22` returns JSON with `models`, 12 `trend` points, and `recommendation`.
- DB:
```sql
SELECT model_version_id,
       COUNT(*) AS suggestions,
       COUNT(*) FILTER (WHERE suggestion_accepted = true) AS accepted
FROM baseline_field_assignments
WHERE suggestion_confidence IS NOT NULL
GROUP BY model_version_id;
```
Expected: API counts align with DB aggregates.
- Regression: Existing `/admin/ml/metrics` endpoint unaffected.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### E2 — Admin Performance UI (Complexity: Medium)

**Problem statement**
Admins need a dedicated page showing model performance, trends, gate status, and an activation control.

**Files / Locations**
- Frontend: `apps/web/app/admin/ml/performance/page.tsx` — new admin UI page.
- Frontend: `apps/web/app/lib/api/admin.ts` — add `fetchMlPerformance` helper.
- Frontend: `apps/web/app/admin/ml/page.tsx` — add link to performance page.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Render summary cards: active model version + acceptance rate, candidate model + acceptance rate, delta.
2. Render model version table: version, trainedAt, suggestions, acceptance rate, gate status badges.
3. Render 12-week trend chart using HTML/CSS (no new deps).
4. Render 7-day confidence score histogram using HTML/CSS bar chart (no new deps); highlight the auto_confirm threshold line (0.90) and verify threshold line (0.70) as vertical markers so admins can visually spot drift — a cluster just below 0.90 is an immediate signal to lower the threshold.
5. Activate button: calls `POST /admin/ml/models/activate`; disabled with tooltip if D5 gates not met.
6. Update `tasks/codemapcc.md`.

**Checkpoint E2 — Verification**
- Manual: Visit `/admin/ml/performance` as admin; cards, table, and trend chart render correctly.
- Manual: Activate button disabled when gates not met; tooltip shows reason.
- Manual: Activate button enabled when gates met; clicking activates and updates active model card.
- Regression: `/admin/ml` metrics page still loads.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

## PART 2 — v8.10 Optimal Extraction Accuracy

---

## 4) Schema Migrations (P0 — all Part 2 work depends on these)

### F1 — New Tables Migration (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
New schema tables (`document_types`, `document_type_fields`, `extraction_training_examples`, `extraction_models`, `training_runs`) must exist before any service code can reference them.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` — add five new table definitions.
- Backend: `apps/api/drizzle/` — generate and run migration SQL.
- Docs: `tasks/codemapcc.md` — document all new tables.

**Implementation plan**
1. Add `document_types`: `id` uuid pk, `name` varchar(255) unique, `description` text nullable, `createdAt` timestamp.
2. Add `document_type_fields`: `id` uuid pk, `documentTypeId` uuid fk document_types, `fieldKey` text fk field_library.fieldKey, `required` boolean default false, `zoneHint` text nullable, `sortOrder` int default 0, `createdAt` timestamp. UNIQUE(documentTypeId, fieldKey).
3. Add `extraction_training_examples`: `id` uuid pk, `baselineId` uuid fk extraction_baselines, `fieldKey` text fk field_library.fieldKey, `assignedValue` text, `zone` text nullable, `boundingBox` jsonb nullable, `extractionMethod` text, `confidence` decimal(5,4) nullable, `isSynthetic` boolean default false, `createdAt` timestamp.
4. Add `extraction_models`: `id` uuid pk, `modelName` text, `architecture` text, `version` text, `filePath` text, `documentTypeId` uuid nullable fk document_types, `metrics` jsonb, `trainedAt` timestamp, `isActive` boolean default false, `createdAt` timestamp. UNIQUE(modelName, version).
5. Add `training_runs`: `id` uuid pk, `status` text (queued/running/succeeded/failed), `triggerType` text, `windowStart` timestamp, `windowEnd` timestamp, `qualifiedExampleCount` int, `candidateVersion` text, `modelPath` text, `metrics` jsonb, `startedAt` timestamp, `finishedAt` timestamp nullable, `errorMessage` text nullable.
6. Run `npm run drizzle:generate && npm run drizzle:migrate`.
7. Update `tasks/codemapcc.md`.

**Checkpoint F1 — Verification**
- DB: All five tables present with correct columns.
- Build: `npm run build` exits 0.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

### F2 — Amend Existing Tables Migration (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
`baseline_field_assignments` and `attachment_ocr_outputs` need new columns for spatial extraction data.

**Files / Locations**
- Backend: `apps/api/src/db/schema.ts` — extend two existing table definitions.
- Backend: `apps/api/drizzle/` — generate and run migration SQL.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Extend `baseline_field_assignments` (additive only — no existing columns changed):
   - `confidence_score` decimal(5,4) nullable
   - `zone` text nullable
   - `bounding_box` jsonb nullable
   - `extraction_method` text nullable
   - `llm_reviewed` boolean nullable
   - `llm_reasoning` text nullable
2. Extend `attachment_ocr_outputs` (additive only):
   - `document_type_id` uuid nullable fk document_types
   - `extraction_path` text nullable
   - `preprocessing_applied` jsonb nullable
   - `overall_confidence` decimal(5,4) nullable
   - `processing_duration_ms` int nullable
3. Run `npm run drizzle:generate && npm run drizzle:migrate`.
4. Update `tasks/codemapcc.md`.

**Checkpoint F2 — Verification**
- DB: `\d baseline_field_assignments` shows all six new columns.
- DB: `\d attachment_ocr_outputs` shows all five new columns.
- Build: API builds without errors.
- Regression: Existing assignment and OCR endpoints return correct data (new columns nullable, no breaks).

**Estimated effort:** 1 hour
**Complexity flag:** Simple

---

## 5) Preprocessor Container (P0 — blocks G1, H1)

### G1 — Preprocessor Container Setup (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
A dedicated OpenCV preprocessing service must exist before image-based PDF pages can be cleaned and enhanced for OCR.

**Files / Locations**
- New: `apps/preprocessor/main.py` — FastAPI app with `POST /preprocess`.
- New: `apps/preprocessor/preprocessor.py` — OpenCV pipeline steps.
- New: `apps/preprocessor/requirements.txt` — `fastapi`, `uvicorn`, `opencv-python-headless`, `Pillow`, `numpy`.
- New: `apps/preprocessor/preprocessor.Dockerfile` — python:3.11-slim, port 6000, backend network only.
- Amend: `docker-compose.yml` — add `preprocessor` service on backend network, no host port mapping.
- Docs: `tasks/codemapcc.md` — add new container and endpoint.

**Implementation plan**
1. `POST /preprocess`:
   - Accept: raw image bytes (multipart) + optional `{steps: ["deskew","orientation","shadow","contrast"]}` JSON field; default all steps.
   - Return: `{ok: true, imageBase64: string, preprocessingApplied: {steps: [], deskewAngle: float, qualityScore: float}}` or `{ok: false, reason: "quality_too_low", qualityScore: float}`.
2. Pipeline steps (applied in order):
   - **Orientation:** detect rotation using image moments; correct to upright.
   - **Deskew:** Hough line transform; correct skew angles -45° to +45°; log corrected angle.
   - **Shadow removal:** morphological opening (large kernel) to estimate background; divide; normalise.
   - **Contrast enhancement:** CLAHE (clip limit 2.0, tile grid 8×8).
   - **Quality gate:** compute Laplacian variance (sharpness proxy); if < `QUALITY_THRESHOLD` (default 50), return `ok: false`.
3. Add `GET /health` returning `{status: "ok"}`.
4. Update `tasks/codemapcc.md`.

**Checkpoint G1 — Verification**
- Manual: `docker compose up preprocessor` starts without error; `GET /health` returns `{status:"ok"}`.
- Manual: `POST /preprocess` with a skewed JPEG returns corrected image bytes and `preprocessingApplied.deskewAngle != 0`.
- Manual: `POST /preprocess` with a very blurry image returns `{ok: false, reason: "quality_too_low"}`.
- Regression: Other containers unaffected by new service.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

## 6) PyMuPDF PDF Ingestion (P0 — blocks H1)

### H1 — PyMuPDF Integration in OCR Pipeline (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
Digital PDFs have a text layer that should be extracted directly. Scanned PDFs must be rendered to images and routed through the preprocessor. The current pipeline treats all PDFs identically.

**Files / Locations**
- Amend: `apps/ocr-worker/main.py` — add PyMuPDF page analysis and routing logic.
- Amend: `apps/ocr-worker/requirements.txt` — add `PyMuPDF`.
- Amend: `apps/ocr-worker/ocrw.Dockerfile` — ensure PyMuPDF installs correctly.
- Docs: `tasks/codemapcc.md` — update OCR worker section.

**Implementation plan**
1. On PDF input, open with `fitz.open(stream=bytes, filetype='pdf')`.
2. Per page:
   - Call `page.get_text('words')`. If result is non-empty (≥5 words): extract text directly → `extraction_path='text_layer'`, skip OCR.
   - If empty: render via `page.get_pixmap(dpi=300)`; POST image bytes to `http://preprocessor:6000/preprocess`.
   - If preprocessor returns `ok: false`: proceed with unprocessed image but log quality warning; set `extraction_path='ocr_unprocessed'`.
   - If preprocessor returns `ok: true`: use returned `imageBase64`; run PaddleOCR; set `extraction_path='ocr_preprocessed'`.
3. Aggregate per-page results into existing `extractedText` format.
4. Include `preprocessing_applied` metadata (aggregate of per-page JSON) in the OCR output metadata field.
5. Store `extraction_path` (most common across pages, or `'mixed'`) in response for persistence.
6. Update `tasks/codemapcc.md`.

**Checkpoint H1 — Verification**
- Manual: Upload a digital PDF (text-extractable) → OCR output metadata shows `extraction_path='text_layer'`; no preprocessor call logged.
- Manual: Upload a scanned PDF → OCR metadata shows `extraction_path='ocr_preprocessed'`; preprocessor container logs show the request.
- Manual: Upload an image (JPEG) → still routes through preprocessor → OCR as before.
- Regression: Existing OCR confirm/baseline flows unaffected.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

## 7) LayoutLMv3 Model (P0 — blocks I1, J1)

### I1 — LayoutLMv3 Model Loading in ml-worker (Complexity: Complex)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
The ml-worker currently loads SentenceTransformer for text-only embeddings. LayoutLMv3 requires spatial (bbox) + token inputs and produces per-token field classification logits.

**Files / Locations**
- Amend: `apps/ml-service/requirements.txt` — remove `sentence-transformers`; add `transformers>=4.35`, `datasets`.
- Amend: `apps/ml-service/model.py` — replace SentenceTransformer loading with LayoutLMv3 processor + model.
- Amend: `apps/ml-service/model_registry.py` — update warm-up to use token+bbox input.
- Amend: `apps/ml-service/ml.Dockerfile` — ensure `transformers` and `torch` install correctly (torch already present).
- Amend: `apps/ml-service/main.py` — update `POST /ml/suggest-fields` request/response contract.
- Docs: `tasks/codemapcc.md` — update ML service section.

**Implementation plan**
1. In `model.py`: replace `SentenceTransformer(model_path)` with:
   ```python
   from transformers import LayoutLMv3Processor, LayoutLMv3ForTokenClassification
   processor = LayoutLMv3Processor.from_pretrained(model_path)
   model = LayoutLMv3ForTokenClassification.from_pretrained(model_path)
   ```
2. In `model_registry.py`: update warm-up to create a dummy `{input_ids, attention_mask, bbox, pixel_values}` tensor batch; run forward pass; confirm output shape.
3. Update `POST /ml/suggest-fields` request to accept:
   - `pageWidth: int`, `pageHeight: int` (for bbox normalisation to 0–1000).
   - `pageType: 'digital' | 'scanned'`.
   - Existing fields: `segments[{id, text, boundingBox}]`, `fields[{fieldKey, label}]`.
4. Inference: normalise bboxes to 0–1000 range; tokenise with `processor`; run model; argmax over field classes per token; aggregate to segment-level predictions.
5. Response per suggestion: add `zone` (text), `boundingBox` (normalised jsonb), `extractionMethod: 'layoutlmv3'`.
6. Graceful degradation: if model not loaded (startup race), return `{ok: false, error: {code: "model_not_ready"}}`.
7. Update `tasks/codemapcc.md`.

**Note:** For the initial deployment, the base `microsoft/layoutlmv3-base` checkpoint from HuggingFace Hub is used. Fine-tuned checkpoints will replace it after K2 (training-worker) completes.

**Checkpoint I1 — Verification**
- Manual: `POST /ml/suggest-fields` with a segment that has a valid `boundingBox` returns suggestions that include `zone` and `boundingBox` fields.
- Manual: `POST /ml/models/activate` with the base LayoutLMv3 checkpoint path succeeds and logs `ml.model.activate.success`.
- Logs: warm-up in `model_registry.py` completes without error on container start.
- Regression: `POST /ml/detect-tables` still functions (uses separate heuristic path, unaffected).

**Estimated effort:** 4–5 hours
**Complexity flag:** Complex

---

### I2 — Zone Classifier Integration (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
Assigning a zone label (header/addresses/line_items/instructions/footer) to each segment provides positional context for LayoutLMv3 inference and downstream field routing.

**Files / Locations**
- Amend: `apps/ml-service/main.py` — add zone classification pre-pass in `POST /ml/suggest-fields`.
- New: `apps/ml-service/zone_classifier.py` — rule-based zone assignment using bounding box y-position ratios.
- Docs: `tasks/codemapcc.md` — document zone classifier.

**Implementation plan**
1. **Reading order sort** (before zone classification): in `main.py`, sort incoming segments by `(pageNumber ASC, boundingBox.y ASC, boundingBox.x ASC)` before passing to zone classifier and LayoutLMv3. Pure y-ratio zone labelling breaks on multi-column layouts; sorting first ensures segments are processed in human reading order, improving LayoutLMv3's spatial relation extraction. This replaces the current unsorted segment order.
2. `zone_classifier.py`: given a segment's normalised `boundingBox` and `pageHeight`, assign zone by normalised y-midpoint (`y_ratio = (boundingBox.y + boundingBox.height/2) / pageHeight`):
   - `y_ratio < 0.15` → `'header'`
   - `0.15 ≤ y_ratio < 0.30` → `'addresses'`
   - `0.30 ≤ y_ratio < 0.75` → `'line_items'`
   - `0.75 ≤ y_ratio < 0.88` → `'instructions'`
   - `y_ratio ≥ 0.88` → `'footer'`
   - Segments without a bounding box → `'unknown'` (do not skip; LayoutLMv3 still processes them).
3. **Replace existing `zone_for_bbox()`** in `main.py` with a call to `zone_classifier.py`. The existing `zone_for_bbox()` uses different boundaries (header/body_top/body_bottom/footer) — remove it entirely; it conflicts with I2 spec.
4. Run zone classifier before LayoutLMv3 inference; pass zone as a feature hint to the model.
5. Include `zone` in each suggestion in the response.
6. Update `tasks/codemapcc.md`.

**Checkpoint I2 — Verification**
- Manual: Segment with `boundingBox.y = 20, pageHeight = 1000` → `zone = 'header'`.
- Manual: Segment at `y=500` of `pageHeight=1000` → `zone = 'line_items'`.
- Manual: Multi-column document — verify segments are ordered left-to-right within the same horizontal band before zone assignment.
- Manual: Segment with no bounding box → `zone = 'unknown'`; suggestion still returned.
- Regression: Suggestion endpoint still returns all existing fields alongside new `zone`; `zone_for_bbox()` no longer present in `main.py`.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### I3 — Updated Field Suggestion Service (Complexity: Medium)
**Status:** ✅ Completed and Verified on 2026-02-23

**Problem statement**
`FieldSuggestionService` hardcodes `all-MiniLM-L6-v2` and does not persist the new spatial fields. It must resolve the active LayoutLMv3 model and persist `zone`, `bounding_box`, `extraction_method`, `confidence_score`.

**Files / Locations**
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — update model resolution, assignment persistence, and add post-ML validation layer.
- New: `apps/api/src/ml/field-type-validator.ts` — DSPP cleaning + type-safe validation utility.
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — accept and persist new columns.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Remove hardcoded `'all-MiniLM-L6-v2' v1.0.0` model lookup; resolve active model from `extraction_models` where `isActive=true` (fall back to `ml_model_versions` for backward compatibility).
2. Pass `pageWidth`, `pageHeight`, `pageType` from OCR output metadata to the ML service request.
3. **DSPP cleaning pass** (`field-type-validator.ts`): before type validation, run a domain-specific cleaning pass on the raw suggested value based on the field's declared type from `field_library`:
   - `currency` / `number` / `decimal` fields: replace `S`→`5`, `O`→`0`, `l`→`1`, `I`→`1`, `B`→`8`; strip non-numeric characters except `.` and `,`; normalise decimal separator.
   - `date` fields: strip ambiguous glyphs; attempt common format normalisation (DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD).
   - Other field types: no cleaning — pass through as-is.
4. **Type-safe validation pass** (`field-type-validator.ts`): after DSPP cleaning, validate the cleaned value against the field's declared type:
   - `currency` / `number` / `decimal`: must parse as a finite number → if fails, set `confidence_score = 0.0`, set `validationOverride = 'type_mismatch'`.
   - `date`: must parse as a valid date → if fails, set `confidence_score = 0.0`, set `validationOverride = 'type_mismatch'`.
   - `text`: no validation — always passes.
   - Unknown type: no validation — always passes.
   - Confidence override is logged; the suggested value is preserved as-is for human review (do not discard it — the reviewer needs to see what the model produced).
5. On ML service response, for each suggestion (after cleaning + validation) persist to `baseline_field_assignments`:
   - `confidence_score` — post-validation value (may be 0.0 if type mismatch).
   - `zone` from suggestion zone.
   - `bounding_box` from suggestion boundingBox.
   - `extraction_method` = `'layoutlmv3'`.
   - `llm_reasoning` — structured inference trace object (the "debug sidecar"); persisted on every suggestion so any extraction failure can be diagnosed without re-running inference:
     ```json
     {
       "rawOcrConfidence": 0.98,
       "modelConfidence": 0.65,
       "zone": "line_items",
       "dsppApplied": true,
       "dsppTransforms": ["S→5", "O→0"],
       "validationOverride": null,
       "ragAdjustment": null,
       "ragRetrievedCount": null,
       "documentTypeScoped": null,
       "fieldSchemaVersion": 1
     }
     ```
     - `rawOcrConfidence`: OCR-reported confidence from the segment (null for text-layer segments where PaddleOCR is not used).
     - `modelConfidence`: LayoutLMv3 confidence before any post-processing.
     - `dsppApplied`: true if any DSPP substitution was made.
     - `dsppTransforms`: list of substitutions applied (e.g. `["S→5"]`); empty array if none.
     - `validationOverride`: `'type_mismatch'` if type validation zeroed confidence; null otherwise.
     - `ragAdjustment`, `ragRetrievedCount`, `documentTypeScoped`, `fieldSchemaVersion`: populated by M4 RAG pass; null until v8.11.
6. **Conflicting field detection** (layout injection guard): after aggregating all suggestions, scan for any `fieldKey` that appears in more than one zone with confidence ≥ 0.50. If found, set `validationOverride = 'conflicting_zones'` and zero confidence on all but the highest-confidence occurrence. Log the conflict. This catches invisible-text injection (white-on-white text in a different zone claiming the same field) — LayoutLMv3's multimodal image branch provides natural resilience but does not guarantee immunity. The conflict flag surfaces these cases for human review rather than silently auto-confirming a potentially fraudulent value.
7. **Weighted FinalScore computation** (`field-type-validator.ts`): after all validation passes, compute a composite `finalScore` from the three available signals. Store as `confidence_score`; log component breakdown in `llm_reasoning`:
   ```
   finalScore = clamp(
     0.7 * modelConfidence
     + 0.2 * ragAgreement          // 0.0 if RAG disabled or no results
     + 0.1 * (rawOcrConfidence ?? modelConfidence),
     0.0, 1.0
   )
   ```
   Post-computation penalties applied in order (cumulative, floor 0.0):
   - `dsppApplied = true` → `-0.10` (value was fixed, not clean; human should verify)
   - `validationOverride = 'type_mismatch'` → force `0.0` (hard override; formula irrelevant)
   - `validationOverride = 'conflicting_zones'` → force `0.0` on losing occurrence
   Note: RAG weight (`0.2`) is intentionally conservative at launch. As corpus grows and RAG recall is validated, consider raising to `0.3` with corresponding reduction in model weight. Do not change weights without re-validating auto_confirm threshold.
8. Update `tasks/codemapcc.md`.

**Checkpoint I3 — Verification**
- Manual: Generate suggestions on a baseline; DB shows `zone`, `bounding_box`, `extraction_method`, `confidence_score` populated on the created assignments; `llm_reasoning` contains structured trace with `rawOcrConfidence`, `modelConfidence`, `dsppApplied`, `dsppTransforms`, `validationOverride`.
- Manual: Suggest a `currency` field where OCR returns `"S1,234.5O"` → DSPP cleaning produces `"51,234.50"` → validation passes → confidence unchanged.
- Manual: Suggest a `currency` field where OCR returns `"Apples"` → cleaning produces `"Apples"` → validation fails → `confidence_score = 0.0`, `llm_reasoning` contains `validationOverride: 'type_mismatch'`; field appears as `flag` tier in UI.
- Manual: Suggest a `date` field where OCR returns `"15/O2/2026"` → DSPP cleaning produces `"15/02/2026"` → parses as valid date → confidence unchanged.
- Manual: Two segments both suggest `invoice_total` — one in `line_items` zone (confidence 0.82), one in `header` zone (confidence 0.61) → `header` occurrence zeroed with `validationOverride: 'conflicting_zones'`; `line_items` occurrence confidence preserved; both appear in response for reviewer visibility.
- Regression: Existing `suggestionConfidence`, `suggestionAccepted`, `modelVersionId` fields still populated correctly.
- Regression: `text` type fields not affected by validation — confidence preserved as-is.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

### I4 — Value Normalization Layer (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23


**Problem statement**
LayoutLMv3 and OCR return raw strings ("23 Jan 2026", "$1,200.50", "Yes"). Storing only raw strings breaks downstream analytics, search, and cross-document comparison. A normalization layer must map OCR strings to typed scalars while preserving the original raw value for re-processing.

**Files / Locations**
- New: `apps/api/src/ml/field-value-normalizer.ts` — type-aware normalization utility.
- Amend: `apps/api/src/db/schema.ts` — add `normalizedValue` (text nullable) and `normalizationError` (text nullable) columns to `baseline_field_assignments`.
- Amend: `apps/api/drizzle/` — generate and run migration.
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — persist normalized value alongside raw value.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Add `normalizedValue` (text nullable) and `normalizationError` (text nullable) to `baseline_field_assignments` via migration. The existing `value` column remains the raw OCR string — never overwrite it. `normalizedValue` is the machine-readable scalar.
2. `field-value-normalizer.ts`: given `{rawValue, fieldType, locale?}`:
   - `currency`: strip currency symbols and whitespace; detect decimal separator (last `.` or `,` with 1–2 digits after → decimal; otherwise thousands separator); normalise to plain decimal string (e.g. `"$1,200.50"` → `"1200.50"`, `"1.200,50"` → `"1200.50"`). Store as string representation of decimal — do not convert to integer cents (avoids floating point precision loss in JS; cents conversion is consumer responsibility).
   - `date`: attempt parse in priority order: ISO 8601, DD/MM/YYYY, MM/DD/YYYY, DD-Mon-YYYY (e.g. "23 Jan 2026"), YYYY/MM/DD. On success, store as `YYYY-MM-DD`. On failure, set `normalizationError = 'unparseable_date'`, `normalizedValue = null`.
   - `boolean`: map case-insensitively: `yes/true/checked/1/on` → `'true'`; `no/false/unchecked/0/off` → `'false'`. No match → `normalizationError = 'unparseable_boolean'`.
   - `number` / `decimal`: same separator detection as currency, no symbol stripping needed.
   - `text`: `normalizedValue = rawValue` (pass-through; no transformation).
   - Unknown type: `normalizedValue = rawValue`.
3. Run normalizer in `baseline-assignments.service.ts` after DSPP cleaning and type validation, before persisting. Normalization failure never blocks persistence — set `normalizationError`, leave `normalizedValue` null, persist `value` (raw) unchanged.
4. Normalization errors are non-fatal but logged; `normalizationError` is surfaced in the inference trace `llm_reasoning` object alongside `validationOverride`.
5. Update `tasks/codemapcc.md`.

**Checkpoint I4 — Verification**
- Manual: Suggest a `currency` field; DB shows `value = "$1,200.50"` (raw) and `normalized_value = "1200.50"`.
- Manual: Suggest a `date` field with OCR value `"23 Jan 2026"` → `normalized_value = "2026-01-23"`.
- Manual: Suggest a `boolean` field with OCR value `"Yes"` → `normalized_value = "true"`.
- Manual: Suggest a `date` field with unparseable value `"not-a-date"` → `normalized_value = null`, `normalization_error = 'unparseable_date'`; `value` (raw) preserved unchanged.
- Manual: Suggest a `text` field → `normalized_value = value` (identical to raw).
- Regression: `value` column on existing assignments unchanged — normalization only writes to `normalized_value`.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### I5 — Multi-Page Field Conflict Resolution (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
When the same `fieldKey` appears on multiple pages of a document with different values, auto-selecting one creates a silent data integrity failure. A high-integrity system must surface the conflict for human review rather than guessing.

**Files / Locations**
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — add post-aggregation multi-page conflict scan.
- Amend: `apps/api/src/ml/field-type-validator.ts` — add `'conflicting_pages'` override type.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. After collecting all suggestions for a baseline (across all pages), group by `fieldKey`.
2. For any `fieldKey` with suggestions from more than one `pageNumber` where the normalised values differ (case-insensitive, whitespace-stripped comparison):
   - Set `validationOverride = 'conflicting_pages'` on all occurrences.
   - Set `confidence_score = 0.0` on all occurrences.
   - Preserve all occurrences in the response — reviewer sees every conflicting value and their source page.
3. If values are identical across pages (same field repeated consistently), keep the highest-confidence occurrence only; discard duplicates silently.
4. Default policy for v8.10: **Strategy A (Strict)** — any value disagreement = flag. Do not implement Strategy B (confidence winner) or Strategy C (frequency vote); document them as future configurable policies.
5. Log `fieldKey`, conflicting page numbers, and distinct values at `warn` level.
6. Update `tasks/codemapcc.md`.

**Checkpoint I5 — Verification**
- Manual: Submit a baseline where `invoice_number` appears on page 1 as `"INV-101"` and page 2 as `"INV-102"` → both suggestions returned with `confidence_score = 0.0` and `validationOverride = 'conflicting_pages'`; both page numbers visible in response.
- Manual: Submit a baseline where `invoice_number` appears on page 1 and page 3 with identical value `"INV-101"` → single suggestion returned, highest confidence kept, no conflict flag.
- Regression: Single-page documents unaffected — conflict scan skips fields with only one page occurrence.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

### I6 — Line-Item Math Reconciliation (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
For structured documents (invoices, purchase orders), mathematical relationships between extracted fields provide a deterministic confidence signal stronger than any ML score. If the numbers add up, confidence should be maximised; if they don't, the extraction must be flagged regardless of ML confidence.

**Files / Locations**
- New: `apps/api/src/ml/math-reconciliation.service.ts` — document-type-aware balance check.
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — call reconciliation after I4 normalization.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. `math-reconciliation.service.ts`: given a set of normalized field assignments and a `documentTypeId`, look up the document type's field configuration from `document_type_fields` to identify reconciliation roles:
   - `line_item_amount` — fields tagged as individual line amounts.
   - `subtotal` — pre-tax sum of line items.
   - `tax` — tax amount.
   - `total` — final payable amount.
   - Role tags are stored in `document_type_fields.zoneHint` (reuse existing nullable column with a `role:` prefix convention, e.g. `role:subtotal`). No schema change needed.
2. Reconciliation checks (using `normalizedValue` decimal strings — parse to `Decimal` for arithmetic; never use JS float):
   - Check A: `sum(line_item_amounts) ≈ subtotal` (tolerance ±0.02 for rounding).
   - Check B: `subtotal + tax ≈ total` (tolerance ±0.02).
3. Result application:
   - Both checks pass → set `confidence_score = 1.0` on all participating fields; add `mathReconciliation: 'pass'` to `llm_reasoning`.
   - Either check fails → set `confidence_score = 0.0` and `validationOverride = 'math_reconciliation_failed'` on all participating fields; add `mathReconciliation: 'fail', mathDelta: <difference>` to `llm_reasoning`.
   - Document type unknown, or participating fields missing/unnormalized → skip reconciliation silently; add `mathReconciliation: 'skipped'` to `llm_reasoning`.
4. Math reconciliation runs last — after I3 (DSPP + type validation + weighted score) and I4 (normalization). It is the final confidence override and takes precedence over all prior scores.
5. Update `tasks/codemapcc.md`.

**Checkpoint I6 — Verification**
- Manual: Invoice with `line_item_amounts = ["100.00", "200.00"]`, `subtotal = "300.00"`, `tax = "30.00"`, `total = "330.00"` → all participating fields `confidence_score = 1.0`; `llm_reasoning.mathReconciliation = 'pass'`.
- Manual: Same invoice but `total = "999.00"` (incorrect) → all participating fields `confidence_score = 0.0`; `validationOverride = 'math_reconciliation_failed'`; `mathDelta` logged.
- Manual: Document type with no `role:` hints in `document_type_fields.zoneHint` → reconciliation skipped; `mathReconciliation: 'skipped'`; no confidence changes.
- Manual: ML confidence was 0.99 on `total` but math fails → `confidence_score` overridden to 0.0.
- Regression: Non-invoice document types (no line item roles configured) unaffected.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

## 8) Per-Field Confidence Tiers (P1 — blocks J1)

### J1 — Confidence Tier Logic + Bulk Confirm (Complexity: Medium)

**Problem statement**
Extracted fields need to be triaged by confidence so reviewers focus effort on uncertain fields. Auto-confirm tier fields should be bulk-acceptable.

**Files / Locations**
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — compute tier on read.
- Amend: `apps/api/src/baseline/baseline.controller.ts` — add `POST /baselines/:baselineId/suggestions/bulk-confirm`.
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — add `bulkConfirmSuggestions()`.
- Frontend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` — render tier indicators and bulk confirm button.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Tier thresholds from env (with defaults):
   - `ML_TIER_AUTOCONFIRM` (default `0.90`) → tier = `'auto_confirm'`
   - `ML_TIER_VERIFY` (default `0.70`) → tier = `'verify'` (between verify and auto_confirm)
   - Below `ML_TIER_VERIFY` → tier = `'flag'`
2. In suggestion response, include `tier` per field (derived from `confidence_score`; not persisted).
3. `POST /baselines/:baselineId/suggestions/bulk-confirm`: sets `suggestionAccepted=true` for all assignments in the baseline where `confidence_score >= ML_TIER_AUTOCONFIRM` and `suggestionAccepted IS NULL`. Emits audit log `baseline.suggestions.bulk-confirm` with count.
4. Frontend: "Confirm High-Confidence Fields" button visible when ≥1 auto-confirm field exists; keyboard shortcut `Shift+Enter`.
5. Update `tasks/codemapcc.md`.

**Checkpoint J1 — Verification**
- Manual: After generating suggestions, fields with `confidence_score >= 0.90` show tier `'auto_confirm'`.
- Manual: Click "Confirm High-Confidence Fields" → DB shows those assignments have `suggestionAccepted=true`.
- Manual: Keyboard `Shift+Enter` triggers the same action.
- Regression: Individual accept/modify/clear flows unaffected.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

## 9) Verification UI (P1 — depends on J1)

### K1 — Side-by-Side Verification Layout (Complexity: Medium)

**Problem statement**
The review page layout needs to surface fields alongside the PDF viewer in a spatial mirror arrangement, so the field list position matches document position, with bidirectional hover sync and tier-confidence indicators that don't interrupt reading flow.

**Files / Locations**
- Amend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` — restructure into two-panel layout; fetch flattened manifest on page load.
- New: `apps/api/src/baseline/dto/review-manifest.dto.ts` — response shape for the manifest endpoint.
- Amend: `apps/api/src/baseline/baseline.controller.ts` — add `GET /baselines/:baselineId/review-manifest`.
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — implement manifest assembly.
- New: `apps/web/app/components/ocr/VerificationPanel.tsx` — right-hand fields panel with spatial ordering and tier indicators.
- New: `apps/web/app/components/ocr/JumpBar.tsx` — 12px right-edge strip with proportional tier-coloured dots for fast navigation.
- Amend: existing `PdfDocumentViewer` usage — pass `highlightRegion` and `onRegionHover` props for bbox overlay and reverse sync.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. **Flattened JSON manifest** — `GET /baselines/:baselineId/review-manifest` returns a single response containing everything the review UI needs; no per-field requests during interaction:
   ```json
   {
     "baselineId": "uuid",
     "attachmentId": "uuid",
     "pageCount": 3,
     "fields": [
       {
         "fieldKey": "invoice_total",
         "suggestedValue": "1234.56",
         "confidenceScore": 0.92,
         "tier": "auto_confirm",
         "zone": "footer",
         "boundingBox": { "x": 800, "y": 950, "width": 100, "height": 20 },
         "pageNumber": 1,
         "extractionMethod": "layoutlmv3",
         "suggestionAccepted": null
       }
     ],
     "similarContext": {
       "invoice_total": [
         { "value": "1100.00", "confirmedAt": "2026-01-15", "similarity": 0.94 }
       ]
     },
     "tierCounts": { "flag": 3, "verify": 5, "auto_confirm": 12 }
   }
   ```
   The `similarContext` map is pre-fetched at manifest load time (not on hover) so the reviewer context panel is zero-request. Limit to top-3 similar values per field.
2. Review page (`page.tsx`) fetches manifest once on load; stores in local state. All subsequent hover, highlight, and scroll interactions operate purely on local state — no further API calls until a field is accepted/modified/cleared.
3. When at least one field has a non-null `bounding_box`, activate verification mode layout:
   - Left 50%: `PdfDocumentViewer` with bbox highlight overlay driven by local state.
   - Right 50%: `VerificationPanel` + `JumpBar`.
4. **Spatial ordering**: fields sorted by `pageNumber ASC`, then `boundingBox.y ASC` from manifest. Fields without a bounding box rendered below a divider at panel bottom.
5. **Header bar**: shows `tierCounts` from manifest; "Confirm All High-Confidence" bulk button.
6. **Tier confidence display per field card**: 3px bottom border + corner icon (see original K1 spec).
7. **Bidirectional hover sync** on local state: field card hover → PDF highlight; PDF region click → card scroll + pulse.
8. **Jump bar** (`JumpBar.tsx`): proportional tier-coloured dots; click scrolls panel; all from local state.
9. If no spatial data: render original three-panel layout unchanged.
10. Update `tasks/codemapcc.md`.

**Checkpoint K1 — Verification**
- Manual: `GET /baselines/:baselineId/review-manifest` returns all fields, `similarContext`, and `tierCounts` in a single response.
- Manual: Open review page → browser Network tab shows exactly one manifest request on load; zero additional requests during hover/highlight interactions.
- Manual: Two-panel layout renders; fields appear in document reading order (top-to-bottom, page-by-page).
- Manual: Hover a field card → PDF viewer highlights the corresponding bbox; scrolls to correct page — no network request fires.
- Manual: Hover/click a bbox region on PDF → matching field card scrolls into view in panel and pulses — no network request fires.
- Manual: Verify jump bar dots appear at correct proportional positions; clicking a dot scrolls panel to that field.
- Manual: Header bar shows correct per-tier counts matching `tierCounts` from manifest.
- Manual: "Confirm All High-Confidence" bulk button accepts auto_confirm fields.
- Manual: Open review page for an old baseline without bbox data → original layout renders, no errors.
- Regression: All existing correction, confirm, and suggestion flows still work.

**Estimated effort:** 5–6 hours
**Complexity flag:** Medium

---

### K2 — Keyboard Flow (Complexity: Simple)

**Problem statement**
Reviewers need keyboard navigation to process fields without switching between mouse and keyboard.

**Files / Locations**
- Amend: `apps/web/app/components/ocr/VerificationPanel.tsx` — add keyboard event handlers.

**Implementation plan**
1. `Tab` / `Shift+Tab`: move focus to next/previous field (spatial order matching panel order: pageNumber ASC, boundingBox.y ASC).
2. `Enter`: accept currently focused suggestion (`suggestionAccepted=true`).
3. `Escape`: skip field (move focus without accepting).
4. `Shift+Enter`: trigger bulk confirm (same as header bar button per K1 step 3).
5. `F`: jump to next flag-tier field (skip verify and auto_confirm fields); wraps to first flag field after last.
6. Keyboard hints bar at panel footer showing: `Tab next · Enter accept · Esc skip · F next flag · Shift+Enter confirm all`.

**Checkpoint K2 — Verification**
- Manual: Tab through fields in spatial order; PDF viewer highlights bbox with each focus change.
- Manual: Press Enter on a verify field → `suggestionAccepted=true` in DB.
- Manual: Press Escape → focus moves to next field, DB unchanged.
- Manual: Press F → focus jumps to next flag field, skipping verify/auto_confirm; wraps correctly.
- Manual: Press Shift+Enter → all auto_confirm fields accepted.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

## 10) LayoutLMv3 Fine-Tuning Pipeline (P1 — depends on I1, F1/F2)

### L1 — training-worker Container Setup (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
Fine-tuning must not block the inference service. A dedicated `training-worker` container handles training runs asynchronously.

**Files / Locations**
- New: `apps/training-worker/main.py` — FastAPI app with `POST /train` and `GET /health`.
- New: `apps/training-worker/finetune.py` — LayoutLMv3 fine-tuning script.
- New: `apps/training-worker/generate_synthetic.py` — spatially-aware synthetic data generator.
- New: `apps/training-worker/requirements.txt` — `fastapi`, `uvicorn`, `transformers`, `datasets`, `torch`, `Pillow`, `numpy`.
- New: `apps/training-worker/training-worker.Dockerfile` — python:3.11 (GPU-compatible), backend network only, port 7000.
- Amend: `docker-compose.yml` — add `training-worker` service; mount model volume; no host port mapping.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. `GET /health` returns `{status: "ok"}`.
2. `POST /train` accepts `{jobId, exportPath, syntheticPath?, syntheticRatio?, candidateVersion, epochs?, batchSize?, learningRate?}`.
3. Runs `finetune.py` in a background thread; calls API callback on success/failure.
4. Model volume mounted at `/app/models/`; checkpoints written to `/app/models/<candidateVersion>/`.
5. Update `tasks/codemapcc.md`.

**Checkpoint L1 — Verification**
- Manual: `docker compose up training-worker` starts; `GET /health` returns `{status:"ok"}`.
- Manual: `POST /train` with a minimal export JSON triggers the script and writes a checkpoint directory.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### L2 — LayoutLMv3 Fine-Tuning Script (Complexity: Complex)

**Problem statement**
The fine-tuning script must load spatially-annotated training examples, apply augmentation, and produce a versioned LayoutLMv3 checkpoint with metrics.

**Files / Locations**
- New: `apps/training-worker/finetune.py`.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Load `extraction_training_examples` export JSON (rows: `{tokens, bboxes, zoneLabel, fieldKey, isSynthetic}`).
2. Optional: accept `--synthetic` file and `--synthetic-ratio` (default 0.2, max 0.3); mix synthetic into training set only.
3. Split 80/10/10 with fixed seed; validation/test exclude `isSynthetic=true` rows.
4. Data augmentation on training set (image-level if rendered page images available, otherwise token-level bbox jitter ±5px).
5. Fine-tune `LayoutLMv3ForTokenClassification` with HuggingFace `Trainer`; field labels mapped to class indices.
6. Evaluate on test set: per-field F1, zone accuracy, overall accuracy.
7. Save checkpoint to `/app/models/<candidateVersion>/`; write `metrics.json` alongside.
8. Print metrics to stdout; exit 0 on success.

**Checkpoint L2 — Verification**
- Manual: `python finetune.py --input /data/export.json --output /app/models/layoutlmv3-v2026-02-22 --epochs 1 --batch-size 4` exits 0; `/app/models/layoutlmv3-v2026-02-22/` contains `config.json` and `metrics.json`.
- Output: console prints per-field F1 and overall accuracy.
- Synthetic rows excluded from validation/test metrics.

**Estimated effort:** 4–5 hours
**Complexity flag:** Complex

---

### L3 — Spatially-Annotated Training Data Export (Complexity: Medium)

**Problem statement**
The existing training data export (`GET /admin/ml/training-data`) outputs text pairs only. LayoutLMv3 training requires bounding boxes and zone labels.

**Files / Locations**
- Amend: `apps/api/src/ml/ml-training-data.service.ts` — add spatial export query.
- Amend: `apps/api/src/ml/ml-training-data.controller.ts` — add `GET /admin/ml/training-data/spatial`.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. New endpoint `GET /admin/ml/training-data/spatial` (admin-only, same auth guards).
2. Query `extraction_training_examples` (from F1 schema) joined to `baseline_field_assignments` and `extracted_text_segments`.
3. Return per row: `{tokens: string[], bboxes: [[x,y,w,h]], zoneLabel, fieldKey, isSynthetic}` with bboxes normalised 0–1000.
4. Apply same A2 quality filters as the existing text export.
5. Update `tasks/codemapcc.md`.

**Checkpoint L3 — Verification**
- Manual: `GET /admin/ml/training-data/spatial?startDate=...&endDate=...` returns JSON with `tokens`, `bboxes`, `zoneLabel` per row.
- DB: row count matches `extraction_training_examples` within date range after quality filters.
- Regression: Existing `GET /admin/ml/training-data` (text pairs) unaffected.

**Estimated effort:** 2 hours
**Complexity flag:** Medium

---

### L4 — Populate extraction_training_examples on Assignment (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-23

**Problem statement**
Training examples must be captured automatically when field assignments are saved with spatial data.

**Files / Locations**
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — insert into `extraction_training_examples` when spatial fields present.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. In `upsertAssignment()`, after saving `baseline_field_assignments`, check if `bounding_box`, `zone`, and `extraction_method` are all non-null on the saved row.
2. If yes: insert into `extraction_training_examples` with `isSynthetic=false`.
3. No change to existing audit or correction flows; this is a silent append-only side effect.
4. Update `tasks/codemapcc.md`.

**Checkpoint L4 — Verification**
- Manual: Accept a suggestion that has `bounding_box` populated → `extraction_training_examples` gains a new row.
- Manual: Manual assignment (no spatial data) → no row inserted into `extraction_training_examples`.
- Regression: Assignment upsert audit logs unchanged.

**Estimated effort:** 1 hour
**Complexity flag:** Simple

---

### L5 — Synthetic Data Generator (Spatial) (Complexity: Medium)

**Problem statement**
When real corrections are insufficient, synthetic spatially-annotated training examples must be available to bootstrap LayoutLMv3.

**Files / Locations**
- New: `apps/training-worker/generate_synthetic.py`.
- New: `apps/training-worker/templates.json` — field-key → label variants, value patterns, bbox grid positions, zone hints.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Templates define per field: `fieldKey`, `labelVariants[]`, `valuePatterns[]`, `zonHint`, `bboxGrid` (typical position range as fraction of page).
2. Generate `count` samples deterministically with `--seed`; each row: `{tokens, bboxes: [[x,y,w,h]], zoneLabel, fieldKey, assignedValue, isSynthetic: true}`.
3. Bboxes synthesised from `bboxGrid` ranges with small random jitter (seeded).
4. OCR-style noise transforms on tokens (0/O, 1/l, punctuation drop) using stdlib only.
5. Output JSON array; never produce train/test splits — raw samples only.
6. CLI: `python generate_synthetic.py --templates templates.json --output synthetic.json --count 200 --seed 42`.

**Checkpoint L5 — Verification**
- Manual: `python generate_synthetic.py --count 200 --seed 42` outputs JSON array of length 200 with `isSynthetic=true` on each row.
- Output: each row has `tokens`, `bboxes`, `zoneLabel`, `fieldKey`.

**Estimated effort:** 2 hours
**Complexity flag:** Medium

---

## 11) Execution Order (Do Not Skip)

**Critical path:**
1. **F1** New tables migration — no dependencies.
2. **F2** Amend existing tables — depends on F1 (same migration run is fine; run after F1 definitions added).
3. **G1** Preprocessor container — no dependencies (parallel with F1/F2).
4. **H1** PyMuPDF OCR routing — depends on G1 (preprocessor must be running).
5. **C1** A/B model selection — no schema dependencies (uses existing `ml_model_versions`).
6. **C2** Suggestion outcome tracking — no schema dependencies.
7. **I1** LayoutLMv3 model loading — depends on F1/F2 (uses `extraction_models` table); can start parallel with H1.
8. **I2** Zone classifier — depends on I1.
9. **I3** Updated field suggestion service — depends on I1/I2 and F2 (new columns must exist).
10. **L4** Populate extraction_training_examples — depends on F1/I3 (table and new columns must exist).
11. **J1** Confidence tier logic + bulk confirm — depends on I3.
12. **K1** Verification UI layout — depends on J1.
13. **K2** Keyboard flow — depends on K1.
14. **D3** Volume trigger + job state — depends on C1/C2 (qualified correction counting uses same filters).
15. **E1** Performance API — depends on C2 and existing B1.
16. **E2** Performance UI — depends on E1 and D5.
17. **D4** Assisted training run — depends on D3 and L1/L2.
18. **D5** Activation gates — depends on E1 and D4.
19. **L1** training-worker container — no external dependencies (parallel with K1).
20. **L3** Spatial training data export — depends on L4 (examples table must have rows to export).
21. **L5** Synthetic data generator — depends on L1 (same container).
22. **L2** LayoutLMv3 fine-tuning script — depends on L1/L3/L5.

**Parallel opportunities:**
- F1/F2 and G1 can run in parallel.
- C1/C2 can run in parallel with I1/I2.
- L1 can run in parallel with K1/K2.
- D3 can run in parallel with I1/I2/I3 once C1/C2 are done.
- E1 can run in parallel with D3/D4 once C2 is done.

---

## 12) Definition of Done

**Feature Completeness:**
- A/B routing deterministically assigns models and persists outcomes (C1/C2).
- Performance dashboard shows per-model metrics, gate status, and recommendation (E1/E2).
- Activation is gated by offline (≥2% accuracy delta) and online (≥5% acceptance delta, ≥1000 suggestions) thresholds (D5).
- Assisted auto-learning runs globally on volume-only trigger (≥1000 qualified corrections) and auto-registers candidate models (D3/D4).
- All five new schema tables exist and all amended column additions are live (F1/F2).
- Preprocessor container running; skewed/shadowed images corrected before OCR (G1).
- Digital PDFs use text layer directly; scanned PDFs route through preprocessor (H1).
- LayoutLMv3 loaded and serving suggestions with `zone`, `bounding_box`, `extraction_method` per field (I1/I2/I3).
- Confidence tiers (auto_confirm/verify/flag) computed and surfaced in UI (J1).
- Side-by-side verification layout with PDF auto-scroll to flagged field region (K1/K2).
- Bulk confirm available for auto_confirm tier fields (J1/K2).
- training-worker container running; LayoutLMv3 fine-tuning script produces versioned checkpoint (L1/L2).
- Spatially-annotated training data export endpoint available (L3).
- Training examples captured on assignment (L4).
- Synthetic spatial data generator available (L5).

**Data Integrity:**
- `extraction_training_examples` rows are append-only; no updates.
- Exactly one active model per `modelName` at any time in `extraction_models`.
- New columns on `baseline_field_assignments` and `attachment_ocr_outputs` are nullable; no existing rows broken.

**No Regressions:**
- `docker compose exec -T api npm run build` exits 0.
- `docker compose exec -T web npm run build` exits 0.
- Review page still supports manual assignment and suggestions for baselines without spatial data.
- Existing `/admin/ml/metrics` endpoint still works.
- Existing training data export (`/admin/ml/training-data`) still works.

**Documentation:**
- `tasks/codemapcc.md` updated with every new file, endpoint, and route.
- `tasks/features.md` v8.9 and v8.10 sections reflect actual state.
- `tasks/executionnotes.md` updated with completion evidence (append-only; newest entry last).

---

## 13) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (run after every task):**
- [ ] API builds: `cd apps/api && npm run build` → no errors.
- [ ] Web builds: `cd apps/web && npm run build` → exit code 0.
- [ ] Login flow works: `/login` → credentials → redirects to `/`.

**Task Group C — A/B Testing:**
- [ ] A/B routing deterministic: run suggestions for two baselines → logs show alternating `abGroup` values.
- [ ] Suggestion outcome tracking: accept one, modify one, clear one → DB shows `suggestionAccepted` true/false/null.

**Task Group D — Assisted Auto-Learning:**
- [ ] Volume trigger: <1000 qualified corrections → no job; ≥1000 → exactly one queued job.
- [ ] Training run: trigger job → ML service completes → candidate registered with `isActive=false`.
- [ ] Activation gates: candidate below thresholds → Activate button disabled; above thresholds → enabled.

**Task Group E — Performance Dashboard:**
- [ ] Performance API: `GET /admin/ml/performance?startDate=...&endDate=...` returns `models`, `trend`, `recommendation`.
- [ ] Performance UI: `/admin/ml/performance` renders cards, table, trend chart.

**Task Group F — Schema:**
- [ ] All five new tables present in DB.
- [ ] New columns on `baseline_field_assignments` and `attachment_ocr_outputs` present and nullable.

**Task Group G/H — Preprocessor + PyMuPDF:**
- [ ] Preprocessor health: `GET http://preprocessor:6000/health` returns `{status:"ok"}`.
- [ ] Digital PDF: upload → metadata shows `extraction_path='text_layer'`.
- [ ] Scanned PDF: upload → metadata shows `extraction_path='ocr_preprocessed'`; preprocessor logs show request.

**Task Group I — LayoutLMv3:**
- [ ] Suggestions include `zone`, `bounding_box`, `extraction_method` in response.
- [ ] DB: `baseline_field_assignments` has `zone`, `bounding_box`, `confidence_score` populated after suggestion generation.

**Task Group J/K — Tiers + Verification UI:**
- [ ] High-confidence fields (≥0.90) show `auto_confirm` tier; "Confirm High-Confidence Fields" button visible.
- [ ] Bulk confirm: button click → all auto_confirm fields set `suggestionAccepted=true`.
- [ ] Two-panel layout renders when spatial data present.
- [ ] Clicking flag field → PDF viewer scrolls to bbox region.
- [ ] Tab, Enter, Escape, Shift+Enter keyboard shortcuts all function.

**Task Group L — Training Pipeline:**
- [ ] training-worker health: `GET http://training-worker:7000/health` returns `{status:"ok"}`.
- [ ] Fine-tuning: `POST /train` with minimal export → checkpoint directory created; `metrics.json` written.
- [ ] Spatial export: `GET /admin/ml/training-data/spatial` returns rows with `tokens`, `bboxes`, `zoneLabel`.
- [ ] Training capture: accept spatial suggestion → `extraction_training_examples` row inserted.
- [ ] Synthetic generator: `python generate_synthetic.py --count 200 --seed 42` → 200 rows with `isSynthetic=true`.

**Integration (run after all tasks):**
- [ ] End-to-end: upload PDF → OCR → generate suggestions (LayoutLMv3) → review tiers in verification UI → bulk confirm auto_confirm → correct verify fields → flag fields manually confirmed → baseline confirmed.
- [ ] Training loop: export spatial data → run fine-tuning → register candidate → activate (if gates met) → new suggestions use new model.

---

## 14) Post-Completion Checklist

- [ ] Update `tasks/executionnotes.md` (append-only; newest entry must be last):
  - [ ] Completion date
  - [ ] What was built (reference task IDs)
  - [ ] Deviations from plan (with reasons)
  - [ ] Lessons learned (add to `tasks/lessons.md` if applicable)
- [ ] Update `tasks/codemapcc.md` with all new file paths, endpoints, and routes.
- [ ] Update `tasks/features.md` v8.9 status to ✅ Complete; v8.10 status to ✅ Complete.
- [ ] Run full regression suite.
- [ ] Tag commit: `git tag v8.10 -m "Optimal Extraction Accuracy complete"`

---

---

## PART 3 — v8.11 RAG + Semantic Search

**Prerequisite:** v8.10 complete. Minimum 200 confirmed baselines in production before M4 (extraction confidence RAG) is enabled.

---

## 15) pgvector Infrastructure (P0 — all v8.11 work depends on this)

### F3 — pgvector Migration + baseline_embeddings Table (Complexity: Simple)

**Problem statement**
All RAG and semantic search capabilities require a vector store. pgvector on the existing Postgres instance is sufficient — no new database needed. This migration adds the extension and the embeddings table.

**Files / Locations**
- Amend: `docker-compose.yml` — change Postgres image to pgvector-enabled variant.
- Amend: `apps/api/package.json` — add `drizzle-orm` pgvector custom type helper (no new package needed; uses `customType` from `drizzle-orm/pg-core`).
- Backend: `apps/api/src/db/schema.ts` — define custom `vector` column type; add `baseline_embeddings` table definition.
- Backend: `apps/api/drizzle/` — generate and run migration SQL.
- Docs: `tasks/codemapcc.md` — document new table.

**Implementation plan**
1. **Amend `docker-compose.yml`**: change Postgres image from `postgres:16-alpine` to `pgvector/pgvector:pg16`. This is the official pgvector image — drop-in replacement for Postgres 16 with the extension pre-installed. Without this change, `CREATE EXTENSION vector` will fail at runtime.
   ```yaml
   # before
   image: postgres:16-alpine
   # after
   image: pgvector/pgvector:pg16
   ```
   Also add container resource limits to `ocr-worker` and `preprocessor` services to prevent memory/pixel bomb DoS. A 100KB compressed PDF can decompress into gigabytes of bitmap during PyMuPDF/OpenCV rendering — without limits, this OOMs the host:
   ```yaml
   ocr-worker:
     deploy:
       resources:
         limits:
           memory: 4g
           pids: 256
   preprocessor:
     deploy:
       resources:
         limits:
           memory: 2g
           pids: 128
   ```
   The `pids` limit prevents fork bombs via malicious PDFs that trigger subprocess spawning. Memory limits ensure the OOM killer targets only the offending container, not the host or other services.
2. **Define custom `vector` column type** in `apps/api/src/db/schema.ts`. `drizzle-orm` does not have a built-in `vector(n)` column type — define it using `customType`:
   ```ts
   import { customType } from 'drizzle-orm/pg-core';
   const vector = (name: string, dimensions: number) =>
     customType<{ data: number[]; driverData: string }>({
       dataType() { return `vector(${dimensions})`; },
       fromDriver(val: string) { return JSON.parse(val); },
       toDriver(val: number[]) { return JSON.stringify(val); },
     })(name);
   ```
3. **Enable pgvector extension** in migration SQL (add as raw SQL in migration file):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. **`field_library` already has a `version` column** (integer, increments on `characterType` change — confirmed in `codemapcc.md` schema map). No migration needed for `field_library` itself. Use this existing `version` as the field schema version throughout — do not add a redundant `schema_version` column. Document: when an admin changes a field's `type` or validation rules, `field_library.version` must be incremented; existing confirmed baselines retain their prior version snapshot in `baseline_embeddings.field_schema_version`.
5. **Add `baseline_embeddings` table** in `schema.ts`:
   - `id` uuid pk
   - `baseline_id` uuid fk `extraction_baselines` on delete cascade
   - `field_key` text — `'document'` for document-level vectors, or specific field key for field-level vectors
   - `field_schema_version` integer not null default 1 — snapshot of `field_library.schema_version` at the time this embedding was created. RAG queries filter `WHERE field_schema_version = currentSchemaVersion` to exclude embeddings built against superseded field definitions.
   - `embedding` vector(384) — MiniLM output dimension (use custom type from step 2)
   - `embedding_model_version` text — embedding model identifier (e.g. `'all-MiniLM-L6-v2'`); required for vector versioning. When the embedding model changes, old rows with a different `embedding_model_version` must be re-embedded before RAG queries will be reliable.
   - `bbox_centroid_x` decimal(6,4) nullable — normalised x centroid of document-level bbox (0–1000 scale); null for field-level embeddings.
   - `bbox_centroid_y` decimal(6,4) nullable — normalised y centroid; null for field-level embeddings.
   - `document_type_id` uuid nullable fk `document_types` — populated from `attachment_ocr_outputs.document_type_id`; used for metadata-filtered retrieval.
   - `confirmed_at` timestamp
   - `created_at` timestamp default now()
5. **Add HNSW index** (not IVFFlat) in migration SQL:
   ```sql
   CREATE INDEX ON baseline_embeddings
     USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
   ```
   HNSW is preferred over IVFFlat for this use case: it does not require a minimum row count to build, maintains consistent recall as the table grows to 100k+ rows, and has more predictable latency. IVFFlat degrades as the dataset grows and requires periodic `VACUUM` + rebuild.
6. **Add composite B-tree index** on the metadata filter columns in migration SQL:
   ```sql
   CREATE INDEX ON baseline_embeddings (document_type_id, embedding_model_version, field_schema_version);
   ```
   Without this, Postgres must scan all rows before applying the HNSW vector operator. With it, the planner prunes the row-space using the B-tree index first, then applies HNSW distance math only on the surviving partition — critical once the table exceeds tens of thousands of rows. The three-column order matches the selectivity of M2/M4 query filters: `document_type_id` is most selective (small set of types), then `embedding_model_version`, then `field_schema_version`.
7. Run `npm run drizzle:generate && npm run drizzle:migrate`.
8. Update `tasks/codemapcc.md`.

**Checkpoint F3 — Verification**
- Docker: `docker compose up db` starts cleanly with `pgvector/pgvector:pg16` image.
- DB: `SELECT * FROM pg_extension WHERE extname = 'vector'` returns a row.
- DB: `\d field_library` shows `schema_version` column (integer, default 1).
- DB: `\d baseline_embeddings` shows all columns including `field_schema_version`, `embedding_model_version`, `bbox_centroid_x`, `bbox_centroid_y`, `document_type_id`.
- DB: HNSW index present: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'baseline_embeddings'` shows both `hnsw` vector index and composite B-tree index on `(document_type_id, embedding_model_version, field_schema_version)`.
- Build: `npm run build` exits 0.
- Regression: Existing DB data and all other tables unaffected by image change.

**Estimated effort:** 2 hours
**Complexity flag:** Simple

---

## 16) Embedding Pipeline (P0 — blocks M2, M3, M4)

### M1 — Embed on Confirm (Complexity: Medium)

**Problem statement**
When a baseline is confirmed, document-level and field-level embeddings must be generated and stored in `baseline_embeddings`. MiniLM (`all-MiniLM-L6-v2`) is reloaded in `ml-service` alongside LayoutLMv3 for this purpose — it is not used for field extraction (LayoutLMv3 handles that), only for embedding.

**Files / Locations**
- Amend: `apps/ml-service/requirements.txt` — restore `sentence-transformers`.
- Amend: `apps/ml-service/ml.Dockerfile` — pre-cache MiniLM model during build.
- Amend: `apps/ml-service/main.py` — add `POST /ml/embed` endpoint.
- Amend: `apps/ml-service/model.py` — load MiniLM alongside LayoutLMv3 for embedding only.
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — call `POST /ml/embed` after baseline confirm; persist result to `baseline_embeddings`.
- Amend: `apps/api/src/baseline/baseline.controller.ts` — trigger embed in confirm flow.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. In `ml-service/requirements.txt`: restore `sentence-transformers` (was removed in I1 when MiniLM was replaced for extraction; now needed again for embedding role only).
2. In `ml-service/ml.Dockerfile`: pre-cache MiniLM during image build, following the same pattern already used for LayoutLMv3. Add immediately after the existing LayoutLMv3 pre-cache line:
   ```dockerfile
   RUN HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 HF_HUB_DISABLE_TELEMETRY=1 \
       python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" \
       && rm -rf /root/.cache/pip
   ```
   Without this, the container sets `HF_HUB_OFFLINE=1` at runtime (line 17 of current Dockerfile) and MiniLM will fail to download on first use.
3. In `ml-service/model.py`: load `SentenceTransformer('all-MiniLM-L6-v2')` as a second model alongside LayoutLMv3. Used only for embedding, not field classification.
4. In `ml-service/model_registry.py`: add MiniLM warm-up alongside existing LayoutLMv3 warm-up — encode a dummy string `"warm-up"` on startup to force model load into memory before first real embed request. Without this, first embed call after container start will be slow.
4. `POST /ml/embed` accepts `{documentText: string, fields: [{fieldKey, value}]}`; returns `{documentEmbedding: float[], fieldEmbeddings: [{fieldKey, embedding: float[]}]}`.
5. Document embedding: encode full `documentText` with MiniLM → vector(384).
6. Field embeddings: encode `"[fieldKey]: [value]"` per field → vector(384) each.
7. In API confirm flow (`POST /attachments/:id/ocr/confirm`): after baseline status set to `'confirmed'`, call `POST /ml/embed` with extracted text and confirmed field assignments; insert rows into `baseline_embeddings`:
   - One `field_key='document'` row with `embedding_model_version='all-MiniLM-L6-v2'`, `field_schema_version=1` (document-level rows use version 1 by convention — no field-specific schema applies), `bbox_centroid_x/y` from the median bbox of confirmed field assignments (normalised 0–1000), `document_type_id` from `attachment_ocr_outputs.document_type_id`.
   - One row per confirmed field assignment with `field_key=fieldKey`, `embedding_model_version='all-MiniLM-L6-v2'`, `field_schema_version` = current `field_library.schema_version` for that `fieldKey` (read at insert time — snapshot the version in effect when the baseline was confirmed), `bbox_centroid_x/y=null`, `document_type_id=null`.
8. Embed call is fire-and-forget with error logging — confirm must not fail if embedding fails.
9. Update `tasks/codemapcc.md`.

**Vector versioning note:** `embedding_model_version` must be set on every row at insert time. When the embedding model is upgraded (e.g. from `all-MiniLM-L6-v2` to `bge-small`), query `SELECT COUNT(*) FROM baseline_embeddings WHERE embedding_model_version != 'new-model'` to identify stale rows. A background admin-triggered re-embedding job must update all stale rows before RAG queries return reliable results.

**Note — memory:** `ml-service` will carry both models simultaneously (~580MB total: LayoutLMv3-base ~500MB + MiniLM ~80MB). Acceptable on any server with ≥2GB RAM allocated to the container. Monitor on constrained environments.

**Checkpoint M1 — Verification**
- Build: `docker compose build ml-service` completes without error; MiniLM pre-cache step downloads and caches the model during build.
- Manual: `docker compose up ml-service` → startup logs show both LayoutLMv3 and MiniLM loaded; no HF Hub download attempted at runtime.
- Manual: Confirm a baseline → `baseline_embeddings` gains one `field_key='document'` row and N field-level rows.
- Manual: Confirm flow succeeds even if `ml-service` is temporarily unavailable (error logged, confirm not blocked).
- DB:
```sql
SELECT field_key, LEFT(embedding::text, 40) AS embedding_preview
FROM baseline_embeddings
WHERE baseline_id = '<BASELINE_ID>';
```
Expected: at least one `field_key='document'` row with non-null embedding.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

## 17) Semantic Search (P1 — depends on M1)

### M2 — Semantic Search Endpoint + UI (Complexity: Medium)

**Problem statement**
Users need to search across all confirmed extraction data using natural language queries. pgvector cosine similarity retrieves semantically relevant baselines; SQL filters narrow by structured fields.

**Files / Locations**
- New: `apps/api/src/search/search.controller.ts` — `GET /search/extractions`.
- New: `apps/api/src/search/search.service.ts` — pgvector similarity query + SQL filter chaining.
- New: `apps/api/src/search/search.module.ts` — register controller and service.
- Amend: `apps/api/src/app.module.ts` — import `SearchModule`.
- New: `apps/web/app/search/page.tsx` — search UI page.
- New: `apps/web/app/lib/api/search.ts` — `fetchExtractionSearch` helper.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. `GET /search/extractions` query params: `q` (text), `documentType` (optional uuid), `dateFrom` (optional), `dateTo` (optional), `limit` (default 20, max 100).
2. In `SearchService`:
   - Embed `q` via `POST /ml/embed` (document embedding only).
   - **Metadata-filtered pgvector query** — scope vector search to the relevant document type partition when `documentType` is provided. Searching within a typed partition eliminates cross-type noise (e.g. "Total" on an invoice vs "Total" on a utility bill are different fields). Set `hnsw.ef_search = 100` per session before querying to ensure recall stays accurate as the baseline library scales (default ef_search is typically equal to ef_construction=64, which degrades recall at >10k rows):
     ```sql
     SET LOCAL hnsw.ef_search = 100;
     SELECT b.id, b.attachment_id, b.confirmed_at,
            1 - (be.embedding <=> $1) AS similarity
     FROM baseline_embeddings be
     JOIN extraction_baselines b ON b.id = be.baseline_id
     JOIN attachments a ON a.id = b.attachment_id
     WHERE be.field_key = 'document'
       AND b.status = 'confirmed'
       AND a.user_id = $requestingUserId
       AND be.embedding_model_version = $currentEmbeddingModel
       AND be.field_schema_version = 1
       [AND be.document_type_id = $documentType]
       [AND b.confirmed_at >= $dateFrom]
       [AND b.confirmed_at <= $dateTo]
     ORDER BY be.embedding <=> $1
     LIMIT $limit;
     ```
   - `$currentEmbeddingModel` is read from env `EMBEDDING_MODEL_VERSION` (default `'all-MiniLM-L6-v2'`). Only rows with matching version are queried — stale embeddings from old model versions are automatically excluded.
   - For each result, fetch top confirmed field assignments for preview.
3. Response: `{results: [{baselineId, attachmentId, similarity, confirmedAt, documentTypeId, fieldPreview: [{fieldKey, value}]}]}`.
4. Frontend search page: text input + optional filters (date range, document type dropdown); renders result cards showing similarity score, document metadata, field value previews; links to review page.
5. Emit audit log `search.extractions` with query hash (not raw query), `documentType` filter if applied, and result count.
6. Update `tasks/codemapcc.md`.

**Checkpoint M2 — Verification**
- Manual: `GET /search/extractions?q=Acme+invoice` returns results ranked by similarity; top result is an Acme invoice baseline.
- Manual: `GET /search/extractions?q=total+amount&documentType=<invoice-type-id>` returns only invoice baselines; utility bill baselines not returned.
- Manual: `GET /search/extractions?q=total+amount&dateFrom=2026-01-01` filters results to date range.
- Manual: Search page renders results with field previews; clicking a result navigates to review page.
- Manual: Stale embeddings (different `embedding_model_version`) excluded from results.
- Regression: No existing endpoints affected.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

## 18) Reviewer Context Panel (P1 — depends on M1)

### M3 — Similar Past Extractions in VerificationPanel (Complexity: Simple)

**Problem statement**
When a reviewer is looking at a flagged or verify-tier field, seeing how the same field was confirmed on similar past documents reduces cognitive load and review time.

**Files / Locations**
- New: `apps/api/src/search/search.service.ts` — add `findSimilarBaselines(baselineId, fieldKey, limit)` method (reuses M2 service).
- Amend: `apps/api/src/baseline/baseline.controller.ts` — add `GET /baselines/:baselineId/similar-context`.
- Amend: `apps/web/app/components/ocr/VerificationPanel.tsx` — add "Similar past extractions" section per field card.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. `GET /baselines/:baselineId/similar-context?fieldKey=invoice_total&limit=3`:
   - Look up document embedding for `baselineId` from `baseline_embeddings`.
   - Query pgvector for top-3 nearest confirmed baselines (excluding current baseline).
   - For each, return the confirmed value for `fieldKey`.
   - Response: `{similar: [{baselineId, confirmedAt, value, similarity}]}`.
2. In `VerificationPanel`: for flag and verify tier fields, fetch similar context on card expand/focus.
3. Render as a small collapsed section "Similar past extractions (3)":
   - Each row: confirmed value + date confirmed + similarity percentage.
   - Read-only, no interaction — informational only.
4. Only fetch if `baseline_embeddings` has a document-level row for the baseline (skip gracefully if not).
5. Update `tasks/codemapcc.md`.

**Checkpoint M3 — Verification**
- Manual: Open review page for a baseline with embeddings → flag/verify field cards show "Similar past extractions" section with ≥1 result.
- Manual: If no similar baselines exist yet → section hidden, no error.
- Manual: Section is read-only; expanding it does not trigger any write.
- Regression: VerificationPanel renders correctly for baselines without embeddings.

**Estimated effort:** 2 hours
**Complexity flag:** Simple

---

## 19) Extraction Confidence RAG (P2 — depends on M1, requires ≥200 confirmed baselines)

### M4 — RAG Confidence Adjustment in ml-service (Complexity: Medium)

**Problem statement**
After LayoutLMv3 produces a suggestion, retrieving confirmed values from similar past baselines provides a secondary signal. Agreement boosts confidence; disagreement penalises it. This is feature-flagged and only enabled when corpus is sufficient.

**Files / Locations**
- Amend: `apps/ml-service/main.py` — add RAG confidence adjustment pass after LayoutLMv3 inference.
- New: `apps/ml-service/rag.py` — pgvector retrieval + confidence adjustment logic.
- Docs: `tasks/codemapcc.md`.

**Rules**
- Feature flag: `RAG_CONFIDENCE_ENABLED` env var (default `false`). Do not enable until ≥200 confirmed baselines exist.
- Adjustment cap: confidence boost max `+0.10`; penalty max `-0.15`. Never push above `1.0` or below `0.0`.
- RAG does not change the suggested value — only the confidence score.
- If pgvector query fails or returns no results, skip adjustment silently.

**Implementation plan**
0. Verify `psycopg2-binary` is present in `apps/ml-service/requirements.txt`. If absent, add it — it is an already-approved dependency used by the API service. Required for direct pgvector queries from `rag.py`.
1. `rag.py`: given `{documentEmbedding, fieldKey, suggestedValue, documentTypeId}`:
   - **Metadata-filtered retrieval**: query `baseline_embeddings` scoped by `document_type_id` and `embedding_model_version` to prevent cross-type noise and stale vector interference. Set `hnsw.ef_search = 100` per session before querying — default ef_search equals ef_construction (64) and degrades recall at scale:
     ```sql
     SET LOCAL hnsw.ef_search = 100;
     SELECT be.baseline_id,
            1 - (be.embedding <=> $documentEmbedding) AS similarity
     FROM baseline_embeddings be
     JOIN extraction_baselines b ON b.id = be.baseline_id
     JOIN attachments a ON a.id = b.attachment_id
     WHERE be.field_key = $fieldKey
       AND a.user_id = $requestingUserId
       AND be.embedding_model_version = $currentEmbeddingModel
       AND be.field_schema_version = $currentFieldSchemaVersion
       [AND be.document_type_id = $documentTypeId]
     ORDER BY be.embedding <=> $documentEmbedding
     LIMIT 5;
     ```
   - If `documentTypeId` is null (document type not yet classified), omit the `document_type_id` filter — fall back to unscoped retrieval.
   - For each retrieved baseline, fetch confirmed value for `fieldKey` from `baseline_field_assignments`.
   - Compute agreement ratio: fraction of retrieved values that match `suggestedValue` (exact match after normalisation — strip whitespace, lowercase, remove currency symbols).
   - `agreement_ratio >= 0.6` → boost `+0.10 * agreement_ratio`.
   - `agreement_ratio <= 0.2` → penalty `-0.15 * (1 - agreement_ratio)`.
   - `0.2 < agreement_ratio < 0.6` → no adjustment.
2. In `main.py` `POST /ml/suggest-fields`: after LayoutLMv3 inference, if `RAG_CONFIDENCE_ENABLED=true`, call `rag.py` per suggestion; pass `documentTypeId` from request payload; apply adjusted confidence score.
3. Add `ragAdjustment` float to each suggestion in response (nullable; null if RAG disabled or no results).
4. Merge RAG results into the existing `llm_reasoning` inference trace (written by I3). Update the null-initialised RAG fields in the trace: `{ragAdjustment: float, ragRetrievedCount: int, documentTypeScoped: bool, fieldSchemaVersion: int}`. The full trace then covers the complete causal chain — OCR → model → DSPP → type validation → RAG — in a single queryable JSON column. This means any extraction failure ("why was Total missed?") can be diagnosed with a single DB query without re-running inference.
5. Update `tasks/codemapcc.md`.

**Checkpoint M4 — Verification**
- Manual: With `RAG_CONFIDENCE_ENABLED=false` → suggestions unchanged; `ragAdjustment=null`.
- Manual: With `RAG_CONFIDENCE_ENABLED=true`, `documentTypeId` set, and matching similar baselines of same type → `ragAdjustment` non-null; adjusted confidence within bounds; `documentTypeScoped=true` in reasoning.
- Manual: With `RAG_CONFIDENCE_ENABLED=true`, `documentTypeId` null → unscoped retrieval used; `documentTypeScoped=false` in reasoning.
- Manual: pgvector unavailable → suggestions still returned, `ragAdjustment=null`, error logged.
- Manual: RAG query for User A must not return baselines confirmed by User B — verify `a.user_id` filter is applied by confirming a baseline as User B, then running RAG as User A and checking the baseline does not appear in retrieved results.
- DB: `llm_reasoning` on adjusted assignments contains `{ragAdjustment: float, retrievedCount: int, documentTypeScoped: bool, fieldSchemaVersion: int}`.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

## 20) v8.11 Execution Order

1. **F3** pgvector migration — no dependencies (run before any M task).
2. **M1** Embed on confirm — depends on F3.
3. **M2** Semantic search — depends on M1 (needs embeddings in DB to be useful).
4. **M3** Reviewer context panel — depends on M1; can run in parallel with M2.
5. **M4** Extraction confidence RAG — depends on M1; feature-flagged; enable only when ≥200 confirmed baselines exist.

**Parallel opportunities:**
- M2 and M3 can be built in parallel once M1 is done.
- M4 can be built in parallel with M2/M3 but must remain disabled until corpus threshold is met.

---

## 21) v8.11 Definition of Done

**Feature Completeness:**
- `pgvector` extension enabled; `baseline_embeddings` table present with HNSW index; `embedding_model_version`, `bbox_centroid_x/y`, `document_type_id` columns present (F3).
- Confirming a baseline generates and stores document-level and field-level embeddings with `embedding_model_version` set (M1).
- `GET /search/extractions` returns similarity-ranked confirmed baselines; metadata filter by `documentType` scopes results correctly; stale embeddings excluded by version filter (M2).
- Search UI page renders results and links to review page (M2).
- Reviewer context panel shows similar past confirmed values for flag/verify fields; pre-fetched in manifest (M3).
- Review page loads via single manifest request (`GET /baselines/:id/review-manifest`); zero additional requests during hover/highlight (K1).
- RAG confidence adjustment implemented, metadata-filtered by `document_type_id`, and feature-flagged behind `RAG_CONFIDENCE_ENABLED` (M4).

**Data Integrity:**
- Embedding failure never blocks baseline confirm.
- `baseline_embeddings` rows cascade-delete when baseline is deleted.
- RAG never mutates suggested values — confidence score only.
- All embeddings carry `embedding_model_version` — stale rows identifiable by version mismatch query.

**No Regressions:**
- Confirm flow works without `ml-service` running (embedding is fire-and-forget).
- `VerificationPanel` renders correctly for baselines without embeddings.
- All v8.10 endpoints and flows unaffected.

**Documentation:**
- `tasks/codemapcc.md` updated with all new files, endpoints, and the `baseline_embeddings` table.
- `tasks/features.md` v8.11 section reflects actual state.

---

## 22) Post-Completion Checklist (v8.11)

- [ ] Update `tasks/executionnotes.md` (append-only).
- [ ] Update `tasks/codemapcc.md` with all new file paths and endpoints.
- [ ] Update `tasks/features.md` v8.11 status to ✅ Complete.
- [ ] Enable `RAG_CONFIDENCE_ENABLED=true` only after confirming ≥200 baselines in DB.
- [ ] Tag commit: `git tag v8.11 -m "RAG + Semantic Search + Hardening complete"`

---

---

## PART 4 — Data Governance Hardening

**Prerequisite:** v8.10 complete. These tasks harden the training pipeline and field library integrity. N1 should be completed before any LayoutLMv3 fine-tuning run is activated in production.

---

## 23) Golden Set Infrastructure (P0 — must precede first production model activation)

### N1 — Golden Set Repository + D5 Gate Integration (Complexity: Medium)

**Problem statement**
The D5 activation gate currently benchmarks only on recent test data, which can be contaminated by confirmation bias or vendor skew. A static, air-gapped Golden Set stored in the repository provides a regression-proof benchmark that no production user can corrupt.

**Files / Locations**
- New: `golden_set/` directory in repo root — JSON files per document type.
- New: `golden_set/README.md` — governance rules, entry format, PR-only update policy.
- New: `golden_set/invoices.json` — initial invoice entries (admin-curated, not from confirm flow).
- Amend: `apps/api/src/ml/ml-performance.service.ts` — load Golden Set from filesystem; run candidate model; compute accuracy delta.
- Amend: `apps/api/src/ml/ml-models.service.ts` — block activation if Golden Set gate fails.
- Amend: `apps/web/app/admin/ml/performance/page.tsx` — display Golden Set gate status and accuracy scores.
- Docs: `tasks/codemapcc.md`.

**Golden Set entry format:**
```json
[
  {
    "id": "gs-invoice-001",
    "documentType": "invoice",
    "sourceDescription": "Standard UK invoice, Vendor A, 2024",
    "fields": [
      { "fieldKey": "invoice_total", "expectedValue": "1234.56", "fieldType": "currency" },
      { "fieldKey": "invoice_date", "expectedValue": "2024-03-15", "fieldType": "date" }
    ]
  }
]
```

**Governance rules (also in `golden_set/README.md`):**
1. Entries are created manually by admin/lead only — never via the confirm flow.
2. All additions require a PR with commit message describing the schema/edge case covered.
3. No automated process may write to `golden_set/`.
4. Run DSPP cleaning + type validation on `expectedValue` before adding an entry — entries must be clean.
5. Target: 200–500 entries covering all supported document types and known edge cases.

**Implementation plan**
1. Create `golden_set/` directory with `README.md` and initial `invoices.json` (start with ≥10 manually curated entries).
2. In `MlPerformanceService.getGateStatus()`: load all `golden_set/*.json` files at gate-check time (not cached — always read from disk to pick up new entries without restart).
3. For each Golden Set entry: call `POST /ml/suggest-fields` on the candidate model with the entry's field text; compare top suggestion per `fieldKey` to `expectedValue` (exact match after DSPP cleaning); compute `candidateAccuracy = correct / total`.
4. Repeat step 3 for the currently active model → `activeAccuracy`.
5. Golden Set gate: `candidateAccuracy >= activeAccuracy`. If regression (candidate < active), gate fails regardless of offline/online gate results.
6. If `golden_set/` is empty or all files are empty: log warning `ml.golden_set.empty`, skip gate, proceed with other gates.
7. Return `{goldenSetGateMet, goldenSetCandidateAccuracy, goldenSetActiveAccuracy, goldenSetEntryCount, goldenSetEmpty}` in gate status response.
8. Frontend: show Golden Set accuracy scores and gate status on performance page alongside offline/online gates.
9. Update `tasks/codemapcc.md`.

**Checkpoint N1 — Verification**
- Manual: `golden_set/invoices.json` present with ≥10 entries in correct format.
- Manual: Trigger D5 gate check with a candidate that regresses on Golden Set → Activate button disabled; tooltip shows Golden Set gate failure with `candidateAccuracy` vs `activeAccuracy`.
- Manual: `golden_set/` empty → gate skipped; warning logged; other gates still enforced.
- Manual: Add a new entry to `golden_set/` without restarting API → gate check immediately uses the new entry.
- Regression: Offline and online gates unaffected by Golden Set addition.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

## 24) Field Library Integrity (P1)

### N2 — Field Library Similarity Check at Creation (Complexity: Simple)

**Problem statement**
Over time, users create semantically duplicate fields (e.g. `total_amount` vs `invoice_total`) which dilutes LayoutLMv3 training signal — the model tries to distinguish labels that mean the same thing. A similarity check at field creation time prevents label noise accumulation.

**Files / Locations**
- Amend: `apps/api/src/field-library/field-library.service.ts` — add similarity check on field create.
- Amend: `apps/api/src/field-library/field-library.controller.ts` — return similarity warnings in create response.
- Amend: `apps/web/app/admin/field-library/` — show similarity warning UI before confirming field creation.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. On `POST /field-library` (create new field): before inserting, call `POST /ml/embed` with `{documentText: newField.label}` to get a label embedding.
2. Query `baseline_embeddings` for existing field-level embeddings (where `field_key != 'document'`), compute cosine similarity to the new label embedding.
3. If any existing field has similarity ≥ 0.85: return HTTP 200 with `{created: false, warning: 'similar_field_exists', similarFields: [{fieldKey, label, similarity}]}` — do not auto-reject, but surface the warning.
4. Frontend: if `warning = 'similar_field_exists'`, show a confirmation modal: "This field is similar to [existing fields]. Are you sure you want to create a separate field?" Admin must explicitly confirm to proceed.
5. If admin confirms: re-POST with `{forceCreate: true}` → insert field regardless of similarity. Log audit event `field_library.create.similarity_override` with `{newFieldKey, similarFields}`.
6. Update `tasks/codemapcc.md`.

**Checkpoint N2 — Verification**
- Manual: Create a field with label "Invoice Total" when "invoice_total" exists → warning returned with similarity ≥ 0.85; confirmation modal shown.
- Manual: Admin confirms → field created; audit log shows `field_library.create.similarity_override`.
- Manual: Create a field with label "Delivery Address" when no similar field exists → field created immediately, no warning.
- Manual: `ml-service` unavailable → similarity check skipped; field created with warning logged server-side (do not block field creation on embed failure).
- Regression: Existing field-library create/update/delete flows unaffected.

**Estimated effort:** 2–3 hours
**Complexity flag:** Simple

---

## 25) Execution Order (PART 4)

1. **N1** Golden Set infrastructure — no code dependencies; must be done before first production activation.
2. **N2** Field library similarity check — depends on M1 (needs `POST /ml/embed` endpoint); can run in parallel with v8.11 M tasks.

---

## 26) Part 4 Definition of Done

**Feature Completeness:**
- `golden_set/` directory present with ≥10 manually curated entries (N1).
- D5 gate enforces Golden Set regression check; empty Golden Set skips with warning (N1).
- Field creation similarity check warns on ≥0.85 cosine similarity; admin override logged (N2).

**Data Integrity:**
- Golden Set never written by automated process — filesystem + PR governance only.
- Field similarity check never blocks creation — warning + explicit confirm only.
- Embed failure on field create never blocks field creation.

**Documentation:**
- `golden_set/README.md` present with governance rules.
- `tasks/codemapcc.md` updated with `golden_set/` directory reference and N2 field-library changes.

---

## 27) Known Architectural Boundaries — v8.12+ Backlog

> These risks are documented, understood, and deliberately deferred. They require infrastructure additions outside the scope of v8.10/v8.11. Each is a named work item for v8.12 planning.

### B1 — Per-Page Task Atomicism (OOM / Poison-Pill Documents)
**Risk:** A single large or corrupt page (e.g. 6000×8000px architectural blueprint) within a multi-page PDF can OOM the ocr-worker process. The current `MAX_PDF_PAGES=10` cap and sequential page processing limit blast radius, but a bad page still kills all segments for that document — no partial results are returned.
**Deferred fix:** Replace synchronous HTTP OCR chain with a per-page task queue (BullMQ or Celery). Each page becomes an independent task. A failing page is dead-lettered; surviving pages complete normally. Partial results are assembled by a coordinator task. Requires: Redis/queue infrastructure, coordinator pattern, dead-letter monitoring.
**Current mitigation:** `MAX_PDF_PAGES=10`; sequential page loop; page-level exception returns 500 without crashing the process.

### B2 — Priority-Based Task Queuing (Bulk Upload Availability)
**Risk:** A bulk upload of 50+ PDFs saturates ml-service (GPU/CPU bound) and creates latency for users processing a single urgent document. No priority separation exists between interactive single-document uploads and background batch jobs.
**Deferred fix:** Three-tier priority queue on the same BullMQ/Celery infrastructure as B1. Priority 1: single-document interactive uploads. Priority 2: bulk/batch uploads. Priority 3: re-processing and fine-tuning evaluations. Workers drain Priority 1 before Priority 2.
**Dependency:** Shares infrastructure with B1 — implement together.

### B3 — Canary Traffic Shifting on Model Hot-Swap
**Risk:** After a model hot-swap, CUDA kernel JIT compilation on the first real inferences causes latency spikes. The warm-up pass covers VRAM allocation but not kernel cold paths on real document shapes.
**Deferred fix:** Extend C1 A/B framework to support a configurable canary split (e.g. 90% champion / 10% new model) for the first N documents post-swap. If new model p99 latency exceeds 2× champion, auto-rollback via `POST /ml/models/activate` with previous version. Requires: per-request latency tracking, rollback trigger logic.
**Current mitigation:** Warm-up pass on load; hot-swap only switches pointer after successful warm-up.

### B4 — Locale-Aware Heuristics (Multi-Language)
**Risk:** DSPP cleaning (S→5, O→0) and reading order sort (left-to-right) are tuned for Latin-script, left-to-right documents. RTL languages (Arabic, Hebrew) will produce incorrect reading order. Non-Latin scripts may have different OCR glyph confusion patterns not covered by current substitutions.
**Deferred fix:** Detect document language from OCR output metadata; key DSPP substitution tables and zone classifier reading order by detected locale. Aligns with v8.12 Multi-Language milestone scope.
**Current mitigation:** DSPP substitutions are universally safe for currency/number fields across Latin-script languages; RTL documents will produce degraded but non-crashing results.

### B5 — Model Weights Protection (Fine-tuned IP)
**Risk:** Fine-tuned LayoutLMv3 weights stored on disk or volume mounts are accessible to anyone with container/host access. Stolen weights represent extracted business logic (field patterns, document layouts) unique to the deployment.
**Deferred fix:** When fine-tuning pipeline produces checkpoint artifacts, store to external object storage (S3/GCS) with short-lived signed URLs for retrieval. Encrypt at rest with KMS. Apply only when external storage is introduced for hot-swap artifacts.
**Current mitigation:** Weights are baked into Docker image at build time (offline pre-cache pattern); image registry access control is the primary protection. No external storage in current architecture.

### B6 — Dependency Supply Chain Scanning
**Risk:** `requirements.txt` pulls in hundreds of transitive dependencies (torch, transformers, paddleocr). A compromised sub-dependency could enable RCE via a malicious PDF.
**Current state:** All direct dependencies in `requirements.txt` are version-pinned (no `>=` ranges — confirmed). Transitive dependencies are not pinned.
**Deferred fix:** Add Snyk or GitHub Advanced Security to CI pipeline to scan `requirements.txt` daily. Generate a `requirements.lock` with fully resolved transitive dependency hashes. Apply as a CI/CD concern, not a plan.md task.

---

## 28) Architecture Alignment Patch — Data Orchestration Baseline

**Assessment Summary**

| Point | Status |
|---|---|
| D12 Entity Router | Already present as `baseline.confirm` audit event emission; requires structured downstream payload. |
| S1 Canonical Interface | Already present via `field_library` canonical schema; requires governance discipline, not new architecture. |
| F6 Consumed State | Already present via `utilizedAt`; first-write-wins behavior is the idempotency guarantee. |
| I9 Enrichment Hooks | Interface pattern is valid; concrete enrichment implementations are deferred as premature. |

### P0 — D12 Structured `baseline.confirmed` Event Payload (Single Delivery Task)

**Problem statement**
Downstream modules need full confirmed baseline data at confirm time without polling extraction endpoints. The existing confirm audit event should be extended into a structured event contract consumable by webhooks/event-bus subscribers.

**Files / Locations**
- Backend: `apps/api/src/baseline/*` confirm flow emission point (extend existing confirm/audit path).
- Backend: event delivery surface (`webhook` and/or event bus adapter used by confirm flow).
- Docs: `tasks/codemapcc.md` (event contract and producer location).

**Payload contract (minimum)**
- Envelope: `eventType='baseline.confirmed'`, `eventVersion`, `occurredAt`, `correlationId` (optional), `traceId` (optional).
- Identity: `documentId`, `baselineId`, `confirmedAt`, `confirmedBy`.
- Schema: `schemaVersion` from canonical `field_library`.
- Data: full canonical `fields[]` payload with `{key, value, confidence, source, provenance}`.

**Rules**
1. Reuse existing confirm transaction boundary and emission path; do not introduce polling dependencies.
2. Event data is derived from canonical persisted baseline assignments at the moment of confirmation.
3. Delivery is at-least-once; consumers must be idempotent on `{baselineId, eventVersion}`.
4. No enrichment execution in this task; emit canonical baseline state only.

**Checkpoint — Verification**
- Confirming a baseline emits one structured `baseline.confirmed` event containing full canonical field payload.
- A downstream subscriber can process confirmed data without calling extraction read APIs.
- Existing `baseline.confirm` audit logging remains intact (extended, not replaced).

**Estimated effort:** 2–4 hours  
**Complexity flag:** Medium

### S1 Governance Rule — Canonical `field_library`

`field_library` is the system-wide canonical interface for extracted fields.

1. Any new field or semantic change requires a versioned schema update and migration note.
2. Canonical keys are authoritative; downstream modules must not create ad hoc aliases as primary contracts.
3. Event/API payloads that expose extracted fields must use canonical keys from `field_library`.

### F6 Guarantee — `utilizedAt` Idempotent Consumed State

`utilizedAt` is the consumed-state marker and is first-write-wins.

1. First successful consume sets `utilizedAt`; later consume attempts must not overwrite it.
2. Non-null `utilizedAt` is authoritative evidence that the baseline has already been consumed.
3. Consumers should treat repeated consume requests as idempotent no-ops after `utilizedAt` is set.

### I9 Scope Decision — Enrichment Hooks

Define/retain the enrichment hook interface contract only. Defer concrete enrichment providers until after the structured `baseline.confirmed` payload is in production and consumer demand is validated.
