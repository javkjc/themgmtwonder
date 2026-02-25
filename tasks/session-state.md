# Session State - 2026-02-25

## Current Task
- v8.12 Norma spec written to tasks/plan.md (PART 4–10 appended). Planning phase complete.

## Next Task
- **E1** - Performance API (Complexity: Medium) — last remaining v8.9 task before Norma begins
  - New: `apps/api/src/ml/ml-performance.controller.ts` - GET /admin/ml/performance
  - New/Amend: `apps/api/src/ml/ml-performance.service.ts` - aggregation + gate status (also needed by D5)
  - Depends on: C2, B1
- After E1 + E2: begin Norma with **N_MIG** (migration) + **N0** (confidence audit) in parallel

## Completed This Session
- H2: Ollama service in docker-compose [UNVERIFIED runtime]
- F3: pgvector + baseline_embeddings table [VERIFIED]
- I1: ml-service rewritten to Ollama/Qwen orchestration [NEEDS-TESTING E2E]
- M3: POST /ml/serialize endpoint [VERIFIED]
- M2: RagRetrievalService [NEEDS-TESTING - build pass, runtime pending]
- M1: RagEmbeddingService + confirmBaseline hook [VERIFIED]
- UI fixes: View Extraction button, Get Suggestions hidden on confirmed, OK Confirmed removed, TS schema fix
- field-suggestion.service.ts + field-type-validator.ts: characterType->fieldType, Qwen shape adaptation, ADR confidence formula [BUILD-VERIFIED]

## Blockers
- None

## Open Items
- H2 runtime model pull (qwen2.5:1.5b + nomic-embed-text) still unverified - closes with I1/M2 E2E
- I1 E2E suggest-fields with Qwen pending Ollama model pull
- M2 runtime checkpoint tests pending (require baseline_embeddings seeded, closes with M4 E2E)
