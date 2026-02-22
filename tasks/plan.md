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

**Problem statement**
We need a global (system-wide) trigger that runs training automatically when enough qualified corrections have accumulated since the last successful run.

**Rules**
1. **Scope:** Global only. No per-user or per-account triggers.
2. **Trigger condition:** `qualified_corrections_since_last_success >= 1000`.
3. **Qualified corrections:** Must pass A2 filters (no typo, no early-user, no single-user, `suggestionConfidence IS NOT NULL`, `sourceSegmentId IS NOT NULL`).
4. **No schedule / no cooldown:** Volume-only.
5. **No auto-activation:** Activation remains manual.

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
2. ML service runs fine-tuning in a background thread; stores model at `/app/models/<candidateVersion>/`; writes `metrics.json`.
3. On success: ML service calls `POST /admin/ml/training-jobs/:id/complete` with `{metrics, modelPath, candidateVersion}`.
4. API updates `ml_training_jobs` to `succeeded`; auto-registers model in `ml_model_versions` with `isActive=false`.
5. On failure: ML service calls `POST /admin/ml/training-jobs/:id/fail` with error; API marks job `failed`.
6. Emit audit logs `ml.training.run.started`, `ml.training.run.succeeded`, `ml.training.run.failed`.

**Checkpoint D4 — Verification**
- Manual: Trigger a training run → `ml_training_jobs` transitions queued → running → succeeded.
- DB: Candidate model registered in `ml_model_versions` with `isActive=false`.
- Logs: All three audit events present for a complete run.

**Estimated effort:** 3–4 hours
**Complexity flag:** Complex

---

### D5 — Activation Gates (Offline + Online) (Complexity: Medium)

**Problem statement**
Admin activation of a candidate model must be gated by measurable quality thresholds to prevent regressions.

**Rules**
1. Offline gate: candidate must beat active by **≥2% accuracy delta** on test set.
2. Online gate: candidate must beat active by **≥5% acceptance delta** and have **≥1000 suggestions**.
3. Activation remains explicit admin action only.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-performance.service.ts` — compute gate status per candidate.
- Backend: `apps/api/src/ml/ml-models.service.ts` — block `activateModel()` if gates not met.
- Frontend: `apps/web/app/admin/ml/performance/page.tsx` — disable Activate button with tooltip if gates not met.

**Implementation plan**
1. `MlPerformanceService.getGateStatus(candidateVersionId)`: load offline metrics from `ml_model_versions.metrics`; load online acceptance from `baseline_field_assignments`; return `{offlineGateMet, onlineGateMet, offlineDelta, onlineDelta, onlineSuggestionCount}`.
2. `MlModelsService.activateModel()`: call `getGateStatus`; if either gate not met, throw `BadRequestException` with gate failure details.
3. Frontend: fetch gate status alongside performance data; render Activate button disabled with tooltip explaining which gate is not met.

**Checkpoint D5 — Verification**
- Manual: Register a candidate with accuracy delta <2% → Activate button disabled; tooltip shows offline gate failure.
- Manual: Candidate with <1000 suggestions → Activate button disabled; tooltip shows online gate failure.
- Manual: Candidate meeting both gates → Activate button enabled; activation succeeds.

**Estimated effort:** 1–2 hours
**Complexity flag:** Medium

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
4. Return `{activeModel, candidateModel, models[], trend[], recommendation}` where `recommendation` appears when candidate beats active by ≥5% acceptance with ≥1000 suggestions.
5. Emit audit log `ml.performance.fetch` with date range.
6. Update `tasks/codemapcc.md`.

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
4. Activate button: calls `POST /admin/ml/models/activate`; disabled with tooltip if D5 gates not met.
5. Update `tasks/codemapcc.md`.

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

**Problem statement**
Assigning a zone label (header/addresses/line_items/instructions/footer) to each segment provides positional context for LayoutLMv3 inference and downstream field routing.

**Files / Locations**
- Amend: `apps/ml-service/main.py` — add zone classification pre-pass in `POST /ml/suggest-fields`.
- New: `apps/ml-service/zone_classifier.py` — rule-based zone assignment using bounding box y-position ratios.
- Docs: `tasks/codemapcc.md` — document zone classifier.

**Implementation plan**
1. `zone_classifier.py`: given `{segments: [{boundingBox, pageHeight}]}`, assign zone by normalised y-midpoint:
   - `y_ratio < 0.15` → `'header'`
   - `0.15 ≤ y_ratio < 0.30` → `'addresses'`
   - `0.30 ≤ y_ratio < 0.75` → `'line_items'`
   - `0.75 ≤ y_ratio < 0.88` → `'instructions'`
   - `y_ratio ≥ 0.88` → `'footer'`
2. Run zone classifier before LayoutLMv3 inference; pass zone as a feature hint to the model (as an additional token prefix or via positional encoding; implementation detail per model variant).
3. Include `zone` in each suggestion in the response.
4. Update `tasks/codemapcc.md`.

**Checkpoint I2 — Verification**
- Manual: Segment with `boundingBox.y = 20, pageHeight = 1000` → `zone = 'header'`.
- Manual: Segment at y=500 of 1000 → `zone = 'line_items'`.
- Regression: Suggestion endpoint still returns all existing fields alongside new `zone`.

**Estimated effort:** 2 hours
**Complexity flag:** Medium

---

### I3 — Updated Field Suggestion Service (Complexity: Medium)

**Problem statement**
`FieldSuggestionService` hardcodes `all-MiniLM-L6-v2` and does not persist the new spatial fields. It must resolve the active LayoutLMv3 model and persist `zone`, `bounding_box`, `extraction_method`, `confidence_score`.

**Files / Locations**
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — update model resolution and assignment persistence.
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — accept and persist new columns.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. Remove hardcoded `'all-MiniLM-L6-v2' v1.0.0` model lookup; resolve active model from `extraction_models` where `isActive=true` (fall back to `ml_model_versions` for backward compatibility).
2. Pass `pageWidth`, `pageHeight`, `pageType` from OCR output metadata to the ML service request.
3. On ML service response, for each suggestion persist to `baseline_field_assignments`:
   - `confidence_score` from suggestion confidence.
   - `zone` from suggestion zone.
   - `bounding_box` from suggestion boundingBox.
   - `extraction_method` = `'layoutlmv3'`.
4. Update `tasks/codemapcc.md`.

**Checkpoint I3 — Verification**
- Manual: Generate suggestions on a baseline; DB shows `zone`, `bounding_box`, `extraction_method`, `confidence_score` populated on the created assignments.
- Regression: Existing `suggestionConfidence`, `suggestionAccepted`, `modelVersionId` fields still populated correctly.

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
The review page layout needs to surface confidence-tiered fields alongside the PDF viewer, with auto-scroll to the source region.

**Files / Locations**
- Amend: `apps/web/app/attachments/[attachmentId]/review/page.tsx` — restructure into two-panel layout when spatial data present.
- New: `apps/web/app/components/ocr/VerificationPanel.tsx` — right-hand fields panel with tier-driven rendering.
- Amend: existing `PdfDocumentViewer` usage — pass `highlightRegion` prop for bbox overlay.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. When at least one assignment has a non-null `bounding_box`, activate verification mode layout:
   - Left 50%: `PdfDocumentViewer` with bbox highlight overlay.
   - Right 50%: `VerificationPanel` sorted by tier (flag → verify → auto_confirm).
2. `VerificationPanel` field rendering:
   - Flag fields: red left border + badge "Review Required".
   - Verify fields: amber left border + badge "Please Verify".
   - Auto-confirm fields: green left border + badge "High Confidence".
3. On field focus in panel: emit `scrollToRegion(boundingBox, pageNumber)` event; PDF viewer scrolls to page and overlays the bbox rectangle.
4. Maintain existing accept/modify/clear flows; bulk confirm button per J1.
5. If no spatial data (pre-LayoutLMv3 baselines): render original three-panel layout unchanged.
6. Update `tasks/codemapcc.md`.

**Checkpoint K1 — Verification**
- Manual: Open review page for a baseline with `bounding_box` data → two-panel layout renders.
- Manual: Click a flag field in the panel → PDF viewer scrolls to correct page and shows bounding box highlight.
- Manual: Open review page for an old baseline without bbox data → original layout renders, no errors.
- Regression: All existing correction, confirm, and suggestion flows still work.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

### K2 — Keyboard Flow (Complexity: Simple)

**Problem statement**
Reviewers need keyboard navigation to process fields without switching between mouse and keyboard.

**Files / Locations**
- Amend: `apps/web/app/components/ocr/VerificationPanel.tsx` — add keyboard event handlers.

**Implementation plan**
1. `Tab` / `Shift+Tab`: move focus to next/previous field (tier order: flag first, then verify, then auto_confirm).
2. `Enter`: accept currently focused suggestion (`suggestionAccepted=true`).
3. `Escape`: skip field (move focus without accepting).
4. `Shift+Enter`: trigger bulk confirm (same as button click per J1).
5. Keyboard hints bar at panel footer.

**Checkpoint K2 — Verification**
- Manual: Tab through fields; PDF viewer scrolls with each focus change.
- Manual: Press Enter on a verify field → `suggestionAccepted=true` in DB.
- Manual: Press Escape → focus moves to next field, DB unchanged.
- Manual: Press Shift+Enter → all auto_confirm fields accepted.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

## 10) LayoutLMv3 Fine-Tuning Pipeline (P1 — depends on I1, F1/F2)

### L1 — training-worker Container Setup (Complexity: Medium)

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
