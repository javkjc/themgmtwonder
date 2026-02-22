## v8.9 � ML Model Training & Fine-Tuning

**Date:** 2026-02-17  
**Scope:** Build correction dataset export, manual fine-tuning pipeline, model version registry/activation, A/B testing, and performance dashboard while keeping suggestions opt-in.  
**Principles:** Minimal localized changes. Backend authoritative. No new dependencies. No background automation. Preserve auditability-first.

---

## 0) Preconditions / Guardrails

**Prerequisites:**
- [OK] v8.8.1 complete and tagged.  
Evidence: `tasks/executionnotes.md` entry dated 2026-02-15 with tag `v8.8.1`.
- [OK] ML service and ML API module present.  
Evidence: `tasks/codemapcc.md` Repo Index lists `apps/ml-service` and `apps/api/src/ml`.
- [OK] Suggestion metadata fields available.  
Evidence: `tasks/codemapcc.md` Data Model Map shows `baseline_field_assignments` includes `suggestionConfidence`, `suggestionAccepted`, `modelVersionId`, `correctedFrom`, and `suggestionContext`.
- [OK] Model registry table exists.  
Evidence: `tasks/codemapcc.md` Data Model Map shows `ml_model_versions` with `metrics` and `isActive`.
- [OK] Lessons reviewed for v8.8 patterns.  
Evidence: `tasks/lessons.md` entries dated 2026-02-12 and 2026-02-13.

**Out of Scope:**
- [NO] Automatic retraining or cron jobs (background automation violates governance) **except** for assisted ML training/evaluation jobs defined in Section 4B (activation remains manual).
- [NO] Auto-activation of new models without explicit admin action.
- [NO] New ML dependencies (onnx/onnxruntime, pandas, sklearn, datasets, etc.).
- [NO] Vector stores or cross-baseline memory beyond v8.8.1 pairing/context outputs.
- [NO] Workflow coupling or non-admin UI changes outside `/admin`.

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Missing Infrastructure:** If `baseline_field_assignments`, `extracted_text_segments`, or `ml_model_versions` is missing or lacks required columns in `apps/api/src/db/schema.ts`.
- **STOP - Missing File/Codemap Entry:** If any new file path is not added to `tasks/codemapcc.md` before implementation.
- **STOP - New Dependency Request:** If training/export requires packages not already in `apps/ml-service/requirements.txt` or `apps/api/package.json`.
- **STOP - Ambiguous Requirement:** If the definitions of "single-user corrections" or "first 30 days" are unclear.
- **STOP - Candidate Model Undefined:** If A/B testing is enabled but no non-active candidate model is clearly identified.
- **STOP - Background Automation:** If asked to add cron/scheduler for retraining **outside** the assisted ML automation defined in Section 4B.

---

## 1) Training Data Export � Dataset Foundations (P0)

> **Context:** Provide a governed, admin-only dataset export from real corrections to power model training.

### A1 � Admin Training Data Export Endpoint (Complexity: Medium)

**Status: ✅ Completed on 2026-02-18**

**Problem statement**
We need an admin-only API to export correction data with explicit date ranges and minimum correction thresholds, without introducing new dependencies.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-training-data.controller.ts` � add `/admin/ml/training-data` endpoint (admin-only).
- Backend: `apps/api/src/ml/ml-training-data.service.ts` � query and shape dataset.
- Backend: `apps/api/src/ml/dto/ml-training-data.query.dto.ts` � validate `startDate`, `endDate`, `minCorrections`.
- Backend: `apps/api/src/ml/ml.module.ts` � register controller/service.
- Docs: `tasks/codemapcc.md` � add endpoint/service paths.

**Implementation plan**
1. Create DTO to require ISO `startDate` and `endDate`, optional `minCorrections` default 10.
2. Query `baseline_field_assignments` joined to `extracted_text_segments` by `sourceSegmentId` and to `extraction_baselines` for status.
3. Filter to `suggestionConfidence IS NOT NULL` and `sourceSegmentId IS NOT NULL` within date range.
4. Return JSON array with fields: `textSegment`, `suggestedField`, `userAssignedField`, `confidence`, `accepted`, `modelVersionId`, `assignedAt`, `correctionReason`.
5. Emit audit log `ml.training-data.export` with count and date range.
6. Update `tasks/codemapcc.md` with the new endpoint and DTO.

**Checkpoint A1 � Verification**
- Manual: `GET /admin/ml/training-data?startDate=2026-02-01&endDate=2026-02-15&minCorrections=10` as admin returns JSON array with required fields.
- DB:
```sql
SELECT COUNT(*) AS total
FROM baseline_field_assignments
WHERE suggestion_confidence IS NOT NULL
  AND source_segment_id IS NOT NULL
  AND assigned_at BETWEEN '2026-02-01' AND '2026-02-15';
```
Expected result: count is >= length of returned JSON before filters.
- Logs: API log shows `action="ml.training-data.export"` with `count`, `startDate`, `endDate` fields.
- Regression: Existing `/admin/ml/metrics` endpoint continues to work.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### A2 � Data Quality Filters (Complexity: Medium)

**Status: ✅ Completed on 2026-02-18**

**Problem statement**
We must exclude low-quality corrections and enforce minimum correction counts to avoid contaminating the training set.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-training-data.service.ts` � apply quality filters.
- Backend: `apps/api/src/ml/dto/ml-training-data.query.dto.ts` � add optional toggles only if approved.
- Docs: `tasks/codemapcc.md` � document filter behavior.

**Implementation plan**
1. Exclude rows where `correctionReason = 'typo'` (case-insensitive).
2. Exclude rows where `assignedAt < users.createdAt + interval '30 days'`.
3. Exclude rows where only one distinct user corrected the same `fieldKey + normalizedSegmentText` within the export window.
4. If filtered count < `minCorrections`, return 400 with message `"insufficient_corrections"` and log.
5. Update `tasks/codemapcc.md` with filter definitions.

**Checkpoint A2 � Verification**
- Manual: Export with `minCorrections=10` and a narrow date range that has fewer than 10 filtered corrections returns 400 with `code="insufficient_corrections"`.
- DB:
```sql
SELECT field_key,
       LOWER(TRIM(ets.text)) AS segment_text_norm,
       COUNT(DISTINCT bfa.assigned_by) AS distinct_users
FROM baseline_field_assignments bfa
JOIN extracted_text_segments ets ON ets.id = bfa.source_segment_id
WHERE bfa.suggestion_confidence IS NOT NULL
  AND bfa.assigned_at BETWEEN '2026-02-01' AND '2026-02-15'
GROUP BY field_key, segment_text_norm
ORDER BY distinct_users ASC
LIMIT 5;
```
Expected result: rows with `distinct_users = 1` are excluded from export.
- Logs: API log includes `filteredOutTypos`, `filteredOutEarlyUsers`, and `filteredOutSingleUser` counts.
- Regression: Export still returns data when filters allow.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 2) Model Registry & Activation (P0)

> **Context:** Manage model versions explicitly and enable safe hot swap in the ML service.

### B1 � Model Version Admin API (Complexity: Medium)

**Status: ✅ Completed on 2026-02-18**

**Problem statement**
We need a controlled way to register and list model versions with metrics and file paths.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-models.controller.ts` � new `/admin/ml/models` endpoints.
- Backend: `apps/api/src/ml/ml-models.service.ts` � register/list models.
- Backend: `apps/api/src/ml/dto/create-ml-model.dto.ts` � validate model payload.
- Backend: `apps/api/src/ml/ml.module.ts` � wire controller/service.
- Docs: `tasks/codemapcc.md` � add new endpoints.

**Implementation plan**
1. Add `POST /admin/ml/models` to create model version with `modelName`, `version`, `filePath`, and `metrics` JSON.
2. Add `GET /admin/ml/models` to list versions sorted by `trainedAt` desc.
3. Enforce AdminGuard and emit audit log `ml.model.register` with version and modelName.
4. Update `tasks/codemapcc.md`.

**Checkpoint B1 � Verification**
- Manual: `POST /admin/ml/models` with
```json
{"modelName":"sentence-bert-field-matching","version":"v2026-02-17","filePath":"/ml-service/models/minilm-finetuned-v2026-02-17","metrics":{"accuracy":0.78,"precision":0.75,"recall":0.72}}
```
returns created record with `isActive=false`.
- DB:
```sql
SELECT model_name, version, file_path, is_active
FROM ml_model_versions
WHERE model_name = 'sentence-bert-field-matching'
ORDER BY trained_at DESC
LIMIT 1;
```
Expected result: row matches payload and `is_active = false`.
- Logs: audit log includes `action="ml.model.register"` and `details.version`.
- Regression: Existing ML metrics endpoints still respond.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### B2 � ML Service Hot Swap Endpoint (Complexity: Complex)

**Status: ✅ Completed on 2026-02-18**

**Problem statement**
We need an ML service endpoint to load a model from disk and swap it in memory without breaking inference.

**Files / Locations**
- ML Service: `apps/ml-service/main.py` � add `POST /ml/models/activate`.
- ML Service: `apps/ml-service/model.py` � add model registry and load/swap helpers.
- ML Service: `apps/ml-service/model_registry.py` � new module for active model state.
- Docs: `tasks/codemapcc.md` � document endpoint.

**Implementation plan**
1. Add a `ModelRegistry` to hold `activeVersion`, `model`, and `modelPath` in memory.
2. Implement `POST /ml/models/activate` accepting `{version, filePath}`.
3. Load model from `filePath` using SentenceTransformer, run a warm-up embedding, and only then swap `active`.
4. If load fails, keep prior model active and return `{ok:false, error:{code:"load_failed"}}`.
5. Log `ml.model.activate.success` or `ml.model.activate.failed` with version and filePath.

**Checkpoint B2 � Verification**
- Manual: `POST /ml/models/activate` with existing model path returns `{ok:true, activeVersion:"v2026-02-17"}`.
- Logs: ML service log line includes `ml.model.activate.success` with `version` and `filePath`.
- Regression: `POST /ml/suggest-fields` still returns suggestions after activation.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Complex = GPT-4o required

### B3 – API Model Activation Endpoint (Complexity: Medium)

**Status: ✅ Completed on 2026-02-19**

**Problem statement**  
Admins need a backend-authoritative route to activate a model and persist the active flag.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-models.controller.ts` � add `POST /admin/ml/models/activate`.
- Backend: `apps/api/src/ml/ml-models.service.ts` � activate model transactionally.
- Backend: `apps/api/src/ml/ml.service.ts` � call ML service activation endpoint.
- Docs: `tasks/codemapcc.md` � document activation flow.

**Implementation plan**
1. Accept `{version}` in API, resolve model record and filePath.
2. Call ML service `POST /ml/models/activate` with `{version, filePath}`.
3. On success, set `isActive=true` for version and `isActive=false` for previous active in a transaction.
4. Emit audit log `ml.model.activate` with `version` and `previousVersion`.
5. Update `tasks/codemapcc.md`.

**Checkpoint B3 � Verification**
- Manual: `POST /admin/ml/models/activate` with `{version:"v2026-02-17"}` returns `{ok:true, activeVersion:"v2026-02-17"}`.
- DB:
```sql
SELECT version, is_active
FROM ml_model_versions
WHERE model_name = 'sentence-bert-field-matching'
ORDER BY trained_at DESC;
```
Expected result: exactly one row has `is_active = true`.
- Logs: API audit log contains `action="ml.model.activate"` with `previousVersion`.
- Regression: Suggestions still generate after activation.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 3) A/B Testing & Suggestion Tracking (P1)

> **Context:** Route suggestions deterministically to active/candidate models and track outcomes for evaluation.

### C1 � Deterministic A/B Model Selection (Complexity: Medium)

**Problem statement**  
We need deterministic 50/50 routing between active and candidate models when A/B testing is enabled.

**Files / Locations**
- Backend: `apps/api/src/ml/field-suggestion.service.ts` � select model version per request.
- Backend: `apps/api/src/ml/ml.service.ts` � pass selected model version to ML service.
- Docs: `tasks/codemapcc.md` � document A/B selection rules.

**Implementation plan**
1. Read `ML_MODEL_AB_TEST` env flag.
2. Resolve model A as `isActive=true` for `sentence-bert-field-matching`.
3. Resolve model B as most recent `isActive=false` by `trainedAt`.
4. If A/B enabled and model B exists, choose A or B by stable hash of `baselineId` (e.g., hash % 2).
5. Pass `modelVersionId` and `filePath` to ML service request.
6. Add audit detail fields: `abGroup`, `modelVersionId`, `modelVersion`.

**Checkpoint C1 � Verification**
- Manual: Run suggestions for two baselines with different IDs and verify `abGroup` alternates deterministically.
- DB:
```sql
SELECT model_version_id, COUNT(*) AS suggestions
FROM baseline_field_assignments
WHERE suggestion_confidence IS NOT NULL
  AND assigned_at >= NOW() - INTERVAL '1 day'
GROUP BY model_version_id;
```
Expected result: both model versions have non-zero counts when A/B enabled.
- Logs: `ml.suggest.generate` includes `abGroup` and `modelVersionId`.
- Regression: When A/B disabled, only active model is used.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### C2 � Suggestion Outcome Tracking Integrity (Complexity: Simple)

**Problem statement**  
We must ensure accept/modify/clear outcomes are recorded consistently for model evaluation.

**Files / Locations**
- Backend: `apps/api/src/baseline/baseline-assignments.service.ts` � confirm suggestion flags are persisted.
- Backend: `apps/api/src/baseline/dto/assign-baseline-field.dto.ts` � ensure `suggestionAccepted` and `modelVersionId` allowed.
- Backend: `apps/api/src/baseline/dto/delete-assignment.dto.ts` � ensure `suggestionRejected` and `modelVersionId` allowed.
- Frontend: `apps/web/app/attachments/[id]/review/page.tsx` � send correct flags for accept/modify/clear.
- Docs: `tasks/codemapcc.md` � document tracking rules.

**Implementation plan**
1. On accept-as-is: set `suggestionAccepted=true` and preserve `modelVersionId`.
2. On modify/clear: set `suggestionAccepted=false` and preserve `modelVersionId`.
3. On manual entry (no suggestion): keep `suggestionAccepted=NULL` and `modelVersionId=NULL`.
4. Update `tasks/codemapcc.md`.

**Checkpoint C2 � Verification**
- Manual: Accept one suggestion, modify one, clear one on `/attachments/<id>/review`.
- DB:
```sql
SELECT field_key, suggestion_accepted, model_version_id
FROM baseline_field_assignments
WHERE baseline_id = '<BASELINE_ID>'
ORDER BY field_key;
```
Expected result: accepted = true, modified/cleared = false, manual = NULL.
- Logs: `baseline.assignment.upsert` includes `suggestionAccepted` when applicable.
- Regression: Manual assignment remains unaffected.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Simple = GPT-4o-mini OK

---

## 4) Training Pipeline (P1)

> **Context:** Provide a deterministic, manual fine-tuning pipeline using exported data with no new dependencies, plus optional synthetic bootstrap data.

### D0 � Synthetic Training Data Generator (Complexity: Medium)

**Problem statement**  
We need a deterministic way to generate small, template-based training samples to bootstrap model accuracy when real corrections are limited.

**Files / Locations**
- ML Service: `apps/ml-service/training/generate_synthetic.py` � new generator script (stdlib only).
- ML Service: `apps/ml-service/training/synthetic_templates.json` � templates for field labels and value patterns.
- ML Service: `apps/ml-service/training/README.md` � document generation usage.
- Docs: `tasks/codemapcc.md` � document generator path.

**Implementation plan**
1. Define templates with fields: `fieldKey`, `labelVariants[]`, `valuePatterns[]`, and optional `noiseRules[]`.
2. Generate `count` samples deterministically with `--seed`, output JSON array.
3. Each sample includes: `textSegment`, `suggestedField`, `userAssignedField`, `accepted=true`, `isSynthetic=true`.
4. Add OCR-style noise transforms (0/O, 1/l, punctuation drop) using stdlib only.
5. Ensure generator never produces train and test splits; it only outputs raw samples.
6. Update `tasks/codemapcc.md`.

**Checkpoint D0 � Verification**
- Manual: `python training/generate_synthetic.py --templates training/synthetic_templates.json --output C:\data\synthetic.json --count 200 --seed 42`.
- Expected output: JSON array length 200, each row has `isSynthetic=true`.
- Logs: script prints counts per fieldKey and total rows.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Medium = GPT-4o preferred

### D1 � Fine-Tuning Script + Evaluation (Complexity: Complex)

**Problem statement**  
We need a repeatable training script to fine-tune Sentence-BERT on correction data and produce metrics.

**Files / Locations**
- ML Service: `apps/ml-service/training/finetune.py` � new training script.
- ML Service: `apps/ml-service/training/README.md` � runbook with command examples.
- Docs: `tasks/codemapcc.md` � document training script path.

**Implementation plan**
1. Load JSON export file from CLI args; validate required keys.
2. Optional: accept `--synthetic` file and `--synthetic-ratio` (default 0.2, max 0.3) to mix synthetic data into training only.
3. Normalize text deterministically (trim, collapse whitespace).
4. Build training pairs `(textSegment, fieldKey)` with labels: accepted=1.0, modified/cleared=0.0.
5. Split dataset 80/10/10 with fixed random seed for reproducibility.
6. Ensure validation/test splits exclude `isSynthetic=true` rows.
7. Fine-tune SentenceTransformer using existing dependencies and save model to `apps/ml-service/models/minilm-finetuned-vYYYY-MM-DD`.
8. Compute test metrics (accuracy, precision, recall) and write `metrics.json` alongside model.
**Checkpoint D1 � Verification**
- Manual: `python training/finetune.py --input C:\data\training.json --synthetic C:\data\synthetic.json --synthetic-ratio 0.2 --output C:\models\minilm-finetuned-v2026-02-17 --epochs 1 --batch-size 16`.
- Expected output: console prints `accuracy=`, `precision=`, `recall=` and exit code 0.
- Files: output directory contains `config.json` (SentenceTransformer) and `metrics.json`.
- Logs: script prints dataset sizes for train/val/test and confirms synthetic excluded from val/test.
**Estimated effort:** 2-3 hours  
**Complexity flag:** Complex = GPT-4o required

### D2 � Register Trained Model Metadata (Complexity: Medium)

**Problem statement**  
A trained model must be registered in `ml_model_versions` for activation and A/B testing.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-models.controller.ts` � reuse `POST /admin/ml/models`.
- Docs: `tasks/codemapcc.md` � ensure registration endpoint is documented.

**Implementation plan**
1. Use admin endpoint to register trained model with version string `vYYYY-MM-DD`.
2. Provide `filePath` that matches the saved model directory path.
3. Include metrics from `metrics.json`.
4. Confirm `isActive=false` by default.

**Checkpoint D2 � Verification**
- Manual: POST the `metrics.json` contents to `/admin/ml/models`.
- DB:
```sql
SELECT model_name, version, file_path, metrics, is_active
FROM ml_model_versions
WHERE version = 'v2026-02-17';
```
Expected result: row exists with `is_active = false` and metrics populated.
- Logs: `ml.model.register` audit log entry present.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 4B) Assisted Auto-Learning (Global, Volume-Only) (P1)

> **Context:** Enable assisted automation to train/evaluate models in the background when enough qualified corrections accumulate globally. Activation remains manual.

### D3 - Global Volume Trigger + Job State (Complexity: Medium)

**Problem statement**  
We need a global (system-wide) trigger that runs training automatically when enough qualified corrections have accumulated since the last successful run, without any per-user or per-account triggers.

**Rules**
1. **Scope:** Global only (system-wide). No per-user or per-account triggers.
2. **Trigger condition:** `qualified_corrections_since_last_success >= 1000`.
3. **Qualified corrections:** Must pass existing A2 filters:
   - `correctionReason != 'typo'` (case-insensitive)
   - `assignedAt >= users.createdAt + interval '30 days'`
   - exclude single-user corrections per `(fieldKey + normalizedSegmentText)`
   - `suggestionConfidence IS NOT NULL` and `sourceSegmentId IS NOT NULL`
4. **No schedule / no cooldown:** Trigger is volume-only; run as soon as threshold is met.
5. **No auto-activation:** Activation remains manual (B3/E2).

**Files / Locations**
- Backend: `apps/api/src/ml/ml-training-automation.service.ts` - new service to poll and enqueue runs.
- Backend: `apps/api/src/ml/ml-training-jobs.service.ts` - job state CRUD.
- Backend: `apps/api/src/ml/ml-training-jobs.controller.ts` - admin visibility (list / status).
- Backend: `apps/api/src/db/schema.ts` - new tables for training job state.
- ML Service: `apps/ml-service/main.py` - add training run endpoint.
- Docs: `tasks/codemapcc.md` - add new files/endpoints.

**Implementation plan**
1. Add `ml_training_jobs` table with: `id`, `status`, `triggerType`, `windowStart`, `windowEnd`, `qualifiedCorrectionCount`, `candidateVersion`, `modelPath`, `metrics`, `startedAt`, `finishedAt`, `errorMessage`.
2. Add `ml_training_state` singleton table with: `lastSuccessAssignedAt`, `lastAttemptAt`, `lastAttemptThrough`.
3. Add automation service that polls every `ML_TRAINING_POLL_MS` (default 60000) when `ML_TRAINING_ASSISTED=true`.
4. If no job is queued/running and `qualified_corrections_since_last_success >= 1000`, enqueue a new job with `triggerType='volume_auto'`.
5. Emit audit log `ml.training.auto.triggered` with counts and window.

**Checkpoint D3 - Verification**
- Manual: With <1000 qualified corrections since last success -> no job is created.
- Manual: With >=1000 qualified corrections -> exactly one job is created (global scope).
- Logs: `ml.training.auto.triggered` includes `qualifiedCorrectionCount` and window range.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### D4 - Assisted Training Run + Auto-Register Candidate (Complexity: Complex)

**Problem statement**  
We need an automated training run that produces a candidate model and registers it, while keeping activation manual.

**Files / Locations**
- ML Service: `apps/ml-service/main.py` - `POST /ml/training/run`
- ML Service: `apps/ml-service/training/finetune.py` - invoked by service
- Backend: `apps/api/src/ml/ml-training-jobs.controller.ts` - callbacks for completion/failure
- Backend: `apps/api/src/ml/ml-models.service.ts` - register candidate model
- Docs: `tasks/codemapcc.md`

**Implementation plan**
1. ML service endpoint `POST /ml/training/run` accepts `{jobId, startDate, endDate, minCorrections, candidateVersion}`.
2. ML service runs training in background, stores model at `/app/models/<candidateVersion>`, and writes `metrics.json`.
3. On success, ML service calls API callback `POST /admin/ml/training-jobs/:id/complete` with `{metrics, modelPath, candidateVersion}`.
4. API updates `ml_training_jobs` to `succeeded`, stores metrics, and auto-registers model in `ml_model_versions` (isActive=false).
5. On failure, ML service calls `POST /admin/ml/training-jobs/:id/fail` with error message; API marks job failed.
6. Emit audit logs `ml.training.run.started`, `ml.training.run.succeeded`, `ml.training.run.failed`.

**Checkpoint D4 - Verification**
- Manual: Successful run creates candidate model with `isActive=false`.
- Manual: Failed run updates job to `failed` with error message.
- Logs: all three training run audit events present.

**Estimated effort:** 3-4 hours  
**Complexity flag:** Complex = GPT-4o required

### D5 - Activation Gates (Offline + Online) (Complexity: Medium)

**Problem statement**  
Activation must remain manual and be gated by offline and online thresholds.

**Rules**
1. Offline gate: Candidate must beat active by **>= 2% accuracy delta** on test set.
2. Online gate: Candidate must beat active by **>= 5% acceptance delta** and have **>= 1000 suggestions**.
3. Activation remains explicit admin action only.

**Implementation plan**
1. Store offline metrics per model (already in `metrics` JSON).
2. Performance API uses existing online acceptance aggregation.
3. Admin UI disables "Activate" unless both gates are met.

**Checkpoint D5 - Verification**
- Manual: Candidate fails either gate -> Activate button disabled.
- Manual: Candidate meets both gates -> Activate button enabled.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 5) Performance Dashboard (P1)

> **Context:** Provide admin visibility into per-model performance and recommendation to activate.

### E1 � Performance API (Complexity: Medium)

**Problem statement**  
Admins need per-model acceptance rates, weekly trends, and a recommendation signal for activation.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-performance.controller.ts` � new `/admin/ml/performance` endpoint.
- Backend: `apps/api/src/ml/ml-performance.service.ts` � aggregation logic.
- Docs: `tasks/codemapcc.md` � document endpoint.

**Implementation plan**
1. Aggregate per-model counts and acceptance rates from `baseline_field_assignments`.
2. Build weekly trend data for last 12 weeks using `assigned_at`.
3. Return `activeModel`, `candidateModel`, `models[]`, `trend[]`, and `recommendation` when candidate beats active by >= 5% and >= 1000 suggestions.
4. Emit audit log `ml.performance.fetch` with date range.

**Checkpoint E1 � Verification**
- Manual: `GET /admin/ml/performance?startDate=2026-01-01&endDate=2026-02-15` returns JSON with `models` and 12 `trend` points.
- DB:
```sql
SELECT model_version_id,
       COUNT(*) AS suggestions,
       COUNT(*) FILTER (WHERE suggestion_accepted = true) AS accepted
FROM baseline_field_assignments
WHERE suggestion_confidence IS NOT NULL
GROUP BY model_version_id;
```
Expected result: API counts align with DB aggregates.
- Logs: `ml.performance.fetch` includes `startDate`, `endDate`.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### E2 � Admin Performance UI (Complexity: Medium)

**Problem statement**  
We need a dedicated admin page to display model performance and activation recommendations.

**Files / Locations**
- Frontend: `apps/web/app/admin/ml/performance/page.tsx` � new admin UI page.
- Frontend: `apps/web/app/lib/api/admin.ts` � add `fetchMlPerformance` helper.
- Frontend: `apps/web/app/admin/ml/page.tsx` � add link to performance page.
- Docs: `tasks/codemapcc.md` � document route.

**Implementation plan**
1. Render summary cards for active model, candidate model, and acceptance delta.
2. Render table of model versions with counts and acceptance rates.
3. Render 12-week trend chart using simple HTML/CSS (no new deps).
4. Include explicit "Activate" button that calls `/admin/ml/models/activate`.

**Checkpoint E2 � Verification**
- Manual: Visit `/admin/ml/performance` as admin and verify cards, table, and trend chart render.
- Manual: Click "Activate" for candidate model -> see success toast and active model updates.
- Regression: `/admin/ml` metrics page still loads.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 6) Execution Order (Do Not Skip)

**Critical path dependencies:**
1. **A1** Training data export endpoint � No dependencies.
2. **A2** Data quality filters � Depends on A1 (same endpoint/service).
3. **B1** Model version admin API � No dependencies.
4. **B2** ML service activation endpoint � No dependencies.
5. **B3** API model activation � Depends on B1 and B2.
6. **C1** A/B model selection � Depends on B1 and B2.
7. **C2** Suggestion outcome tracking � Depends on C1 (modelVersionId in place).
8. **D0** Synthetic training data generator � No dependencies.
9. **D1** Fine-tuning script � Depends on A1/A2 and optional D0.
10. **D2** Register trained model � Depends on D1 and B1.
11. **D3** Global volume trigger + job state � Depends on A1/A2.
12. **D4** Assisted training run + auto-register � Depends on D3 and D1.
13. **D5** Activation gates (offline + online) � Depends on E1 and D4.
14. **E1** Performance API � Depends on C2 and B1.
15. **E2** Performance UI � Depends on E1 and B3.
**Parallel execution opportunities:**
- B1 and B2 can run in parallel before B3.
- C2 can run in parallel with D1 after C1 is in place.
- D0 can run in parallel with A1/A2 and B1/B2.
- D3 can run in parallel with D1/D2 once A1/A2 are complete.
- E1 can run in parallel with D1/D2 once C2 is complete.
**Blocking relationships:**
- A/B routing (C1) is BLOCKED until ML service accepts model selection (B2).
- Performance UI (E2) is BLOCKED until Performance API (E1).
- Model activation UI (E2) is BLOCKED until API activation (B3).
- Activation gates (D5) are BLOCKED until E1 and D4.

---

## 7) Definition of Done

**Feature Completeness:**
- Dataset export is admin-only, filtered, and produces required training fields.
- Models can be registered, activated, and swapped without downtime.
- A/B routing deterministically assigns models and persists outcomes.
- Synthetic data generator available and synthetic rows excluded from validation/test metrics.
- Training script produces a versioned model artifact with metrics.
- Assisted auto-learning runs globally on volume-only trigger (>=1000 qualified corrections) and auto-registers candidate models.
- Activation is gated by offline (>=2% accuracy delta) and online (>=5% acceptance delta with >=1000 suggestions) thresholds.
- Performance dashboard shows per-model metrics and recommendation.
**Data Integrity:**
- Suggestion metadata remains derived-only (no authoritative mutation).
- Exactly one active model per modelName at any time.
- Audit logs exist for export, model register, and model activation.

**No Regressions:**
- API builds without errors (docker compose exec -T api npm run build)
- API builds without errors (docker compose exec -T web npm run build)
- Review page still supports manual assignment and suggestions.

**Documentation:**
- `tasks/codemapcc.md` updated with new files/endpoints/routes.
- `tasks/executionnotes.md` updated with completion evidence.

---

## 8) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (Run After Every Task):**
- [ ] API builds: `cd apps/api && npm run build` -> no errors.
- [ ] Web builds: `cd apps/web && npm run build` -> exit code 0.
- [ ] Login flow works: Navigate to `/login` -> enter credentials -> redirects to `/`.

**Task Group A � Data Export:**
- [ ] Export returns data
Steps: `GET /admin/ml/training-data?startDate=2026-02-01&endDate=2026-02-15&minCorrections=10` -> JSON array.
Expected: Each row has `textSegment`, `suggestedField`, `userAssignedField`, `confidence`, `accepted`.
- [ ] Insufficient corrections returns 400
Steps: Call with narrow date range -> expect `code="insufficient_corrections"`.

**Task Group B � Model Registry/Activation:**
- [ ] Register model
Steps: `POST /admin/ml/models` with metrics payload -> row created.
Expected: `isActive=false`.
- [ ] Activate model
Steps: `POST /admin/ml/models/activate` with version -> returns active version.
Expected: exactly one active model in DB.

**Task Group C � A/B Testing:**
- [ ] A/B routing deterministic
Steps: Run suggestions for two different baselines -> logs show different `abGroup` values.
Expected: both models receive suggestions.
- [ ] Suggestion outcome tracking
Steps: accept one, modify one, clear one -> DB shows `suggestionAccepted` true/false/null.

**Task Group D � Training Pipeline:**
- [ ] Generate synthetic dataset
Steps: `python training/generate_synthetic.py --templates training/synthetic_templates.json --output C:\data\synthetic.json --count 200 --seed 42`.
Expected: JSON array with `isSynthetic=true` in each row.
- [ ] Run training script
Steps: `python training/finetune.py --input C:\data\training.json --synthetic C:\data\synthetic.json --synthetic-ratio 0.2 --output C:\models\minilm-finetuned-v2026-02-17 --epochs 1 --batch-size 16`.
Expected: metrics printed and model directory created.
- [ ] Register trained model
Steps: `POST /admin/ml/models` with metrics.json -> row created.
- [ ] Assisted auto-learning trigger (global, volume-only)
Steps: Ensure >=1000 qualified corrections since last success -> job created once; with <1000 -> no job.
Expected: one global job max, no per-user/account triggers.
- [ ] Assisted training run + auto-register
Steps: Trigger job -> ML service completes -> candidate model registered with `isActive=false`.
Expected: `ml_training_jobs` marked succeeded; model registered.
- [ ] Activation gates enforced
Steps: Candidate fails offline or online gate -> Activate disabled; passes both -> enabled.
Expected: Offline >=2% accuracy delta and online >=5%/1000 required.
**Task Group E � Performance Dashboard:**
- [ ] Performance API
Steps: `GET /admin/ml/performance?startDate=2026-01-01&endDate=2026-02-15`.
Expected: JSON includes `models`, `trend`, `recommendation`.
- [ ] Performance UI
Steps: Visit `/admin/ml/performance` as admin.
Expected: summary cards, model table, and trend chart render.

**Integration Tests (Run After All Tasks Complete):**
- [ ] End-to-end flow
Steps: Export dataset -> train model -> register model -> activate -> run suggestions -> see updated metrics in performance page.

**Regression Tests:**
- [ ] Manual field assignment still works without suggestions.
- [ ] Existing `/admin/ml` metrics page still loads and refreshes.

---

## 9) Post-Completion Checklist

- [ ] Update `tasks/executionnotes.md` with (append-only; newest entry must be the last/bottom entry)
  - [ ] New entry is added at the BOTTOM (latest entry must be last)
  - [ ] Completion date
  - [ ] What was built (reference task IDs)
  - [ ] Any deviations from plan (with reasons)
  - [ ] Lessons learned (add to `tasks/lessons.md` if applicable)
- [ ] Update `tasks/codemapcc.md` with new file paths
- [ ] Run full regression suite
- [ ] Tag commit: `git tag v8.9 -m "ML Model Training & Fine-Tuning complete"`

---
