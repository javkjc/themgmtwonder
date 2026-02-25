## v8.9 (remainder) + v8.10 — Optimal Extraction Accuracy

**Date:** 2026-02-22 (pivot recorded 2026-02-24)
**Scope:** Complete the remaining v8.9 tasks (C1/C2/D3/D5/E1/E2), then build the full v8.10 Optimal Extraction Accuracy milestone: PyMuPDF PDF ingestion, OpenCV preprocessor container, Qwen 2.5 1.5B via Ollama replacing LayoutLMv3, zone classifier, pgvector RAG few-shot injection, per-field confidence tiers, verification UI, embed-on-confirm learning loop, and seed corpus. Fine-tuning pipeline (D4/L2/L3/L5) dropped per SLM+RAG pivot (ADR 2026-02-24).
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
- [NO] UI changes outside the review page and `/admin/ml` routes.
- [NO] Changes to PaddleOCR worker character recognition internals.

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Schema Missing:** If `baseline_field_assignments` is missing `confidence_score`, `zone`, `bounding_box`, `extraction_method`, `llm_reviewed`, or `llm_reasoning` after migration runs.
- **STOP - Schema Missing:** If `attachment_ocr_outputs` is missing `document_type_id`, `extraction_path`, `preprocessing_applied`, `overall_confidence`, or `processing_duration_ms` after migration runs.
- **STOP - New Dependency Unapproved:** If any new Python package is needed beyond `torch`, `PyMuPDF`, `opencv-python-headless`, `httpx` — stop and request approval. Approved additions for the SLM+RAG pivot: `httpx` (Ollama HTTP client), `pgvector` npm package (Drizzle type support for vector columns).
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

### D4 — Assisted Training Run + Auto-Register Candidate
**Status:** 🗑️ DELETED — dropped by SLM+RAG pivot (ADR 2026-02-24). This task depended on L2 (LayoutLMv3 fine-tuning script), which has been dropped. The RAG learning loop (M1) replaces this capability without requiring a GPU training pipeline. Do not implement.

---

### D5 — Activation Gates (Online Only) (Complexity: Medium)
**Revised by:** ADR 2026-02-24 — offline gate and Golden Set gate dropped (no fine-tuning pipeline). Online gate retained as the sole activation signal.

**Problem statement**
Admin activation of a candidate model must be gated by a measurable online quality threshold. Activation remains explicit admin action only — no auto-activation.

**Rules**
1. **Online gate:** candidate must beat active by **≥5% acceptance delta** and have **≥1000 suggestions** served.
2. Activation remains explicit admin action only.

**Files / Locations**
- Backend: `apps/api/src/ml/ml-performance.service.ts` — compute online gate status per candidate.
- Backend: `apps/api/src/ml/ml-models.service.ts` — block `activateModel()` if online gate not met.
- Frontend: `apps/web/app/admin/ml/performance/page.tsx` — disable Activate button with tooltip showing gate status.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. `MlPerformanceService.getGateStatus(candidateVersionId)`:
   - Load online acceptance delta from `baseline_field_assignments` (candidate vs active acceptance rate).
   - Load suggestion count for candidate.
   - Return `{onlineGateMet, onlineDelta, onlineSuggestionCount}`.
2. `MlModelsService.activateModel()`: call `getGateStatus`; if `onlineGateMet=false`, throw `BadRequestException` with delta and count details.
3. Frontend: render Activate button disabled with tooltip showing acceptance delta and suggestion count vs required thresholds.
4. Update `tasks/codemapcc.md`.

**Checkpoint D5 — Verification**
- Manual: Candidate with <1000 suggestions → Activate button disabled; tooltip shows online gate failure with count.
- Manual: Candidate with ≥1000 suggestions but <5% acceptance delta → Activate button disabled; tooltip shows delta.
- Manual: Candidate meeting online gate → Activate button enabled; activation succeeds.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

**D6 — Immutable Baseline Policy (Governance — no code task)**
Once a baseline reaches `status = 'confirmed'`, it is permanently locked. This is already enforced by the existing state machine (`confirmBaseline()` is a one-way transactional transition; `correctionReason` is required to overwrite assignments on reviewed baselines). The following rules are policy — document them and enforce them operationally:
- New model versions **never** re-process confirmed baselines. Suggestions only run on `draft` baselines.
- If backfilling improved extraction is required (e.g. after a significant model upgrade), create a new `draft` baseline on the same attachment and run suggestions. The original confirmed baseline remains the human-verified ground truth.
- Confirmed baselines are the RAG corpus source (M1); they must never be overwritten by machine-generated data. Human correction is the only valid mutation path.

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

### H2 — Ollama Service in docker-compose (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-24

**Problem statement**
The Qwen 2.5 1.5B model and nomic-embed-text embedding model must be available as a local service. Ollama manages model serving on the backend network.

**Files / Locations**
- Amend: `docker-compose.yml` — add `ollama` service, backend network only, port 11434, named model volume.
- Docs: `tasks/codemapcc.md` — document Ollama service and volume.

**Model pull strategy:** Pull on first start via entrypoint script. Smaller image; requires internet on first run only. Entrypoint pulls `qwen2.5:1.5b` and `nomic-embed-text` before starting the Ollama server. Both models cached in the named volume across restarts.

**Implementation plan**
1. Add to `docker-compose.yml`:
   ```yaml
   ollama:
     image: ollama/ollama:latest
     networks:
       - backend
     volumes:
       - ollama_models:/root/.ollama
     entrypoint: ["/bin/sh", "-c", "ollama serve & sleep 5 && ollama pull qwen2.5:1.5b && ollama pull nomic-embed-text && wait"]
     restart: unless-stopped
   ```
2. Add `ollama_models:` to top-level `volumes:` in `docker-compose.yml`.
3. Update `tasks/codemapcc.md` with Ollama service, port 11434, and volume name.

**Checkpoint H2 — Verification**
- Manual: `docker compose up ollama` starts; `GET http://ollama:11434/api/tags` from within the backend network returns JSON listing both models.
- Manual: `curl http://localhost:11434/api/tags` from host (if port exposed for dev) shows models.
- Logs: entrypoint logs show both model pulls completing.
- Regression: Other containers unaffected.

**Estimated effort:** 1 hour
**Complexity flag:** Simple

---

### F3 — pgvector Migration + baseline_embeddings Table (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-24
**Note:** Moved from v8.11 (PART 3) to v8.10 (PART 2) by ADR 2026-02-24 pivot. Required for RAG retrieval (M2) in this milestone.

**Problem statement**
RAG retrieval requires a vector store. pgvector on the existing Postgres instance is sufficient — no new database needed. This migration adds the extension and the baseline_embeddings table.

**Files / Locations**
- Amend: `docker-compose.yml` — change Postgres image to `pgvector/pgvector:pg16`.
- Amend: `apps/api/src/db/schema.ts` — add `baseline_embeddings` table definition with vector column type.
- Amend: `apps/api/drizzle/` — generate and run migration SQL.
- Docs: `tasks/codemapcc.md` — document new table and index.

**Migration SQL:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE baseline_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID REFERENCES extraction_baselines(id),
  document_type_id UUID REFERENCES document_types(id),
  embedding vector(768),
  serialized_text TEXT NOT NULL,
  confirmed_fields JSONB NOT NULL,
  is_synthetic BOOLEAN DEFAULT FALSE,
  gold_standard BOOLEAN DEFAULT FALSE,
  quality_gate TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON baseline_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Implementation plan**
1. Update `docker-compose.yml`: change `image: postgres:16` to `image: pgvector/pgvector:pg16`.
2. Add `baseline_embeddings` table to `apps/api/src/db/schema.ts` using the `pgvector` npm package for the vector column type (or raw SQL cast).
3. Generate and run migration: `docker compose exec api npx drizzle-kit migrate`.
4. Update `tasks/codemapcc.md`.

**Checkpoint F3 — Verification**
- DB: `CREATE EXTENSION vector` succeeds; `SELECT * FROM pg_extension WHERE extname = 'vector'` returns one row.
- DB: `\d baseline_embeddings` shows all columns including `embedding vector(768)`.
- DB: `\d+ baseline_embeddings` shows ivfflat index on `embedding`.
- Build: API builds without errors after schema.ts addition.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

## 7) SLM Inference via Ollama (P0 — blocks I1, J1)

### I1 — Ollama/RAG Orchestrator in ml-service (Complexity: Complex)
**Status:** ✅ Completed on 2026-02-24

**Problem statement**
Replace LayoutLMv3 with a locally-running Qwen 2.5 1.5B model (via Ollama) guided by RAG few-shot context pulled from pgvector-confirmed baselines. The deterministic post-processing pipeline (I2–I6) is preserved unchanged.

**Files / Locations**
- Amend: `apps/ml-service/model.py` — remove LayoutLMv3Processor + LayoutLMv3ForTokenClassification; replace with Ollama HTTP client (httpx).
- Amend: `apps/ml-service/model_registry.py` — replace warm-up tensor pass with `GET http://ollama:11434/api/tags` health-check ping.
- Amend: `apps/ml-service/main.py` — update `POST /ml/suggest-fields` request/response contract.
- New: `apps/ml-service/prompt_builder.py` — Phase 2 serialization (zone-tagged text blocks) + Ollama prompt assembly.
- Amend: `apps/ml-service/requirements.txt` — remove `sentence-transformers`, `transformers`, `datasets`; add `httpx`.
- Docs: `tasks/codemapcc.md` — update ML service section.

**New POST /ml/suggest-fields request shape:**
```json
{
  "baselineId": "uuid",
  "documentTypeId": "uuid | null",
  "segments": [{ "id": "", "text": "", "boundingBox": {}, "pageNumber": 0, "confidence": 0.0 }],
  "fields": [{ "fieldKey": "", "label": "", "fieldType": "" }],
  "pageWidth": 0,
  "pageHeight": 0,
  "pageType": "digital | scanned",
  "ragExamples": [{ "serializedText": "", "confirmedFields": {} }]
}
```

**New POST /ml/suggest-fields response shape (per suggestion):**
```json
{
  "fieldKey": "invoice_total",
  "suggestedValue": "1200.00",
  "zone": "footer",
  "boundingBox": {},
  "extractionMethod": "qwen-1.5b-rag",
  "rawOcrConfidence": 0.97,
  "ragAgreement": 1.0,
  "modelConfidence": null
}
```

**Implementation plan**
1. **prompt_builder.py — Phase 2 serialization:** Given sorted, zone-tagged segments (from I2), produce structured text:
   - Merge fragments sharing the same zone and y-band (±5px).
   - Table rows: sort cells left-to-right within same y-band.
   - Multi-column: left column first (x < pageWidth/2), then right.
   - Output format:
     ```
     [ZONE: header]
     Invoice Date: 15/02/2026

     [ZONE: line_items]
     1 x Widget A  $50.00

     [ZONE: footer]
     Total: $187.00
     ```
2. **prompt_builder.py — prompt assembly:** Combine system prompt + field schema + RAG examples + serialized document into Ollama payload. Every field in the JSON schema passed to `format` MUST be nullable (`type: ["string", "null"]`, `default: null`) — this is the only escape valve when a field is absent from the document.
3. **model.py:** Replace LayoutLMv3 client with `httpx` POST to `http://ollama:11434/api/generate`:
   ```python
   {"model": "qwen2.5:1.5b", "prompt": "...", "format": {<json_schema>}, "stream": False}
   ```
4. **model_registry.py:** Replace tensor warm-up with `GET http://ollama:11434/api/tags`; confirm `qwen2.5:1.5b` appears in response.
5. **Compute ragAgreement:** After I4 normalization (done in the API, not here), compare each field's `suggestedValue` (post-normalization) against the `confirmedFields` from each RAG example for the same `fieldKey`. `ragAgreement = 1.0` if any example matches exactly; `0.0` otherwise. Return raw value; API computes agreement after normalization.
   - In ml-service: return `ragAgreement` as the pre-normalization string comparison against RAG `confirmedFields`. Mark clearly in response that final ragAgreement is re-evaluated by API post-normalization.
6. **boundingBox per suggestion:** Use the highest-confidence OCR segment whose text contributed to the extracted value; null if not determinable.
7. **Graceful degradation:** If Ollama is not reachable → `{ok: false, error: {code: "model_not_ready"}}`. If pgvector RAG unavailable (ragExamples empty): log warning, proceed with zero-shot (empty ragExamples array). Never crash.
8. Update `tasks/codemapcc.md`.

**Checkpoint I1 — Verification**
- Manual: `POST /ml/suggest-fields` returns suggestions with `extractionMethod: 'qwen-1.5b-rag'`, `zone`, and `rawOcrConfidence` per field.
- Manual: With `ragExamples` populated, suggestions for fields present in examples show `ragAgreement: 1.0` when values match.
- Manual: Ollama container stopped → endpoint returns `{ok: false, error: {code: "model_not_ready"}}` immediately (no hang).
- Manual: Empty `ragExamples` → zero-shot extraction still returns suggestions (may be null for missing fields).
- Logs: model_registry.py warm-up pings Ollama `/api/tags` on container start; logs success or warns if qwen model not yet pulled.
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
   - `extraction_method` = `'qwen-1.5b-rag'`.
   - `llm_reasoning` — structured inference trace object (the "debug sidecar"); persisted on every suggestion so any extraction failure can be diagnosed without re-running inference:
     ```json
     {
       "rawOcrConfidence": 0.98,
       "modelConfidence": null,
       "zone": "line_items",
       "dsppApplied": true,
       "dsppTransforms": ["S→5", "O→0"],
       "validationOverride": null,
       "ragAgreement": 0.0,
       "ragRetrievedCount": 3,
       "documentTypeScoped": true,
       "fieldSchemaVersion": 1
     }
     ```
     - `rawOcrConfidence`: OCR-reported confidence from the segment (null for text-layer segments where PaddleOCR is not used).
     - `modelConfidence`: always null — dropped (logprob extraction from grammar-constrained JSON unreliable on 1.5B model); kept for schema compatibility only.
     - `dsppApplied`: true if any DSPP substitution was made.
     - `dsppTransforms`: list of substitutions applied (e.g. `["S→5"]`); empty array if none.
     - `validationOverride`: `'type_mismatch'` if type validation zeroed confidence; null otherwise.
     - `ragAgreement`: binary 1.0 or 0.0 — whether any RAG example matched this field's normalized value exactly.
     - `ragRetrievedCount`: number of RAG examples retrieved (0 if pgvector unavailable or cold start).
     - `documentTypeScoped`: true if RAG query was filtered by `document_type_id`; false if unscoped fallback used.
6. **Conflicting field detection** (layout injection guard): after aggregating all suggestions, scan for any `fieldKey` that appears in more than one zone with confidence ≥ 0.50. If found, set `validationOverride = 'conflicting_zones'` and zero confidence on all but the highest-confidence occurrence. Log the conflict. This catches invisible-text injection (white-on-white text in a different zone claiming the same field) — LayoutLMv3's multimodal image branch provides natural resilience but does not guarantee immunity. The conflict flag surfaces these cases for human review rather than silently auto-confirming a potentially fraudulent value.
7. **Confidence computation** (`field-type-validator.ts`): apply hard overrides first, then fallback formula for non-math fields.

   **Hard overrides (applied first, non-negotiable — set by I6 after this step):**
   - I6 math reconciliation PASSES → `confidence_score = 1.0` (auto_confirm tier)
   - I6 math reconciliation FAILS → `confidence_score = 0.0` (flag tier)
   - Type validation fails (I3 step 4) → `confidence_score = 0.0` (flag tier)
   - Conflicting zones (I3 step 6) → `confidence_score = 0.0` on all but highest (flag tier)
   - Conflicting pages (I5) → `confidence_score = 0.0` on all occurrences (flag tier)

   **Fallback formula (non-math fields passing all hard overrides):**
   ```
   finalScore = clamp(
     0.65 * ragAgreement + 0.35 * (rawOcrConfidence ?? 0.0),
     0.0, 1.0
   )
   ```
   Post-computation penalty: if `dsppApplied = true` → subtract 0.10 (floor 0.0).

   **ragAgreement definition (binary):** After I4 normalization, compare the field's `normalizedValue` against `confirmedFields[fieldKey]` from each RAG example (post-normalization, exact match). `ragAgreement = 1.0` if any example matches; `0.0` otherwise. No embedding calls needed for this comparison.

   **Consequence:** Non-math fields without RAG context max out at `0.35 * rawOcrConfidence ≈ 0.33` → always flag tier. Non-math fields with RAG agreement reach up to `0.65 + 0.35 = 1.0` but typically `0.65 + 0.30 ≈ 0.95` → auto_confirm. This is the correct posture: human review required until the RAG corpus is populated.
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

## 10) Training Pipeline (SLM+RAG pivot — fine-tuning dropped)

### L1 — training-worker Container Setup (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-23
**Note:** 🗑️ TO BE DECOMMISSIONED — this container will be removed after M1–M4 are wired in. The RAG learning loop (M1) replaces the fine-tuning pipeline. Container remains running until M4 is verified; then remove from `docker-compose.yml`. Do not add new work to this container.

---

### L2 — LayoutLMv3 Fine-Tuning Script
**Status:** 🗑️ DELETED — dropped by SLM+RAG pivot (ADR 2026-02-24). No fine-tuning pipeline required. Do not implement.

---

### L3 — Spatially-Annotated Training Data Export
**Status:** 🗑️ DELETED — dropped by SLM+RAG pivot (ADR 2026-02-24). No fine-tuning consumer exists. Do not implement.

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

### L5 — Synthetic Data Generator (Spatial)
**Status:** 🗑️ DELETED — dropped by SLM+RAG pivot (ADR 2026-02-24). Cold-start is handled by the seed corpus (L6) instead. Do not implement.

---

## 11) RAG Learning Loop (P1 — depends on I1, F3)

### M1 — Embed-on-Confirm (Complexity: Medium)
**Status:** ✅ Completed on 2026-02-24

**Problem statement**
After a baseline is confirmed, qualifying extractions must be embedded and stored in `baseline_embeddings` so future similar documents can retrieve them as few-shot examples. This is the learning loop replacing fine-tuning.

**Files / Locations**
- Amend: `apps/api/src/baseline/baseline.service.ts` (or `confirmBaseline()` entrypoint) — hook into confirmation event.
- New: `apps/api/src/ml/rag-embedding.service.ts` — quality gate check + embed + store logic.
- Docs: `tasks/codemapcc.md`.

**Quality gate (must ALL pass to embed):**
- **Condition A:** I6 math reconciliation = 'pass' on the confirmed baseline (`mathReconciliation: 'pass'` in any field's `llm_reasoning`), OR
- **Condition B:** All field assignments have `suggestionAccepted = true` (human made zero modifications — model got everything right), OR
- **Condition C:** `gold_standard = true` on the baseline (admin-set flag, future use).

**Volume cap:** Max 5 embeddings per `document_type_id` in `baseline_embeddings`. When cap is reached, replace the oldest non-gold entry. Gold Standard entries (`gold_standard = true`) are never evicted.

**Implementation plan**
1. `RagEmbeddingService.embedOnConfirm(baselineId)`:
   - Load baseline + all field assignments.
   - Run quality gate check (Condition A or B or C).
   - If gate fails: log `rag.embed.skipped` with reason; return.
   - Serialize the confirmed fields using the Phase 2 serialization from `prompt_builder.py` (call ML service `POST /ml/serialize` or reproduce in TS — prefer calling ML service to avoid duplicating serialization logic).
   - Call Ollama `POST http://ollama:11434/api/embeddings` with `{model: "nomic-embed-text", prompt: serializedText}` → get 768-dim vector.
   - Determine `quality_gate`: `'math_pass'` | `'zero_corrections'` | `'admin'`.
   - Check volume cap: count existing embeddings for `document_type_id`; if ≥5, find oldest non-gold row and delete it.
   - Insert into `baseline_embeddings`.
   - Emit audit log `rag.embed.stored` with `baselineId`, `documentTypeId`, `qualityGate`.
2. Call `embedOnConfirm()` from the baseline confirmation handler (after `status = 'confirmed'` is committed; non-blocking — do not let embedding failure prevent confirmation).
3. Update `tasks/codemapcc.md`.

**Checkpoint M1 — Verification**
- Manual: Confirm a baseline where I6 math reconciliation passed → `baseline_embeddings` gains a new row; `quality_gate = 'math_pass'`.
- Manual: Confirm a baseline where all suggestions were accepted unchanged → row inserted; `quality_gate = 'zero_corrections'`.
- Manual: Confirm a baseline where user modified some fields and math did not reconcile → no row inserted; `rag.embed.skipped` log entry present.
- Manual: Confirm 6 qualifying baselines for same `document_type_id` → only 5 rows remain; oldest non-gold evicted.
- Manual: Ollama embedding endpoint unreachable → confirmation still succeeds; embedding error logged; no exception propagated.

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### M2 — RAG Retrieval Service (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-24

**Problem statement**
Before calling the SLM, retrieve the top-3 most similar confirmed baselines from pgvector filtered by `document_type_id`. These become the few-shot examples in the prompt.

**Files / Locations**
- New: `apps/api/src/ml/rag-retrieval.service.ts` — embed query text, query pgvector, return top-3.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. `RagRetrievalService.retrieve(serializedText, documentTypeId)`:
   - Call Ollama `POST /api/embeddings` with `{model: "nomic-embed-text", prompt: serializedText}` to get query vector.
   - Query `baseline_embeddings` using pgvector cosine distance:
     ```sql
     SELECT serialized_text, confirmed_fields
     FROM baseline_embeddings
     WHERE document_type_id = $1
     ORDER BY embedding <=> $2
     LIMIT 3;
     ```
   - Return `[{serializedText, confirmedFields}]`.
2. **Graceful degradation:** If pgvector extension unavailable or query fails → log warning `rag.retrieval.unavailable`; return empty array `[]`. Never throw. Caller receives empty RAG context and proceeds zero-shot.
3. If `documentTypeId` is null: skip the `WHERE document_type_id = $1` filter (unscoped fallback).
4. Update `tasks/codemapcc.md`.

**Checkpoint M2 — Verification**
- Manual: With embeddings in `baseline_embeddings`, call retrieval → returns up to 3 results ordered by similarity.
- Manual: `documentTypeId` filter applied — results only include entries for that type.
- Manual: pgvector extension disabled → returns empty array; log entry `rag.retrieval.unavailable` present; no exception.
- Manual: Empty `baseline_embeddings` table → returns empty array; no error.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

### M3 — Prompt Builder Serialization Endpoint (Complexity: Simple)
**Status:** ✅ Completed on 2026-02-24

**Problem statement**
The API needs a way to serialize OCR segments into Phase 2 format (zone-tagged text blocks) without duplicating the logic from `prompt_builder.py` in TypeScript. Expose a lightweight serialization endpoint on the ML service.

**Files / Locations**
- New: `apps/ml-service/prompt_builder.py` — already specified in I1 rewrite; this task formalizes the `POST /ml/serialize` endpoint exposing the serializer.
- Amend: `apps/ml-service/main.py` — add `POST /ml/serialize` endpoint.
- Docs: `tasks/codemapcc.md`.

**Note:** `prompt_builder.py` is built as part of I1. M3 adds only the HTTP endpoint wrapper so the API can call serialization without duplicating the logic.

**Implementation plan**
1. `POST /ml/serialize` request:
   ```json
   {
     "segments": [{ "text": "", "boundingBox": {}, "pageNumber": 0, "zone": "" }],
     "pageWidth": 0
   }
   ```
2. Response: `{ "serializedText": "[ZONE: header]\nInvoice Date: ...\n\n[ZONE: footer]\nTotal: ..." }`.
3. Calls the same `serialize_segments()` function used internally by the `POST /ml/suggest-fields` handler — no duplication.
4. Update `tasks/codemapcc.md`.

**Checkpoint M3 — Verification**
- Manual: `POST /ml/serialize` with zone-tagged segments returns a structured text block with `[ZONE: ...]` headers.
- Manual: Multi-column segments sorted left-before-right in output.
- Manual: Segments within same y-band merged into single line.

**Estimated effort:** 1 hour
**Complexity flag:** Simple

---

### M4 — Wire M1–M3 into field-suggestion.service.ts (Complexity: Medium)

**Problem statement**
The field suggestion entry point must call M2 (RAG retrieval) before the ML service call, pass `ragExamples` in the request, and trigger M1 (embed-on-confirm) after confirmation. This task wires all RAG components into the existing suggestion flow.

**Files / Locations**
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — add M2 call before ML request; pass `ragExamples`.
- Amend: `apps/api/src/baseline/baseline.service.ts` — call M1 after `confirmBaseline()`; call `OcrService.markOcrUtilized()` to lock OCR.
- Docs: `tasks/codemapcc.md`.

**Implementation plan**
1. In `field-suggestion.service.ts`, before calling `POST /ml/suggest-fields`:
   - Call `RagRetrievalService.retrieve(serializedText, documentTypeId)` → `ragExamples[]`.
   - Serialize current document: call `POST /ml/serialize` with current segments → `serializedText`.
   - Include `ragExamples` in the ML service request body.
   - Log `rag.retrieval.used` with `retrievedCount` and `documentTypeId`.
2. In `baseline.service.ts`, after `status = 'confirmed'` is persisted:
   - Call `RagEmbeddingService.embedOnConfirm(baselineId)` in a non-blocking fire-and-forget (do not await; wrap in try/catch; log any error).
   - Call `OcrService.markOcrUtilized(ocrId, 'authoritative_record', userId)` to lock the source OCR output. Fetch `ocrId` from the current confirmed OCR for the attachment. If no confirmed OCR exists (draft only), call on the current draft OCR. Wrap in try/catch — OCR lock failure must never block baseline confirmation.
   - Reason: baseline confirmation is the correct governance trigger for OCR lock. The "Confirm Extraction" button on the task detail page is a vestigial manual step that pre-dates this coupling; locking here makes it redundant.
3. Ensure `ragAgreement` in `llm_reasoning` is re-evaluated post-I4 normalization using the retrieved examples.
4. Update `tasks/codemapcc.md`.

**Checkpoint M4 — Verification**
- Manual: Generate suggestions on a baseline with a confirmed similar baseline in `baseline_embeddings` → `llm_reasoning.ragRetrievedCount > 0`; `ragAgreement = 1.0` for matching fields.
- Manual: No matching embeddings → `ragRetrievedCount = 0`; `ragAgreement = 0.0`; suggestion still returned.
- Manual: Confirm a qualifying baseline → `baseline_embeddings` row appears (M1 called).
- Manual: Confirm a qualifying baseline → `GET /attachments/:id/ocr/redo-eligibility` returns `allowed: false`, `reason: 'Authoritative record created from this data'`.
- Manual: Confirm a qualifying baseline → `GET /attachments/:id/ocr/current` shows `utilizationType = 'authoritative_record'`.
- Regression: Suggestions still generated when pgvector unavailable (M2 returns empty; zero-shot path).
- Regression: Baseline confirmation succeeds even if OCR lock call throws (non-blocking).

**Estimated effort:** 2–3 hours
**Complexity flag:** Medium

---

### M5-pre — Remove "Confirm Extraction" Button (Complexity: Simple)
**Depends on:** M4 (OCR lock wired to baseline confirm)

**Problem statement**
The "Confirm Extraction" button on the task detail page is vestigial. Since M4 wires OCR locking to baseline confirmation, the button serves no purpose and creates user confusion (users don't know it exists; the real lock now happens automatically). Remove it from the UI and hide the "A confirmed extraction already exists" message that replaces it.

**Files / Locations**
- Amend: `apps/web/app/task/[id]/page.tsx` — remove the "Confirm Extraction" button block and associated modal.

**Implementation plan**
1. In `page.tsx`, remove the conditional block rendering "Confirm Extraction" button (currently guarded by `recordLifecycleStatus === 'draft' && recordProcessingStatus === 'completed'`).
2. Remove the `showConfirmOcrModal` state, `handleConfirmOcr`, `executeConfirmOcr`, `ocrConfirming` state, `pendingOcrConfirmation` state, and the OCR Confirmation Modal JSX block — all are exclusively used by this button.
3. Remove the import of `confirmOcrOutput` from `../../lib/api/ocr` if it is no longer referenced elsewhere in the file.
4. The `POST /ocr/:ocrId/confirm` backend endpoint is retained — it remains a valid API call made internally by M4 via `markOcrUtilized`. Do not remove the backend.
5. Update `tasks/codemapcc.md` if the frontend route entry references the confirm button.

**Checkpoint M5-pre — Verification**
- Manual: Task detail page loads; no "Confirm Extraction" button visible anywhere on the attachments panel.
- Manual: No "A confirmed extraction already exists" message visible.
- Manual: Confirm a baseline → redo-eligibility correctly blocks re-OCR (M4 lock fires; UI shows "Redo Retrieval" disabled with correct reason).
- Regression: "Retrieve Data", "Redo Retrieval", "Review Extraction", "Apply to Remark", "Apply to Description" buttons all still function correctly.
- Regression: No TypeScript build errors after state/handler removal.

**Estimated effort:** 1 hour
**Complexity flag:** Simple

---

### L6 — Seed Corpus (Complexity: Simple)

**Problem statement**
RAG retrieval returns no results until confirmed baselines accumulate. A seed corpus of synthetic gold-standard examples provides immediate few-shot context for all supported document types before any real baselines are confirmed.

**Files / Locations**
- New: `seed_corpus/` directory in repo root — one JSON file per document type.
- New: `apps/api/src/scripts/seed-corpus.ts` — deploy script; reads `seed_corpus/`, embeds, inserts into `baseline_embeddings`.
- Docs: `tasks/codemapcc.md`.

**Seed file format:**
```json
{
  "documentType": "invoice",
  "serializedText": "[ZONE: header]\nInvoice Date: 15/01/2026\n\n[ZONE: footer]\nTotal: $1200.00",
  "confirmedFields": {
    "invoice_total": "1200.00",
    "invoice_date": "2026-01-15"
  },
  "isSynthetic": true,
  "goldStandard": true
}
```

**Implementation plan**
1. Create `seed_corpus/` directory with at least one JSON file per supported document type (target: 5–10 files). Serialized text must use Phase 2 format (zone-tagged blocks). Use realistic but fictional values.
2. `seed-corpus.ts` deploy script:
   - Read all JSON files from `seed_corpus/`.
   - For each: call Ollama `POST /api/embeddings` with `nomic-embed-text` + `serializedText` → embedding vector.
   - Upsert into `baseline_embeddings` with `is_synthetic=true`, `gold_standard=true`, `quality_gate='admin'`.
   - Idempotent: upsert by `documentType + is_synthetic` (use ON CONFLICT or check-before-insert).
   - Gold Standard entries are never evicted by the volume cap (M1 logic already handles this).
3. Script is run manually on first deploy: `docker compose exec api npx ts-node src/scripts/seed-corpus.ts`.
4. Document run instructions in `tasks/codemapcc.md`.

**Dependency:** L6 depends on I1 (prompt_builder.py must exist for Phase 2 serialized text format) and F3 (baseline_embeddings table must exist).

**Checkpoint L6 — Verification**
- Manual: Run seed script → `baseline_embeddings` contains one row per seed file; all have `gold_standard=true`, `is_synthetic=true`.
- Manual: Run script again → idempotent; no duplicate rows inserted.
- Manual: Generate suggestions on a new baseline of a seeded document type → `ragRetrievedCount > 0`; few-shot examples from seed corpus used.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

## 12) Execution Order (Do Not Skip)

**Critical path:**
1. **F1** New tables migration — no dependencies.
2. **F2** Amend existing tables — depends on F1.
3. **F3** pgvector migration + baseline_embeddings — no external dependencies (parallel with F1/F2; must complete before M1/M2).
4. **G1** Preprocessor container — no dependencies (parallel with F1/F2/F3).
5. **H1** PyMuPDF OCR routing — depends on G1 (preprocessor must be running).
6. **H2** Ollama service in docker-compose — no dependencies (parallel with G1); must be running before I1 warm-up.
7. **C1** A/B model selection — no schema dependencies.
8. **C2** Suggestion outcome tracking — no schema dependencies.
9. **I1** Ollama/RAG orchestrator rewrite — depends on H2 (Ollama must be running) and F3 (baseline_embeddings must exist for M2 integration); can start after H2 and F3.
10. **I2** Zone classifier — depends on I1 (already built; verify unchanged).
11. **I3** Updated field suggestion service — depends on I1/I2 and F2 (new columns must exist); update confidence formula per ADR §4.
12. **M3** Prompt builder serialization endpoint — depends on I1 (prompt_builder.py built in I1 rewrite).
13. **M2** RAG retrieval service — depends on F3 (baseline_embeddings table) and H2 (Ollama for embedding).
14. **M4** Wire M1–M3 into field-suggestion.service.ts — depends on M2, M3, I1.
15. **M1** Embed-on-confirm — depends on F3, H2, M3 (serialization endpoint).
16. **L4** Populate extraction_training_examples — depends on F1/I3.
17. **L6** Seed corpus — depends on I1 (prompt_builder.py serializer exists) and F3 (baseline_embeddings table exists) and H2 (Ollama embed model available).
18. **J1** Confidence tier logic + bulk confirm — depends on I3.
19. **K1** Verification UI layout — depends on J1.
20. **K2** Keyboard flow — depends on K1.
21. **D3** Volume trigger + job state — depends on C1/C2.
22. **D5** Activation gates (online only) — depends on E1.
23. **E1** Performance API — depends on C2 and existing B1.
24. **E2** Performance UI — depends on E1 and D5.

**Parallel opportunities:**
- F1/F2/F3 and G1/H2 can all run in parallel.
- C1/C2 can run in parallel with the F/G/H infrastructure tasks.
- M2 and M3 can run in parallel once F3 and I1 are done.
- L6 can run in parallel with J1/K1/K2 once I1, F3, H2 are done.
- D3 can run in parallel with I1/I2/I3 once C1/C2 are done.
- E1 can run in parallel with D3 once C2 is done.

---

## 13) Definition of Done

**Feature Completeness:**
- A/B routing deterministically assigns models and persists outcomes (C1/C2).
- Performance dashboard shows per-model metrics, online gate status, and recommendation (E1/E2).
- Activation is gated by online gate only (≥5% acceptance delta, ≥1000 suggestions) (D5).
- Volume trigger runs globally (≥1000 qualified corrections) and queues training jobs (D3).
- All five new schema tables exist and all amended column additions are live (F1/F2).
- pgvector extension live; `baseline_embeddings` table present with ivfflat index (F3).
- Ollama service running on backend network; `qwen2.5:1.5b` and `nomic-embed-text` available (H2).
- Preprocessor container running; skewed/shadowed images corrected before OCR (G1).
- Digital PDFs use text layer directly; scanned PDFs route through preprocessor (H1).
- Qwen 2.5 1.5B via Ollama serving suggestions with `zone`, `bounding_box`, `extractionMethod: 'qwen-1.5b-rag'` per field (I1/I2/I3).
- RAG retrieval injecting top-3 few-shot examples from `baseline_embeddings` into every suggestion call (M2/M4).
- Embed-on-confirm writing qualifying baselines to `baseline_embeddings` (M1).
- Seed corpus deployed; `baseline_embeddings` has at least one gold-standard entry per document type (L6).
- Confidence tiers (auto_confirm/verify/flag) computed and surfaced in UI (J1).
- Side-by-side verification layout with PDF auto-scroll to flagged field region (K1/K2).
- Bulk confirm available for auto_confirm tier fields (J1/K2).
- Training examples captured on assignment (L4).

**Data Integrity:**
- `extraction_training_examples` rows are append-only; no updates.
- `baseline_embeddings` gold-standard rows never evicted by volume cap.
- New columns on `baseline_field_assignments` and `attachment_ocr_outputs` are nullable; no existing rows broken.
- Confirmed baselines are immutable; embedding failure never prevents confirmation.

**No Regressions:**
- `docker compose exec -T api npm run build` exits 0.
- `docker compose exec -T web npm run build` exits 0.
- Review page still supports manual assignment and suggestions for baselines without spatial data.
- Existing `/admin/ml/metrics` endpoint still works.
- Existing training data export (`/admin/ml/training-data`) still works.
- Suggestions still returned when Ollama unreachable (`model_not_ready` error — not a crash).

**Documentation:**
- `tasks/codemapcc.md` updated with every new file, endpoint, and route.
- `tasks/features.md` v8.9 and v8.10 sections reflect actual state.
- `tasks/executionnotes.md` updated with completion evidence (append-only; newest entry last).

---

## 14) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (run after every task):**
- [ ] API builds: `cd apps/api && npm run build` → no errors.
- [ ] Web builds: `cd apps/web && npm run build` → exit code 0.
- [ ] Login flow works: `/login` → credentials → redirects to `/`.

**Task Group C — A/B Testing:**
- [ ] A/B routing deterministic: run suggestions for two baselines → logs show alternating `abGroup` values.
- [ ] Suggestion outcome tracking: accept one, modify one, clear one → DB shows `suggestionAccepted` true/false/null.

**Task Group D — Assisted Auto-Learning:**
- [ ] Volume trigger: <1000 qualified corrections → no job; ≥1000 → exactly one queued job.
- [ ] Activation gate (online only): candidate with <1000 suggestions or <5% delta → Activate button disabled; above thresholds → enabled.

**Task Group E — Performance Dashboard:**
- [ ] Performance API: `GET /admin/ml/performance?startDate=...&endDate=...` returns `models`, `trend`, `recommendation`.
- [ ] Performance UI: `/admin/ml/performance` renders cards, table, trend chart.

**Task Group F — Schema:**
- [ ] All five new tables present in DB.
- [ ] New columns on `baseline_field_assignments` and `attachment_ocr_outputs` present and nullable.
- [ ] pgvector: `SELECT * FROM pg_extension WHERE extname = 'vector'` returns a row.
- [ ] `baseline_embeddings` table present with vector(768) embedding column.

**Task Group G/H — Preprocessor + PyMuPDF + Ollama:**
- [ ] Preprocessor health: `GET http://preprocessor:6000/health` returns `{status:"ok"}`.
- [ ] Digital PDF: upload → metadata shows `extraction_path='text_layer'`.
- [ ] Scanned PDF: upload → metadata shows `extraction_path='ocr_preprocessed'`; preprocessor logs show request.
- [ ] Ollama health: `GET http://ollama:11434/api/tags` (from backend network) lists `qwen2.5:1.5b` and `nomic-embed-text`.

**Task Group I — SLM Inference (Qwen 2.5 1.5B):**
- [ ] Suggestions include `zone`, `bounding_box`, `extractionMethod: 'qwen-1.5b-rag'` in response.
- [ ] DB: `baseline_field_assignments` has `zone`, `bounding_box`, `confidence_score` populated after suggestion generation.
- [ ] `llm_reasoning` contains `rawOcrConfidence`, `ragAgreement`, `ragRetrievedCount`, `modelConfidence: null`.
- [ ] Ollama stopped → endpoint returns `{ok: false, error: {code: "model_not_ready"}}` immediately.

**Task Group M — RAG Learning Loop:**
- [ ] With seed corpus loaded: generate suggestions → `llm_reasoning.ragRetrievedCount > 0` for document type with seeds.
- [ ] Confirm a qualifying baseline (math pass or zero corrections) → `baseline_embeddings` gains a new row.
- [ ] Confirm a non-qualifying baseline → no new row in `baseline_embeddings`; `rag.embed.skipped` log present.
- [ ] 6th qualifying confirm for same document type → only 5 rows remain; oldest non-gold evicted.
- [ ] Seed corpus script: run `docker compose exec api npx ts-node src/scripts/seed-corpus.ts` → rows inserted; run again → idempotent.

**Task Group J/K — Tiers + Verification UI:**
- [ ] High-confidence fields (≥0.90) show `auto_confirm` tier; "Confirm High-Confidence Fields" button visible.
- [ ] Bulk confirm: button click → all auto_confirm fields set `suggestionAccepted=true`.
- [ ] Two-panel layout renders when spatial data present.
- [ ] Clicking flag field → PDF viewer scrolls to bbox region.
- [ ] Tab, Enter, Escape, Shift+Enter keyboard shortcuts all function.

**Task Group L — Training Capture:**
- [ ] Training capture: accept spatial suggestion → `extraction_training_examples` row inserted (L4).

**Integration (run after all tasks):**
- [ ] End-to-end: upload PDF → OCR → generate suggestions (Qwen via Ollama + RAG) → review tiers in verification UI → bulk confirm auto_confirm → correct verify fields → flag fields manually confirmed → baseline confirmed → qualifying baseline embedded to `baseline_embeddings`.
- [ ] RAG loop: after 3+ confirmed baselines of same type, new suggestion for same type shows `ragRetrievedCount ≥ 1` and matching fields show `ragAgreement: 1.0`.

---

## 15) Post-Completion Checklist

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

## v8.12 — Norma: Self-Healing Document Intelligence

**Date:** 2026-02-25
**Status:** MISSION READY — Pending E1/E2 completion (v8.9 remainder)
**Prerequisite:** E1 + E2 must be complete and verified before Norma begins.

**Vision:** Transition from a Sequential Extractor to a Self-Healing Document Agent. Address the three core failure points of document AI — OCR noise, layout variance, and silent math failures — using the existing local hardware stack. No new infrastructure. No new dependencies beyond what is already approved.

**Architect's Guardrails (non-negotiable):**
1. **The Immune System Signal (Task N0):** Confidence Propagation Audit is a hard blocker. If null rate > 20% at any pipeline layer, fix that layer before Feature N1 ships. Document the null rate at all four checkpoints in `tasks/executionnotes.md`.
2. **Layout Tolerance without model training (Tasks N2b/N2c):** The 2+8 Truncation Rule and Keyword Anchor Normalization solve layout variance by giving Qwen column semantics (headers) and target data (totals). No changes to `zone_classifier.py` — ever.
3. **Ethical Learning Loop (Tasks N5/N6 — Hard Gate):** Rule Graduation is strictly gated. Correction events generate `PROPOSED` rules only. A human must `[Approve]` in `/admin/rules` before any alias becomes `ACTIVE`. Tasks N5 and N6 ship as a locked pair. N5 data tracking code must not activate rules until N6 UI is live.

**Approved packages:** None new. All features use existing stack (NestJS, Drizzle, Postgres, Ollama/Qwen, PaddleOCR, FastAPI, httpx).

**Out of scope:**
- [NO] `zone_classifier.py` changes of any kind.
- [NO] New Docker services or queue infrastructure.
- [NO] Global (non-vendor-scoped) alias rules.
- [NO] Auto-activation of alias rules without human approval.
- [NO] SSE — polling only for retry status.

**STOP Events:**
- **STOP — N0 null rate > 20%:** Fix confidence propagation before any further Norma work.
- **STOP — N5 without N6:** Do not ship correction event tracking unless the `/admin/rules` UI is scheduled in the same sprint.
- **STOP — zone_classifier.py touched:** Revert immediately. Use prompt annotation only.

---

## PART 4 — Norma v8.12: Signal Layer

### N0 — Confidence Propagation Audit (Prerequisite — Hard Blocker)

**Problem statement**
`[LOW_CONF]` tagging (N1) is only meaningful if PaddleOCR confidence values survive the full pipeline from OCR Worker to ML Service. Currently there is no verification that confidence is non-null at each layer. This audit must be completed and documented before any Signal Layer feature is written.

**Four checkpoints (must verify in order):**
1. **OCR Worker output** — `docker logs todo-ocr-worker --tail 50` after processing an attachment; confirm `segments[].confidence` is non-null in the JSON response.
2. **DB persistence** — Run:
   ```sql
   SELECT
     COUNT(*) AS total_segments,
     COUNT(*) FILTER (WHERE segments IS NOT NULL) AS with_segments
   FROM attachment_ocr_outputs
   LIMIT 1;
   ```
   Then inspect a stored `segments` JSONB value: confirm individual segment objects contain a `confidence` key with a numeric value.
3. **NestJS → ML service payload** — Add a temporary `console.log` in `field-suggestion.service.ts` before the ML HTTP call; confirm outbound `segments[].confidence` is numeric (not null/undefined) for at least 5 segments.
4. **ML service receipt** — Check `ml-service` logs after a suggestion call; confirm `_find_contributing_segment()` is finding a contributing segment with non-null `confidence` for at least one field.

**Pass criteria:** Null rate < 20% at all four checkpoints.

**On failure:** Identify the layer that drops confidence. Fix it. Re-run the audit. Only then proceed to N1.

**Output (mandatory):** Append to `tasks/executionnotes.md`:
- Null rate at each of the four checkpoints
- Whether a fix was required and what it was
- Confirmation that N1 is unblocked

**Files / Locations:**
- No code changes if audit passes cleanly.
- If fix required: amend the layer that drops confidence (NestJS serializer, DB query, or ML service segment lookup).
- Docs: `tasks/executionnotes.md` — append audit result.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple (audit) / Medium (if fix required)

---

### N1 — Contextual Linguistic Correction via LOW_CONF Tagging

**Problem statement**
PaddleOCR produces a confidence score per segment but this signal is discarded before serialization. Segments with low confidence (e.g. `5tory` at 0.42) are treated identically to high-confidence segments (e.g. `Story` at 0.97). Qwen has no signal to distrust the literal string and apply linguistic correction.

**Depends on:** N0 audit passing (confidence non-null at ML service).

**Files / Locations:**
- Amend: `apps/ml-service/prompt_builder.py` — `PromptSegment` dataclass + `serialize_segments()`.
- Amend: `apps/ml-service/main.py` — pass `confidence` through to `PromptSegment` construction.
- Docs: `tasks/codemapcc.md`.

**Implementation plan:**
1. Add `confidence: Optional[float]` field to `PromptSegment` dataclass (default `None`).
2. In `main.py` `suggest_fields()`, when constructing `PromptSegment` from each segment, pass `confidence=segment.confidence`.
3. In `serialize_segments()`, when building the cell text: if `seg.confidence is not None and seg.confidence < 0.6`, append `[LOW_CONF]` to the cell text string.
   - Example: `"5tory"` at confidence 0.42 → cell text becomes `"5tory [LOW_CONF]"`
   - Example: `"Story"` at confidence 0.97 → cell text remains `"Story"` (unchanged)
4. In `build_prompt_payload()`, add the following sentence to `system_prompt`:
   `"Segments tagged [LOW_CONF] have unreliable OCR character recognition. Use surrounding context and linguistic reasoning to infer the correct value. Do not rely on the literal character string of a [LOW_CONF] segment."`
5. Segments that have been alias-corrected (N2 alias engine sets `aliasApplied: true`) must NOT receive `[LOW_CONF]` tagging regardless of confidence — the alias already makes them trusted. This flag is set on the NestJS side before the ML call; the ML service receives the corrected text without `[LOW_CONF]`.

**Checkpoint N1 — Verification:**
- Manual: Upload a document with a known low-confidence OCR segment; check serialized text in ML service logs (add temporary `logging.info` of `serialized_document`); confirm `[LOW_CONF]` appears on that segment.
- Manual: High-confidence segment (≥0.6) → no `[LOW_CONF]` tag in serialized output.
- Manual: Suggestion quality check — for a field where `[LOW_CONF]` is tagged, verify Qwen returns a linguistically plausible value rather than the literal OCR noise string.
- Regression: Segments without confidence (None) → no `[LOW_CONF]` tag (tag only fires when confidence is explicitly below threshold, not when absent).

**Estimated effort:** 2 hours
**Complexity flag:** Simple

---

## PART 5 — Norma v8.12: Alias Engine

### N2 — M5 Alias Engine (Vendor-Scoped, Pre-LLM)

**Problem statement**
Known OCR noise patterns for specific vendors (e.g. `5tory → Story` for vendor X) are currently corrected manually on every document. A deterministic pre-LLM substitution pass using a vendor-scoped alias table eliminates recurring corrections before they reach Qwen.

**Files / Locations:**
- New: `apps/api/src/ml/alias-engine.service.ts` — alias lookup + segment correction.
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — call alias engine before segment serialization.
- Amend: `apps/api/src/ml/ml.module.ts` — register `AliasEngineService`.
- Docs: `tasks/codemapcc.md`.

**Schema dependency:** Requires `alias_rules` table from migration N_MIG (see below).

**Implementation plan:**
1. `AliasEngineService.applyAliases(segments, vendorId)`:
   - Load all `alias_rules` where `vendor_id = vendorId` AND `status = 'active'` from DB.
   - Cache per vendor with 5-minute TTL (use a simple `Map<vendorId, {rules, loadedAt}>` in-memory cache — no Redis).
   - For each segment: check if `segment.text` matches any `raw_pattern` (exact match, case-insensitive).
   - If match: replace `segment.text` with `corrected_value`; set `aliasApplied: true` on the segment object.
   - Return modified segments with `aliasApplied` flags.
2. In `field-suggestion.service.ts`, before building the ML payload:
   - Resolve `vendorId` from the document's metadata (e.g. vendor field on the baseline or attachment). If no vendor is identifiable, skip alias pass (do not error).
   - Call `AliasEngineService.applyAliases(segments, vendorId)`.
   - Pass `aliasApplied` flag per segment to ML service payload for `[LOW_CONF]` suppression logic.
3. **Hard constraint:** Alias rules are vendor-scoped only. The `alias_rules` table has a `CHECK (vendor_id IS NOT NULL)` constraint enforced at schema level. Global aliases are architecturally prohibited.
4. Log `alias.engine.applied` with `vendorId`, `ruleCount`, and count of segments corrected.

**Checkpoint N2 — Verification:**
- DB: Insert a test `active` alias rule `{vendor_id: 'vendor-test', raw_pattern: '5tory', corrected_value: 'Story'}`.
- Manual: Generate suggestions for a document from `vendor-test` containing `"5tory"` → serialized text shows `"Story"` (not `"5tory"`); log shows `alias.engine.applied` with corrected count = 1.
- Manual: Same segment — confirm no `[LOW_CONF]` tag appears on the alias-corrected segment despite low OCR confidence.
- Manual: Document from a different vendor → `"5tory"` not corrected (rule is vendor-scoped).
- Manual: No `active` rules for vendor → alias pass runs, corrects zero segments, no error.

**Estimated effort:** 1 day
**Complexity flag:** Medium

---

## PART 6 — Norma v8.12: Spatial Layer

### N3 — Selective Terse Annotation + 2+8 Truncation

**Problem statement**
Zone serialization sends full text blocks to Qwen with no spatial metadata. For `footer` and `line_items` zones, positional context (e.g. "this value is in the bottom-right") meaningfully aids extraction. Dense line-item tables also risk exceeding the effective context window on long invoices.

**Files / Locations:**
- Amend: `apps/ml-service/prompt_builder.py` — annotation logic + truncation rule.
- Amend: `apps/ml-service/model.py` — add `num_ctx: 8192` to Ollama payload.
- Docs: `tasks/codemapcc.md`.

**Implementation plan:**
1. **`num_ctx: 8192` in Ollama payload** — in `generate_fields()` in `model.py`, add `"num_ctx": 8192` to the payload dict sent to Ollama. Single line change.
2. **Terse annotation** — in `serialize_segments()`, for segments in `footer` and `line_items` zones only:
   - Compute `y_pct = round(seg.bounding_box['y'] * 100)` as integer percentage.
   - Compute `side = 'r' if seg.bounding_box['x'] > 0.5 else 'l'` (left/right of page centre).
   - Append ` [b{y_pct}%,{side}]` to the cell text. Example: `"1,234.56 [b87%,r]"`.
   - Only annotate if `seg.bounding_box` is not None. No annotation for segments without bbox.
   - Do NOT annotate `header`, `addresses`, `instructions`, or `unknown` zones — token budget preservation.
3. **2+8 Truncation rule** — after building zone line lists, if `line_items` zone has > 10 rows AND total serialized character count > 6000:
   - Keep first 2 rows (table headers with column semantics).
   - Keep last 8 rows (totals area).
   - Drop middle rows silently — no marker or ellipsis inserted.
   - Log `prompt.truncated` with `droppedRowCount`.
4. Character count threshold (6000) is checked on the fully serialized output before returning from `serialize_segments()`.

**Checkpoint N3 — Verification:**
- Manual: Upload a dense invoice; check ML service logs for serialized text; confirm `[b87%,r]` style annotations appear on `footer` and `line_items` segments only.
- Manual: Header zone segments → no annotation tags.
- Manual: Invoice with > 10 line items → log shows `prompt.truncated`; serialized `line_items` block contains first 2 + last 8 rows only.
- Manual: Invoice with ≤ 10 line items → no truncation; all rows present.
- Manual: Verify `num_ctx` appears in Ollama request payload (add temporary log).
- Regression: `POST /ml/serialize` endpoint still works correctly (uses same `serialize_segments()` function).

**Estimated effort:** 4 hours
**Complexity flag:** Medium

---

### N4 — Keyword Anchor Normalization (Option B — Prompt Annotation Only)

**Problem statement**
Zone boundaries are fixed Y-coordinate thresholds. If a vendor places "Subtotal" at Y=0.70 instead of the expected Y=0.82, the zone classifier assigns it correctly but Qwen has no spatial landmark to anchor its understanding of the document's financial structure. Keyword anchors provide layout-tolerant spatial context without touching `zone_classifier.py`.

**Files / Locations:**
- Amend: `apps/ml-service/prompt_builder.py` — anchor detection + annotation post-processing.
- Docs: `tasks/codemapcc.md`.

**Constraint:** `zone_classifier.py` must not be modified. This feature operates exclusively on the serialized output string.

**Implementation plan:**
1. Define anchor keyword list (hardcoded, not configurable):
   ```python
   ANCHOR_KEYWORDS = ["Subtotal", "Sub-total", "Total", "Tax", "GST", "VAT",
                      "Invoice", "Bill To", "Ship To", "Due Date", "Invoice Date"]
   ```
2. In `serialize_segments()`, after building all zone blocks, scan the original `segments` list for segments whose `text` contains any anchor keyword (case-insensitive, strip punctuation for matching).
3. For each anchor found: record `{keyword, y_value}` where `y_value = seg.bounding_box['y']` (normalized 0.0–1.0). Only record anchors where `bounding_box` is not None.
4. After the zone block text is assembled, append an anchor summary block at the end of the serialized output:
   ```
   [ANCHORS]
   "Total" at Y=0.82
   "Subtotal" at Y=0.76
   "Invoice Date" at Y=0.08
   ```
5. Deduplicate anchors — if the same keyword appears multiple times, keep the one with the highest-confidence segment.
6. If no anchors found: omit the `[ANCHORS]` block entirely (no empty block).

**Checkpoint N4 — Verification:**
- Manual: Upload invoice containing "Total Due:" → serialized text ends with `[ANCHORS]` block showing `"Total" at Y=0.XX`.
- Manual: Invoice without any anchor keywords → no `[ANCHORS]` block in output; no error.
- Manual: Multiple "Total" occurrences (e.g. "Line Total" in line_items + "Grand Total" in footer) → only highest-confidence occurrence recorded per keyword.
- Regression: `zone_classifier.py` unchanged; existing zone assignments unaffected.
- Regression: `POST /ml/serialize` still returns correct output.

**Estimated effort:** 3 hours
**Complexity flag:** Simple

---

## PART 7 — Norma v8.12: Immune System

### N_MIG — Migration: Three New Tables (Prerequisite for N2, N5, N6_RETRY)

**Problem statement**
The alias engine (N2), correction event tracking (N5), and the async retry loop (N6_RETRY) all require new DB tables. This migration must run before any of those features are implemented.

**Files / Locations:**
- Amend: `apps/api/src/db/schema.ts` — add three table definitions.
- Backend: `apps/api/drizzle/` — generate and run migration.
- Docs: `tasks/codemapcc.md`.

**Schema:**

```sql
-- Alias Rules: vendor-scoped OCR correction rules
CREATE TABLE alias_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL,  -- CHECK (vendor_id IS NOT NULL) enforced in schema
  field_key TEXT NOT NULL,
  raw_pattern TEXT NOT NULL,
  corrected_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed | active | rejected
  proposed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by TEXT,
  correction_event_count INT NOT NULL DEFAULT 0
);

-- Correction Events: raw log of every human edit
CREATE TABLE correction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  raw_ocr_value TEXT NOT NULL,
  corrected_value TEXT NOT NULL,
  baseline_id UUID NOT NULL REFERENCES extraction_baselines(id),
  user_id TEXT NOT NULL,
  corrected_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Extraction Retry Jobs: state machine for async math retry
CREATE TABLE extraction_retry_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL,
  baseline_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | RUNNING | COMPLETED | FAILED | RECONCILIATION_FAILED
  failing_field_keys TEXT[] NOT NULL,
  failing_y_min DECIMAL(6,4) NOT NULL,
  failing_y_max DECIMAL(6,4) NOT NULL,
  preliminary_values JSONB NOT NULL,
  final_values JSONB,
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Implementation plan:**
1. Add all three table definitions to `apps/api/src/db/schema.ts` using Drizzle ORM syntax.
2. Add `CHECK (vendor_id IS NOT NULL)` constraint on `alias_rules` at schema level (Drizzle `.notNull()` on `vendorId` column — already implied, but make explicit).
3. Run migration inside container: `docker compose exec api npx drizzle-kit migrate`.
4. Update `tasks/codemapcc.md` with all three tables.

**Checkpoint N_MIG — Verification:**
- DB: `\d alias_rules`, `\d correction_events`, `\d extraction_retry_jobs` — all three tables present with correct columns.
- DB: `INSERT INTO alias_rules (vendor_id, ...) VALUES (NULL, ...)` → should fail with NOT NULL constraint.
- Build: `npm run build` exits 0 after schema.ts update.

**Estimated effort:** 1–2 hours
**Complexity flag:** Simple

---

### N5 — I6 Async Math Retry Loop

**Problem statement**
The existing I6 math reconciliation runs synchronously and flags failures with `confidence_score = 0.0`. It has no retry mechanism. If math fails due to OCR noise on one field (e.g. `"33O.OO"` misread as `"330.00"` vs the correct `"300.00"`), the entire extraction is flagged with no recovery attempt. A targeted single retry re-prompts Qwen with only the failing region's segments.

**Depends on:** N_MIG (extraction_retry_jobs table), I6 (existing math reconciliation).

**Hardware guard:** Entire feature is gated by `ML_MATH_RETRY_ENABLED` env flag (default `false`). If false, math failures remain flagged as before (I6 behaviour unchanged). No retry job is created.

**Files / Locations:**
- Amend: `apps/api/src/ml/field-suggestion.service.ts` — post-I6 retry trigger.
- New: `apps/api/src/ml/ml-retry-worker.service.ts` — bounded setInterval worker.
- Amend: `apps/api/src/ml/ml.module.ts` — register `MlRetryWorkerService`.
- New: endpoint on existing attachments controller: `GET /attachments/:attachmentId/retry-status` — polling endpoint.
- Docs: `tasks/codemapcc.md`.

**Implementation plan:**

**Retry trigger (in `field-suggestion.service.ts`, after I6):**
1. After I6 math reconciliation, check: `ML_MATH_RETRY_ENABLED === 'true'` AND any field has `validationOverride = 'math_reconciliation_failed'`.
2. If retry warranted:
   - Identify failing fields: all with `validationOverride = 'math_reconciliation_failed'`.
   - Find contributing segments for failing fields using `bounding_box.y` from the failing field assignments.
   - Compute `failing_y_min = min(failing segments y)`, `failing_y_max = max(failing segments y + height)` with ±0.05 padding.
   - Write `extraction_retry_jobs` record:
     ```json
     {
       "attachmentId": "...",
       "baselineId": "...",
       "status": "PENDING",
       "failingFieldKeys": ["invoice_total", "tax"],
       "failingYMin": 0.78,
       "failingYMax": 0.93,
       "preliminaryValues": { "invoice_total": "999.00", "tax": "30.00", "subtotal": "300.00" },
       "retryCount": 0
     }
     ```
   - Return to client immediately with `{status: "preliminary", retryJobId: "<uuid>"}` alongside the preliminary suggestion results.
3. If `ML_MATH_RETRY_ENABLED` is false OR no math failures: return as normal (no retry job created).

**Background worker (`MlRetryWorkerService`):**
1. On module init (when `ML_MATH_RETRY_ENABLED=true`): start `setInterval` at 5000ms.
2. Each tick: query for exactly ONE `PENDING` record from `extraction_retry_jobs` (ORDER BY `created_at ASC`, LIMIT 1).
3. If none found: return immediately (no-op tick).
4. Set status to `RUNNING`, update `updated_at`.
5. Load original OCR segments for `attachmentId` from `attachment_ocr_outputs`.
6. Filter segments to those with `bounding_box.y` between `failing_y_min` and `failing_y_max`.
7. Re-serialize filtered segments via `POST /ml/serialize` (ML service endpoint M3).
8. Build targeted re-prompt: inject into `build_prompt_payload()` with a focused system message: `"The following fields failed math reconciliation: [failingFieldKeys]. Re-examine only the provided sub-document region and return corrected values."`.
9. Call `POST /ml/suggest-fields` with filtered segments and the targeted prompt.
10. Run I6 math check on the retry result.
11. **If math passes:** set status `COMPLETED`, write `final_values`, update `updated_at`.
12. **If math fails (or any error):** set status `RECONCILIATION_FAILED`, write `error_message`, update `updated_at`. **No further retry.** `retry_count` enforces `MAX_MATH_RETRIES = 1`.
13. Guard: if `retry_count >= 1` on any record picked up (should not happen, but defensive): set `RECONCILIATION_FAILED` immediately without calling ML.

**Polling endpoint:**
- `GET /attachments/:attachmentId/retry-status` — returns:
  ```json
  {
    "status": "PENDING | RUNNING | COMPLETED | RECONCILIATION_FAILED",
    "finalValues": { "invoice_total": "330.00", "tax": "30.00" },
    "errorCode": "RECONCILIATION_FAILED | null"
  }
  ```
- Returns most recent `extraction_retry_jobs` record for `attachmentId`.
- If no record: returns `{status: "none"}`.

**Frontend behaviour (review page):**
- If suggestion response contains `retryJobId`: display `"Verifying math..."` indicator.
- Poll `GET /attachments/:id/retry-status` every 3 seconds.
- On `COMPLETED`: update the display values for failing fields with `final_values`; remove indicator.
- On `RECONCILIATION_FAILED`: show `"Math reconciliation failed — manual review required"` with the specific failing fields highlighted.
- On `status: "none"` or non-retry document: no indicator shown.

**Checkpoint N5 — Verification:**
- Manual: Upload invoice where subtotal + tax ≠ total; `ML_MATH_RETRY_ENABLED=true` → suggestion response includes `retryJobId`; `extraction_retry_jobs` row created with `status: PENDING`.
- DB: `SELECT * FROM extraction_retry_jobs ORDER BY created_at DESC LIMIT 1` → shows correct `failing_field_keys`, `failing_y_min/max`, `preliminary_values`.
- Manual: Wait 5–10 seconds → row status updates to `RUNNING` then `COMPLETED` or `RECONCILIATION_FAILED`.
- Manual: `GET /attachments/:id/retry-status` returns updated status.
- Manual: `ML_MATH_RETRY_ENABLED=false` → math failure returns immediately with flag; no retry job created.
- Manual: Retry fails math again → status = `RECONCILIATION_FAILED`; `retry_count = 1`; no third attempt ever made.
- Regression: Documents without math failures → no retry job created; normal suggestion flow unaffected.
- Regression: I6 math pass → no retry job regardless of `ML_MATH_RETRY_ENABLED`.

**Estimated effort:** 1 day
**Complexity flag:** Complex

---

## PART 8 — Norma v8.12: Learning Layer (Hard Gate)

### N6 — Correction Event Tracking (Phase 1 — Data Only)

**Problem statement**
Every human edit on the review page that corrects a suggested value is a learning signal. Currently these corrections are stored in `baseline_field_assignments` (`correctedFrom` field) but are not aggregated into a trainable alias corpus. This task captures the raw correction signal.

**Hard Gate:** This task ships ONLY alongside N7 (Rule Management UI). Deploying correction tracking without the approval UI is architecturally prohibited — it creates a path where proposed rules could never be acted on, producing unbounded table growth.

**Files / Locations:**
- Amend: `apps/api/src/baseline/baseline-assignments.service.ts` — write to `correction_events` on human edit.
- Docs: `tasks/codemapcc.md`.

**Schema dependency:** Requires `correction_events` and `alias_rules` tables from N_MIG.

**Implementation plan:**
1. In `upsertAssignment()` in `baseline-assignments.service.ts`, after persisting the assignment: check if `correctedFrom` is non-null AND `suggestionAccepted = false` (human modified a suggestion).
2. If yes: resolve `vendorId` from the baseline/attachment metadata. If no `vendorId` resolvable: skip (do not write a correction event with null vendor — schema prohibits it).
3. Insert into `correction_events`:
   ```json
   {
     "vendorId": "vendor-abc",
     "fieldKey": "invoice_total",
     "rawOcrValue": "5tory",
     "correctedValue": "Story",
     "baselineId": "...",
     "userId": "..."
   }
   ```
4. After insert: count `correction_events` for `(vendor_id, field_key, raw_ocr_value)`.
   - If count >= 3: upsert into `alias_rules` with `status = 'proposed'`, `correction_event_count = count`.
   - **Status remains `'proposed'` — never `'active'`.** The alias engine (N2) only loads `'active'` rules, so no rule takes effect until a human approves it in N7.
5. Log `correction.event.recorded` with `vendorId`, `fieldKey`, `correctionCount`. If count >= 3, also log `alias.rule.proposed` with `ruleId`.

**Checkpoint N6 — Verification:**
- Manual: Correct a suggested field 3 times for the same vendor → `correction_events` has 3 rows; `alias_rules` has one row with `status = 'proposed'`.
- DB: `SELECT status FROM alias_rules WHERE vendor_id = 'vendor-test'` → `proposed` (never `active`).
- Manual: The alias engine (N2) produces zero corrections for this rule (not yet active) — confirmed by absence of `alias.engine.applied` log with this vendor/pattern.
- Manual: Correct a field for a different vendor → separate `correction_events` row; no cross-vendor contamination.
- Regression: Assignments with `suggestionAccepted = true` (accepted without modification) → no correction event written.
- Regression: Manual assignments (no suggestion) → no correction event written.

**Estimated effort:** 3 hours
**Complexity flag:** Simple

---

### N7 — Rule Management UI: /admin/rules (Hard Gate — unlocks N6)

**Problem statement**
Proposed alias rules sit in `PROPOSED` state indefinitely without human review. This page gives admins visibility into all proposed rules and the ability to approve or reject them. Only approved rules become `active` and enter the alias engine pipeline. This is the governance gate that prevents rule poisoning.

**Files / Locations:**
- New: `apps/web/app/admin/rules/page.tsx` — Rule Management UI.
- New: `apps/web/app/lib/api/rules.ts` — API helpers for rules endpoints.
- New: `apps/api/src/ml/alias-rules.controller.ts` — `GET /admin/rules`, `POST /admin/rules/:id/approve`, `POST /admin/rules/:id/reject`.
- New: `apps/api/src/ml/alias-rules.service.ts` — DB queries for rule management.
- Amend: `apps/api/src/ml/ml.module.ts` — register new controller + service.
- Amend: `apps/web/app/admin/ml/page.tsx` — add link to `/admin/rules`.
- Docs: `tasks/codemapcc.md`.

**Implementation plan:**

**Backend:**
1. `GET /admin/rules?status=proposed` — returns all `alias_rules` for given status, ordered by `proposed_at DESC`. Default to `status=proposed`.
2. `POST /admin/rules/:id/approve` — sets `status = 'active'`, records `approved_at = NOW()`, `approved_by = req.user.username`. Emits audit log `alias.rule.approved`.
3. `POST /admin/rules/:id/reject` — sets `status = 'rejected'`. Emits audit log `alias.rule.rejected`.
4. All endpoints admin-only (reuse existing admin auth guard).

**Frontend (`/admin/rules`):**
1. Page title: "Rule Management — Proposed Aliases".
2. On load: fetch all `proposed` rules. Auto-refresh every 30 seconds (same pattern as `/admin/ml`).
3. Group rules by vendor. For each vendor section: vendor name header, then a table of rules.
4. Each rule row displays: `field_key`, `raw_pattern → corrected_value`, `correction_event_count` corrections, `proposed_at` date, `[Approve]` and `[Reject]` buttons.
5. `[Approve]` — calls `POST /admin/rules/:id/approve`; on success: remove row from list; show brief inline confirmation "Rule activated".
6. `[Reject]` — calls `POST /admin/rules/:id/reject`; on success: remove row from list.
7. If no proposed rules: show "No pending rules. The system is up to date." — no empty table.
8. Link from `/admin/ml` page: "Rule Management →" in the navigation area.

**Alias engine cache invalidation:** After `approve` or `reject`, the `AliasEngineService` in-memory cache for that vendor must be invalidated. Since the cache TTL is 5 minutes, the simplest approach is to delete the vendor's cache entry on any state change. The next alias engine call for that vendor will reload from DB.

**Checkpoint N7 — Verification:**
- Manual: Navigate to `/admin/rules` as admin → proposed rules from N6 appear grouped by vendor.
- Manual: Click `[Approve]` on a rule → DB shows `status = 'active'`, `approved_at` non-null; row disappears from page.
- Manual: Generate suggestions for the approved vendor after approval → alias engine applies the rule; `alias.engine.applied` log shows correction.
- Manual: Click `[Reject]` on a rule → DB shows `status = 'rejected'`; row disappears from page; alias engine never applies it.
- Manual: Non-admin user → `/admin/rules` returns 403.
- Manual: No proposed rules → page shows "No pending rules" message.
- Regression: Existing `/admin/ml` page unaffected; link to `/admin/rules` present.

**Estimated effort:** 1 day
**Complexity flag:** Medium

---

## PART 9 — Norma v8.12: Execution Order

**Prerequisites (must complete before Norma begins):**
- E1 Performance API ✅ or in-progress
- E2 Performance UI ✅ or in-progress

**Norma critical path:**
```
N_MIG (migration) ──────────────────────────────────────────────┐
                                                                 ↓
N0 (confidence audit) ──→ N1 (LOW_CONF tagging) ──→ N2 (alias engine) ──→ complete
                                                                 ↑
N3 (terse annotation + truncation) ────────────────────────────-┘
N4 (keyword anchor) ──→ independent (no deps beyond N1 complete)

N5 (math retry loop) ──→ depends on N_MIG + existing I6
N6 (correction tracking) ──→ depends on N_MIG              ┐ ship as
N7 (rules UI) ──────────────────────────────────────────────┘ locked pair
```

**Sequence:**
1. **N_MIG** — migration first, all features depend on it.
2. **N0** — confidence audit. Hard blocker for N1. Run immediately after N_MIG.
3. **N1** — LOW_CONF tagging. Requires N0 passing.
4. **N2** — Alias engine. Requires N_MIG. Can start in parallel with N1 after N_MIG.
5. **N3** — Terse annotation + truncation. Requires N1 complete (same file, avoid conflicts). `num_ctx` change can be done independently.
6. **N4** — Keyword anchor. Requires N3 complete (same file, avoid conflicts).
7. **N5** — Math retry loop. Requires N_MIG + existing I6. Independent of N1–N4 beyond N_MIG.
8. **N6 + N7** — Ship as locked pair. N6 first (data only), N7 immediately after. Requires N_MIG.

**Parallel opportunities:**
- N_MIG and N0 can run simultaneously (migration doesn't block the audit).
- N2 and N1 can be developed in parallel after N_MIG (different files).
- N5 is independent of N1–N4 and can run in parallel with the spatial layer work.
- N6+N7 pair is independent of N1–N5 and can run in parallel once N_MIG is done.

---

## PART 10 — Norma v8.12: Definition of Done

**Feature completeness:**
- [ ] Confidence null rate documented in `executionnotes.md` at all four pipeline checkpoints (N0).
- [ ] `[LOW_CONF]` tags appear on sub-0.6 confidence segments in serialized ML input (N1).
- [ ] `num_ctx: 8192` set in Ollama payload (N3).
- [ ] Terse bbox annotations (`[b87%,r]`) present on footer and line_items segments only (N3).
- [ ] 2+8 truncation fires on line_items > 10 rows when char count > 6000 (N3).
- [ ] `[ANCHORS]` block appears in serialized output when anchor keywords found (N4).
- [ ] `alias_rules`, `correction_events`, `extraction_retry_jobs` tables present in DB (N_MIG).
- [ ] Alias engine applies vendor-scoped `active` rules before serialization (N2).
- [ ] Alias-corrected segments do not receive `[LOW_CONF]` tag (N2+N1 integration).
- [ ] Math retry job created on I6 failure when `ML_MATH_RETRY_ENABLED=true` (N5).
- [ ] `GET /attachments/:id/retry-status` returns correct status (N5).
- [ ] Retry worker processes one PENDING job per 5-second tick (N5).
- [ ] `MAX_MATH_RETRIES = 1` enforced via `retry_count` column — no third attempt ever (N5).
- [ ] Correction events written on human edits to suggestions (N6).
- [ ] Alias rules reach `proposed` at 3+ corrections; never reach `active` without approval (N6).
- [ ] `/admin/rules` page lists proposed rules grouped by vendor (N7).
- [ ] Approve action sets rule `active`; alias engine loads it on next vendor cache refresh (N7).
- [ ] Reject action sets rule `rejected`; alias engine never loads it (N7).

**Guardrail compliance:**
- [ ] `zone_classifier.py` has zero modifications across all Norma tasks.
- [ ] No alias rule with `vendor_id = NULL` exists in DB (schema constraint enforced).
- [ ] No alias rule with `status = 'active'` exists before N7 ships (verified by DB query).
- [ ] `ML_MATH_RETRY_ENABLED=false` default confirmed in `.env` and `docker-compose.yml`.

**No regressions:**
- [ ] `docker compose exec -T api npm run build` exits 0.
- [ ] `docker compose exec -T web npm run build` exits 0.
- [ ] Existing I6 math reconciliation behaviour unchanged when `ML_MATH_RETRY_ENABLED=false`.
- [ ] `POST /ml/suggest-fields` still works when no alias rules exist for a vendor.
- [ ] `POST /ml/serialize` still returns correct output after prompt_builder.py changes.
- [ ] Review page still supports manual assignment and non-spatial baselines.

**Documentation:**
- [ ] `tasks/codemapcc.md` updated with all new files, endpoints, tables, and routes.
- [ ] `tasks/executionnotes.md` updated with N0 audit results and completion evidence.
- [ ] `tasks/features.md` v8.12 section reflects actual state.

**Tag:** `git tag v8.12 -m "Norma: Self-Healing Document Intelligence complete"`

---

---

## PART 3 — v8.11 Semantic Search

**Note:** The RAG infrastructure (F3, M1–M4, L6) has been pulled into v8.10 by the SLM+RAG pivot (ADR 2026-02-24). v8.11 scope is now reduced to semantic search on top of the v8.10 RAG corpus.

**Prerequisite:** v8.10 complete. `baseline_embeddings` table populated with confirmed baselines and seed corpus.

---

## 16) Semantic Search (P1 — depends on v8.10 baseline_embeddings)

### S1 — Semantic Search Endpoint + UI (Complexity: Medium)

**Problem statement**
Users need to search across all confirmed extraction data using natural language queries. pgvector cosine similarity retrieves semantically relevant baselines using the `nomic-embed-text` model (already running in Ollama from v8.10).

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
   - Embed `q` via Ollama `POST /api/embeddings` with `nomic-embed-text`.
   - Query `baseline_embeddings` by cosine similarity, filtered by `document_type_id` when provided.
   - For each result, fetch top confirmed field assignments for preview.
3. Response: `{results: [{baselineId, attachmentId, similarity, confirmedAt, documentTypeId, fieldPreview: [{fieldKey, value}]}]}`.
4. Frontend search page: text input + optional filters; result cards with similarity, metadata, field previews; links to review page.
5. Emit audit log `search.extractions` with query hash (not raw query), filter applied, result count.
6. Update `tasks/codemapcc.md`.

**Checkpoint S1 — Verification**
- Manual: `GET /search/extractions?q=invoice+total` returns baselines ranked by similarity.
- Manual: `documentType` filter returns only that type's baselines.
- Manual: Search page renders results; clicking navigates to review page.
- Regression: No existing v8.10 endpoints affected.

**Estimated effort:** 3–4 hours
**Complexity flag:** Medium

---

## 17) v8.11 Execution Order

1. **S1** Semantic search — depends on v8.10 `baseline_embeddings` being populated.

---

## 18) v8.11 Definition of Done

**Feature Completeness:**
- `GET /search/extractions` returns similarity-ranked confirmed baselines (S1).
- Search UI renders and links to review page (S1).

**No Regressions:**
- All v8.10 endpoints and flows unaffected.

**Documentation:**
- `tasks/codemapcc.md` updated with new files and endpoints.
- `tasks/features.md` v8.11 section reflects actual state.

---

## 19) Post-Completion Checklist (v8.11)

- [ ] Update `tasks/executionnotes.md` (append-only).
- [ ] Update `tasks/codemapcc.md` with all new file paths and endpoints.
- [ ] Update `tasks/features.md` v8.11 status to ✅ Complete.
- [ ] Tag commit: `git tag v8.11 -m "Semantic Search complete"`

---

---

## PART 4 — Data Governance Hardening

**Note:** N1 (Golden Set gate) is superseded by the D5 revision — the offline/Golden Set activation gates were dropped by the SLM+RAG pivot (ADR 2026-02-24). D5 now uses online gate only. N2 (field library similarity check) referenced field-level embeddings in `baseline_embeddings` which no longer exist in the v8.10 schema (the table stores document-level embeddings for RAG, not field-level). Both N1 and N2 are deferred to v8.12 for redesign.

---

## 23) Golden Set Infrastructure

### N1 — Golden Set Repository
**Status:** 🗑️ DEFERRED to v8.12 — Golden Set gate dropped from D5 by SLM+RAG pivot (ADR 2026-02-24). The online acceptance gate (D5) is the sole activation signal. Golden Set may be revisited in v8.12 as a diagnostic tool (not a gate) once the RAG corpus is established.

---

## 24) Field Library Integrity

### N2 — Field Library Similarity Check at Creation
**Status:** 🗑️ DEFERRED to v8.12 — depended on field-level embeddings in `baseline_embeddings` which were not included in the v8.10 schema pivot. Redesign required for nomic-embed-text compatibility.

---

## 25) Execution Order (PART 4)

N1 and N2 are deferred. No PART 4 tasks remain for v8.10/v8.11.

---

## 26) Part 4 Definition of Done

Deferred — see v8.12 planning.

**Documentation:**
- Deferral rationale recorded in `tasks/executionnotes.md`.

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
