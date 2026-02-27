Current fixme task done: FX-13 (Standalone - Zombie Queue Fix)
Next fixme task: All FIXME sprints complete.
  - TG-8: complete - `field_library.required` added in schema/migration and applied to live DB
  - FX-10: complete - `emptyRequiredFields` now filters only `field.required === true`
  - ML-2 backend: complete - `syncMissingEmbeddings()` + `POST /admin/ml/rag/sync-missing-embeddings`
  - ML-2 frontend: complete - `Sync RAG Memory` button added to `/admin/ml` header actions
  - ML-1: seed script executed successfully against current corpus (idempotent updates)
Blockers:
  - None active for TG-8/FX-10/ML-2 work.
Open questions:
  - ML-1 checklist nuance: `seed_corpus/` currently contains one document type (`Invoice`) only.
  - FX-11: NEEDS-MANUAL-TESTING - confirm with/without ?taskId, button label during redirect window
  - FX-12: NEEDS-MANUAL-TESTING - GET /admin/ml/performance shape; no model versions in DB
  - FX-13: NEEDS-MANUAL-TESTING - insert stuck job, call endpoint, verify cancellation + state advance + audit log + 403 for non-admin
  - FX-4 (UI_TIMEOUT): NEEDS-MANUAL-TESTING - requires baseline with RECONCILIATION_FAILED state
  - FX-5 checks 2-3: NEEDS-MANUAL-TESTING - reload + navigation prefetch dedup
  - FX-6: NEEDS-MANUAL-TESTING - requires a confirmed baseline to hit the guard
  - FX-7 rate-limit overflow path: NEEDS-MANUAL-TESTING
  - FX-9 web ([ChangeLog][Field]): NEEDS-MANUAL-TESTING - browser console check on field accept/modify
