# Session State - 2026-02-19

## Current Status
- Milestone v8.9 -- ML Model Training & Fine-Tuning (**IN PROGRESS**)
  - [DONE] A1: Admin Training Data Export Endpoint (completed and verified 2026-02-18)
  - [DONE] A2: Data Quality Filters (completed and verified 2026-02-18)
  - [DONE] B1: Model Version Admin API (completed and verified 2026-02-18)
  - [DONE] B2: ML Service Hot Swap Endpoint (completed 2026-02-18, VERIFIED 2026-02-19)
  - [DONE] B3: API Model Activation Endpoint (completed and verified 2026-02-19)
  - [PENDING] C1: Deterministic A/B Model Selection
  - [PENDING] C2: Suggestion Outcome Tracking Integrity
  - [PENDING] D0: Synthetic Training Data Generator
  - [PENDING] D1: Fine-Tuning Script + Evaluation
  - [PENDING] D2: Register Trained Model Metadata
  - [PENDING] E1: Performance API
  - [PENDING] E2: Admin Performance UI

## Recent Achievements
- **v8.9 B2+B3 VERIFIED 2026-02-19**:
  - Root cause found: `model_registry.py` was missing from `apps/ml-service/ml.Dockerfile` — container ran without it, causing 404 on activate endpoint. Fixed by adding `COPY model_registry.py .`.
  - ML service `ml.model.activate.success` logged for valid model path; `ml.model.activate.failed` for missing file path (correct error handling).
  - API `POST /admin/ml/models/activate` → 502 when model file doesn't exist (expected — test record v2026-02-17 has no actual model file on disk).
  - Regression: `/admin/ml/metrics` → 200 ✅.
  - Audit log emitted on success path; not emitted on failure (correct — transaction not committed).
- **v8.9 B1 Complete**: Model version registry endpoints implemented and verified.
- **v8.9 A2 Complete**: Three quality filters + minCorrections threshold implemented and verified.
- **v8.9 A1 Complete**: Admin training data export endpoint implemented and verified.

## Context
- Admin credentials: `a@a.com` / `12341234` (also `test@test.com` / `12341234` works).
- API container running in dev/watch mode — restart with `docker restart todo-api` if routes don't appear.
- ML service on port 5000 (internal only — no host port mapping). Test via API container: `docker exec todo-api node ...` or via the API proxy endpoints.
- `ml_model_versions` table: `all-MiniLM-L6-v2 v1.0.0` (isActive=true, system) + `sentence-bert-field-matching v2026-02-17` (isActive=false, test registration — no model file on disk).
- C1 is unblocked (depends on B1+B2, both verified).

## Next Immediate Step
- **Task C1**: Deterministic A/B Model Selection.
  - Files: `apps/api/src/ml/field-suggestion.service.ts`, `apps/api/src/ml/ml.service.ts`
  - Read `ML_MODEL_AB_TEST` env flag from ConfigService.
  - Model A = `isActive=true` for `sentence-bert-field-matching`.
  - Model B = most recent `isActive=false` by `trainedAt`.
  - If A/B enabled and model B exists: choose A or B by `hash(baselineId) % 2`.
  - Pass `modelVersionId` + `filePath` to ML service request.
  - Add audit detail fields: `abGroup`, `modelVersionId`, `modelVersion`.

## Verification Status
- ✅ B3: POST /admin/ml/models/activate → 502 when model file missing (correct — no real model exists yet)
- ✅ B3: API endpoint registered, auth/CSRF/AdminGuard working
- ✅ B3: ML service called (ml.model.activate.failed logged for bad path)
- ✅ B2: POST /ml/models/activate → {ok:true, activeVersion:"all-MiniLM-L6-v2"} with valid path
- ✅ B2: Log line ml.model.activate.success with version and filePath
- ✅ B2: POST /ml/models/activate → {ok:false, error:{code:"load_failed"}} for bad path
- ✅ B1: POST /admin/ml/models → 201 with isActive=false
- ✅ B1: GET /admin/ml/models → 200 with array
- ✅ A2: 400 with code="insufficient_corrections"
- ✅ A1: endpoint returns 200 with JSON array
- ✅ Regression: /admin/ml/metrics → 200

## Blockers
- None. C1 can start immediately.

## Files Modified in Session (A1 + A2 + B1 + B2 + B3)
- `apps/api/src/ml/dto/ml-training-data.query.dto.ts` — NEW (A1)
- `apps/api/src/ml/ml-training-data.service.ts` — NEW (A1) + MODIFIED (A2)
- `apps/api/src/ml/ml-training-data.controller.ts` — NEW (A1) + MODIFIED (A2)
- `apps/api/src/ml/dto/create-ml-model.dto.ts` — NEW (B1)
- `apps/api/src/ml/ml-models.service.ts` — NEW (B1) + MODIFIED (B3)
- `apps/api/src/ml/ml-models.controller.ts` — NEW (B1) + MODIFIED (B3)
- `apps/api/src/ml/ml.service.ts` — MODIFIED (B3)
- `apps/api/src/ml/ml.module.ts` — MODIFIED (A1, B1)
- `apps/ml-service/model_registry.py` — NEW (B2)
- `apps/ml-service/model.py` — MODIFIED (B2)
- `apps/ml-service/main.py` — MODIFIED (B2)
- `apps/ml-service/ml.Dockerfile` — MODIFIED (B2 fix: added COPY model_registry.py)
- `tasks/codemapcc.md` — MODIFIED (A1+A2+B1+B2+B3)
- `tasks/executionnotes.md` — MODIFIED (A1+A2+B1+B2+B3)
- `tasks/plan.md` — MODIFIED (A1+A2+B1+B2+B3)
- `tasks/session-state.md` — MODIFIED: this file
