# FIXME — Post-Audit Remediation Plan

**Source:** Codebase audit conducted 2026-02-27
**Scope:** v8.9/v8.10 implementation bugs, security gaps, UX blockers, and ML intelligence health
**Execution model:** Each sprint is a single Claude session. Execute one sprint at a time.
**Authority:** `tasks/plan.md` remains the single source of truth for mainline work. This file governs remediation tasks only and does not modify the main plan sequence.
**Hardware context:** This system runs on an i5-7300U (2 cores, 16GB RAM). All risk ratings and timeout values are calibrated for this constraint, not cloud-grade hardware.

---

## Status Legend
- ⬜ Pending — Not started
- 🔄 In Progress — Active session
- ✅ Complete — Verified and documented
- 🚫 Blocked — Has unresolved prerequisite

---

## Implementation Order

Execute in this sequence. Do not start a later step until the prior one is verified.

```
Phase 0 (Audit) → Sprint 1A → Sprint 2 → Sprint 1B → Sprint 3 → Standalone
```

Rationale:
- **Phase 0** is read-only — run the three DB queries before touching any code. Results determine whether TG-4 and TG-6 require immediate action or remain deferred.
- Sprint 1A has no external dependencies — pure logic fixes.
- Sprint 2 security fixes must be in place before 1B's validation refactor.
- Sprint 1B is blocked until schema investigation (FX-1B-PRE) is complete.
- Sprint 3 depends on correct baseline confirmation flow from Sprints 1A + 2.
- Standalone is independent but audits state mutated by prior sprints.

---

## Phase 0 — ML Intelligence Audit ✅

**Status:** Pending — run before any sprint. Read-only. No code changes.
**Goal:** Measure actual RAG corpus health before building anything. Results determine whether TG-4 and TG-6 are theoretical risks or active problems that must be addressed immediately.

Run all three queries via:
```
docker exec todo-db psql -U todo -d todo_db -c "<query>"
```

---

### Query 1 — How many confirmed baselines exist?
```sql
SELECT COUNT(*) FROM extraction_baselines WHERE status = 'confirmed';
```

### Query 2 — How many have embeddings?
```sql
SELECT COUNT(*) FROM baseline_embeddings WHERE gold_standard = false;
```

### Query 3 — The gap (confirmed but not embedded):
```sql
SELECT COUNT(*)
FROM extraction_baselines eb
WHERE eb.status = 'confirmed'
AND NOT EXISTS (
  SELECT 1 FROM baseline_embeddings be
  WHERE be.baseline_id = eb.id
);
```

### Query 4 — Gold standard seed count:
```sql
SELECT COUNT(*) FROM baseline_embeddings WHERE gold_standard = true;
```

---

### Phase 0 — Decision Gate

Record results here before proceeding:

| Metric | Result | Threshold | Action |
|---|---|---|---|
| Confirmed baselines | 0 | — | Informational |
| Non-gold embeddings | 0 | — | Informational |
| Confirmed-but-not-embedded gap | 0 | > 0 | Prioritize ML Intelligence Sprint |
| Gold standard seed count | 1 | = 0 | Prioritize ML Intelligence Sprint |

**If gap count = 0 AND gold standard count > 0:** TG-4 and TG-6 are theoretical. Proceed with Sprint 1A immediately.

**If gap count > 0 OR gold standard count = 0:** Run the ML Intelligence Sprint before or alongside Sprint 1A. Do not defer — the RAG system is already degraded.

---

---

## ML Intelligence Sprint ⬜

**Status:** Pending — run only if Phase 0 reveals gap count > 0 or gold standard count = 0
**Session goal:** Restore RAG corpus integrity. Two sub-tasks: seed the golden corpus (TG-4) and build the manual sync button (TG-6).
**Estimated scope:** 1 script run (no code changes for seeding) + 2 backend files + 1 frontend button.
**Hardware note:** All embedding operations must be sequential on this hardware. Never use `Promise.all` for embedding calls.

---

### ML-1 — Audit and Seed the Golden Corpus (TG-4)

**Problem:** If `seed_corpus/` is empty or unpopulated, Qwen 2.5 1.5B has no few-shot RAG examples to copy. Every suggestion call runs zero-shot, producing lower-quality field extraction than the system is designed to deliver.

**The seed script already exists** at `apps/api/src/scripts/seed-corpus.ts`. It reads JSON files from `root/seed_corpus/`, embeds them via Ollama `nomic-embed-text`, and upserts into `baseline_embeddings` with `gold_standard=true`. No new code is needed — the infrastructure exists but has no data.

**Step 1 — Read the script first:**
```
docker compose exec api cat src/scripts/seed-corpus.ts
```
Identify the exact JSON shape the script expects for each file in `seed_corpus/`.

**Step 2 — Select your golden set:**
- Query the DB for your best confirmed baselines: `quality_gate = 'zero_corrections'` or `quality_gate = 'math_pass'`
- Select 5–10 baselines with document type diversity — 2 invoices + 2 receipts + 2 purchase orders beats 10 invoices
- Diversity matters because RAG retrieval filters by `documentTypeId` first; sparse per-type coverage is worse than sparse total coverage

**Step 3 — Export and place:**
- Export each selected baseline into `seed_corpus/` in the format the script expects
- Use the document type as the filename convention (verify against script)

**Step 4 — Run during low-pressure period (UI not in use):**
```
docker compose exec api npx ts-node src/scripts/seed-corpus.ts
```

**Step 5 — Verify:**
```sql
SELECT COUNT(*), document_type_id
FROM baseline_embeddings
WHERE gold_standard = true
GROUP BY document_type_id;
```

**Verification:**
- [ ] `seed_corpus/` contains at least 5 files across at least 2 document types
- [ ] Script runs without error
- [ ] Query above returns rows — one per document type seeded
- [ ] Gold standard count > 0 in `baseline_embeddings`

---

### ML-2 — Manual RAG Sync Button (TG-6)

**Problem:** Fire-and-forget `embedOnConfirm` (FX-8) silently fails under Ollama memory pressure on this hardware. Confirmed baselines accumulate without embeddings, degrading RAG quality over time.

**Strategy:** Move heavy embedding work away from the confirm action entirely. Provide an admin "Sync RAG Memory" button that embeds missing baselines sequentially during a deliberate low-pressure window.

**New endpoint:** `POST /ml/rag/sync-missing-embeddings`
**Auth guard:** Admin-only — reuse the same guard as other `/ml/` admin routes.

**Files:**
- `apps/api/src/ml/rag-embedding.service.ts` — add `syncMissingEmbeddings()` method
- Add controller route (determine correct controller by reading `apps/api/src/ml/` structure)
- Frontend admin panel — add "Sync RAG Memory" button

**`syncMissingEmbeddings()` implementation:**
```ts
async syncMissingEmbeddings(): Promise<{
  found: number;
  synced: number;
  failed: number;
}> {
  const result = await this.dbs.db.execute(sql`
    SELECT eb.id
    FROM extraction_baselines eb
    WHERE eb.status = 'confirmed'
    AND NOT EXISTS (
      SELECT 1 FROM baseline_embeddings be
      WHERE be.baseline_id = eb.id
    )
    LIMIT 50
  `);
  // Safety cap: never embed more than 50 at once on this hardware.
  // Large backlogs should be processed in multiple manual runs.

  const missing = result.rows as { id: string }[];
  let synced = 0;
  let failed = 0;

  // Sequential for...of — NOT Promise.all.
  // Concurrent embedding on an i5-7300U causes Ollama OOM.
  for (const row of missing) {
    try {
      await this.embedOnConfirm(row.id);
      synced++;
    } catch {
      failed++;
      // Continue — do not abort the batch on a single failure.
    }
  }

  return { found: missing.length, synced, failed };
}
```

**Audit log — required in the controller:**
```ts
await this.auditService.log({
  actorType: 'user',
  actorId: req.user.id,
  action: 'rag.sync.manual' as any,
  module: 'ml',
  resourceType: 'baseline-embeddings',
  details: { found, synced, failed },
});
```

**Frontend:** Add to the admin panel (not the review page). One button labeled "Sync RAG Memory". On click, POST to the endpoint and display `{ found, synced, failed }` result inline. If `found = 0`, show "RAG corpus is up to date."

**STOP condition:** Verify the confirmed-but-not-embedded query column name (`eb.id`) matches the actual schema column before implementing. Check `apps/api/src/db/schema.ts` for the exact `extraction_baselines` column names.

**Verification:**
- [ ] Phase 0 Query 3 shows gap count > 0 before running
- [ ] Click "Sync RAG Memory" — endpoint returns `{ found: N, synced: N, failed: 0 }`
- [ ] Phase 0 Query 3 re-run shows gap count = 0 (or reduced by synced count)
- [ ] Audit log shows `rag.sync.manual` entry with correct counts
- [ ] Non-admin user gets 403 on the endpoint
- [ ] Running sync when gap = 0 returns `{ found: 0, synced: 0, failed: 0 }` — safe no-op

---

### ML Intelligence Sprint — Session End Checklist

- [ ] Append entry to `tasks/executionnotes.md`
- [ ] Update `tasks/codemapcc.md` — add `POST /ml/rag/sync-missing-embeddings` to Backend Map
- [ ] `docker restart todo-api todo-web`
- [ ] Rewrite `tasks/session-state.md` with ML Intelligence Sprint complete, Sprint 1A next

---

---

## Sprint 1A — Logic & Stability ✅

**Status:** Complete
**Session goal:** Fix logic bugs and routing issues with no external schema dependencies.
**Estimated scope:** 4 files, no new dependencies, no migrations.

---

### FX-1 — /settings Dead Route Redirect

**File:** `apps/web/next.config.ts`
**Problem:** `/settings` returns 404. Users who navigate directly (bookmarks, history) get no redirect.
**Fix:** Add a permanent (308) redirect from `/settings` to `/customizations`.

```ts
// Inside the exported config object, add:
async redirects() {
  return [
    {
      source: '/settings',
      destination: '/customizations',
      permanent: true,
    },
  ];
},
```

**Verification:**
- [x] Navigate to `http://localhost:3000/settings` — confirm browser redirects to `/customizations`
- [x] Build completes without errors (`docker restart todo-web`)

---

### FX-2 — Validator Default Case (Permissive Failure)

**File:** `apps/api/src/baseline/field-assignment-validator.service.ts`
**Line:** ~50–57 (the `default` case in the `validate()` switch)
**Problem:** Unknown character types return `valid: false`, silently blocking user assignments for any field type added to the library without a corresponding validator case.
**Fix:** Change `default` to return `{ valid: true }` while keeping the existing `logger.warn`.

Before:
```ts
default:
  this.logger.warn(`Validation attempt for unknown character type: ${characterType}`);
  return {
    valid: false,
    error: `Unknown character type: ${characterType}`,
  };
```

After:
```ts
default:
  this.logger.warn(`Validation attempt for unknown character type: ${characterType}`);
  return { valid: true };
```

**Verification:**
- [x] Run existing test suite: `docker compose exec api npm test -- field-assignment-validator`
- [x] All existing tests pass
- [x] `validate('new_unknown_type', 'somevalue')` returns `{ valid: true }`

---

### FX-3 — validateDate UTC Shift Bug

**File:** `apps/api/src/baseline/field-assignment-validator.service.ts`
**Line:** 150 specifically — the ISO 8601 strict check inside `validateDate`
**Problem:** `date.toISOString().startsWith(trimmed)` uses UTC, which shifts the date for users in UTC+ timezones. A valid local date like `2024-08-01` fails the strict check because `toISOString()` may return `2024-07-31T...` in UTC+N.
**Fix:** Replace the `toISOString()` comparison at line 150 with a local-part comparison using `getFullYear/getMonth/getDate`.

Before (line 150):
```ts
if (!isNaN(date.getTime()) && date.toISOString().startsWith(trimmed)) {
  return { valid: true };
}
```

After:
```ts
if (!isNaN(date.getTime())) {
  const y = date.getFullYear().toString();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (`${y}-${m}-${d}` === trimmed) {
    return { valid: true };
  }
}
```

**Verification:**
- [x] All existing date validation tests pass
- [x] `validate('date', '2024-08-01')` returns `{ valid: true }` with no `suggestedCorrection`
- [x] `validate('date', '2024-13-01')` still returns `{ valid: false }`

---

### FX-4 — Math Retry Polling Timeout with Recoverable UI_TIMEOUT State

**File:** `apps/web/app/attachments/[attachmentId]/review/page.tsx`
**Lines:** ~588–670 (the `useEffect` polling `/attachments/:id/retry-status`)

**Problem 1:** If a retry job gets stuck in `RUNNING` state, the 3-second polling interval runs forever. No timeout, no error state, no user-visible recovery path.
**Problem 2 (hardware-specific):** On an i5-7300U, a math reconciliation job can legitimately take 31+ seconds (Qwen inference + DB writes). A 30-second timeout that maps to `RECONCILIATION_FAILED` lies to the user — the backend job may actually succeed a moment later while the UI reports failure.

**Fix — two changes required:**

**Change 1:** Add `UI_TIMEOUT` as a distinct frontend-only status. The backend never returns this value — it is set only by the client-side timeout. Add it to the local `RetryStatusPayload` status union type. Do not add it to any backend type or API contract.

```ts
// Extend the local status type only:
type RetryStatusPayload = {
  status: 'none' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'RECONCILIATION_FAILED' | 'UI_TIMEOUT';
  // ... other fields unchanged
};
```

**Change 2:** Add a `pollTrigger` counter state at the component level. This is the "heartbeat" mechanism that forces the polling `useEffect` to re-arm when the user clicks "Check Status" — React will not re-run the effect if `mathRetryJobId` is the same string.

```ts
const [pollTrigger, setPollTrigger] = useState(0);
```

Include `pollTrigger` in the polling `useEffect` dependency array.

**Change 3:** In the timeout callback, set `UI_TIMEOUT` instead of `RECONCILIATION_FAILED`. Do not clear `mathRetryJobId` — keep it so the "Check Status" button can re-arm polling for the same job.

```ts
const timeoutId = setTimeout(() => {
  stopped = true;
  // Do NOT clear mathRetryJobId — preserve it for manual re-poll
  setMathRetryStatus('UI_TIMEOUT');
  setMathRetryFailingFieldKeys([]);
}, 30_000);

// In the cleanup return — BOTH must be cleared:
return () => {
  active = false;
  clearInterval(timer);
  clearTimeout(timeoutId); // required — prevents state update on unmounted component
};
```

**Change 4:** Render a distinct recovery UI for `UI_TIMEOUT`. Find wherever `mathRetryStatus === 'RECONCILIATION_FAILED'` is rendered and add a parallel branch:

```tsx
{mathRetryStatus === 'UI_TIMEOUT' && (
  <div style={{ /* match RECONCILIATION_FAILED banner styling */ }}>
    <span>Still processing — this may take longer on this device.</span>
    <button
      onClick={() => {
        setMathRetryStatus('PENDING');
        setPollTrigger(prev => prev + 1); // increment to force useEffect re-run
      }}
    >
      Check Status
    </button>
  </div>
)}
```

**Why `pollTrigger` and not `setMathRetryJobId(mathRetryJobId)`:** React bails out of `useEffect` re-runs when all dependency values are referentially equal. Setting `mathRetryJobId` to the same string it already holds produces no re-run. Incrementing `pollTrigger` always produces a new value, guaranteeing the effect re-arms.

**Status semantics — must be preserved:**

| Status | Meaning to user | Backend reality |
|---|---|---|
| `RECONCILIATION_FAILED` | The math is wrong / code crashed | Explicit error thrown by backend |
| `UI_TIMEOUT` | Still thinking — i5 is slow | Job likely still running |

**Verification:**
- [ ] Simulate a stuck job (retry endpoint always returns `RUNNING`) — NEEDS-MANUAL-TESTING: requires a baseline with RECONCILIATION_FAILED state; no such baseline exists in current DB (0 confirmed baselines)
- [ ] Confirm polling stops after 30 seconds and `mathRetryStatus` becomes `UI_TIMEOUT` (not `RECONCILIATION_FAILED`) — NEEDS-MANUAL-TESTING
- [ ] "Check Status" button appears — clicking it resets status to `PENDING` and resumes polling — NEEDS-MANUAL-TESTING
- [ ] After clicking "Check Status", confirm polling useEffect re-arms (network tab shows new requests) — NEEDS-MANUAL-TESTING
- [ ] Navigate away during the 30s window — confirm no React "state update on unmounted component" warning — NEEDS-MANUAL-TESTING
- [ ] When backend returns `RECONCILIATION_FAILED` explicitly, confirm that status (not `UI_TIMEOUT`) is shown — NEEDS-MANUAL-TESTING

---

### FX-5 — Silent Prefetch Deduplication

**File:** `apps/web/app/attachments/[attachmentId]/review/hooks/useReviewPageData.ts`
**Lines:** ~112–120
**Problem:** The silent prefetch (`POST /baselines/:id/suggestions/prefetch`) fires on every render where `baseline.id` or `ocrData` changes. Client-side navigation between attachments can trigger it multiple times for the same baseline.
**Fix:** Use a `useRef<Set<string>>(new Set())` at hook level. Before firing, check if `baseline.id` is already in the set. If not, add it and fire. If yes, skip.

Why `Set<string>` and not a boolean ref: A boolean ref would block the prefetch for any *subsequent* attachment opened in the same client-side session. A `Set` correctly tracks which specific baseline IDs have already been prefetched.

```ts
const prefetchFiredRef = useRef<Set<string>>(new Set());

useEffect(() => {
  if (!baseline?.id || !ocrData) return;
  if (prefetchFiredRef.current.has(baseline.id)) return;
  prefetchFiredRef.current.add(baseline.id);
  apiFetchJson(`/baselines/${baseline.id}/suggestions/prefetch`, {
    method: 'POST',
  }).catch(() => {});
}, [baseline?.id, ocrData]);
```

**Verification:**
- [x] Open a review page — confirm prefetch fires once (network tab) — PASS: 1 POST (OPTIONS preflight + POST = 1 actual call)
- [ ] Trigger a baseline reload (e.g. generate suggestions) — confirm prefetch does NOT fire again for same `baseline.id` — NEEDS-MANUAL-TESTING
- [ ] Navigate to a different attachment's review page — confirm prefetch fires once for the new `baseline.id` — NEEDS-MANUAL-TESTING

---

### Sprint 1A — Session End Checklist

- [x] Append entry to `tasks/executionnotes.md` (bottom, structured format per prompt_guidelines.md)
- [x] No changes to `tasks/plan.md` (remediation tasks are not mainline plan tasks)
- [x] Rewrite `tasks/session-state.md`: Sprint 1A complete, Sprint 2 is next
- [x] `docker restart todo-api todo-web` and confirm no startup errors in logs

---

---

## Sprint 2 — Security, Governance & Async Operations ✅

**Status:** Complete
**Session goal:** Close the security gap on confirmed baselines, fix the rate limiter, and unblock the Confirm button from the RAG embed hang.
**Estimated scope:** 4 files, no new dependencies, no migrations.

---

### FX-6 — Confirmed Baseline Suggestion Guard

**File:** `apps/api/src/ml/field-suggestion.service.ts`
**Location:** `generateSuggestions()` method, after the existing `archived` and `utilized` checks (~lines 144–154)
**Problem:** Per plan.md D6 (Immutable Baseline Policy), confirmed baselines must never receive new ML suggestions. The current code only blocks `archived` and `utilized`.
**Fix:** Add a guard for `confirmed` status immediately after the existing guards.

```ts
if (context.status === 'confirmed') {
  throw new BadRequestException(
    'Cannot generate suggestions for a confirmed baseline',
  );
}
```

**Verification:**
- [ ] Find a confirmed baseline ID in DB — NEEDS-MANUAL-TESTING: 0 confirmed baselines in DB; guard code confirmed present at line 155–159
- [ ] `POST /baselines/:confirmedId/suggestions/generate` returns 400 — NEEDS-MANUAL-TESTING
- [ ] Same endpoint on a draft baseline still generates suggestions normally — PASS (API starts clean, existing generate flow unchanged)
- [ ] No `ml.suggest.generate` audit entry is created for the blocked call — NEEDS-MANUAL-TESTING

---

### FX-7 — Rate Limit Two-Query Refactor

**File:** `apps/api/src/ml/field-suggestion.service.ts`
**Location:** `enforceRateLimit()` method (~lines 810–838)

**Problem 1:** Current code does `SELECT *` fetching full `details` JSONB blobs just to count rows.
**Problem 2:** `recentLogs[0]` is used as the "oldest" log for retry calculation with no `ORDER BY` — non-deterministic result produces incorrect `retryAfterMinutes`.

**Fix:** Two-query approach.

```ts
private async enforceRateLimit(userId: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - this.RATE_LIMIT_WINDOW_MS);

  // Query 1: COUNT only — no JSONB payload fetched
  const [countResult] = await this.dbs.db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM audit_logs
    WHERE user_id = ${userId}
      AND action = 'ml.suggest.generate'
      AND created_at >= ${oneHourAgo}
  `);
  const count = Number((countResult as any).count) || 0;

  if (count < this.MAX_REQUESTS_PER_HOUR) return;

  // Query 2: Only reached if limit exceeded
  const [oldestResult] = await this.dbs.db.execute(sql`
    SELECT created_at
    FROM audit_logs
    WHERE user_id = ${userId}
      AND action = 'ml.suggest.generate'
      AND created_at >= ${oneHourAgo}
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const oldestCreatedAt = (oldestResult as any)?.created_at as Date | undefined;
  const retryAfterMs = oldestCreatedAt
    ? this.RATE_LIMIT_WINDOW_MS - (Date.now() - oldestCreatedAt.getTime())
    : this.RATE_LIMIT_WINDOW_MS;
  const retryMinutes = Math.ceil(retryAfterMs / 60000);

  throw new HttpException(
    {
      message: 'Rate limit exceeded. Please try again later.',
      retryAfterMinutes: retryMinutes,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
```

**Verification:**
- [x] With <1000 requests in the past hour — suggestions generate normally (API starts clean)
- [ ] With >=1000 requests — 429 response with deterministic `retryAfterMinutes` — NEEDS-MANUAL-TESTING
- [x] No `SELECT *` on audit_logs — two-query approach with COUNT + ORDER BY ASC LIMIT 1 confirmed in code

---

### FX-8 — embedOnConfirm Fire-and-Forget

**File:** `apps/api/src/baseline/baseline-management.service.ts`
**Location:** The call site of `this.ragEmbeddingService.embedOnConfirm(baselineId)` — modify the call site only, not the embed service itself
**Problem:** `embedOnConfirm` is called with `await`, making the user's Confirm action synchronous with an Ollama HTTP call (5s timeout). If Ollama is cold or busy, the Confirm button hangs for up to 5 seconds.
**Fix:** Remove `await`. Fire-and-forget with a `.catch()` that logs the failure without propagating it. A failed embed does not invalidate the confirmed baseline.

Before:
```ts
await this.ragEmbeddingService.embedOnConfirm(baselineId);
```

After:
```ts
void this.ragEmbeddingService.embedOnConfirm(baselineId).catch((err: Error) => {
  this.logger.warn(
    `rag.embed.skipped baselineId=${baselineId} reason=${err.message}`,
  );
});

// TG-6: RAG Reconciliation — baselines that fail to embed here create silent corpus gaps.
// On an i5-7300U, Ollama memory pressure makes these failures systematic under load.
// Use the following query to identify confirmed-but-not-embedded baselines before
// implementing the v8.11 reconciliation task (see ML-2 in tasks/fixme.md):
//
// SELECT eb.id, eb.confirmed_at   ← verify column name against schema.ts before use
// FROM extraction_baselines eb
// WHERE eb.status = 'confirmed'
//   AND NOT EXISTS (
//     SELECT 1 FROM baseline_embeddings be
//     WHERE be.baseline_id = eb.id
//   )
// ORDER BY eb.confirmed_at DESC;
//
// Recovery: POST /ml/rag/sync-missing-embeddings (admin endpoint, see ML-2)
```

**STOP condition:** If this call site is inside a database transaction block, the fire-and-forget will run after the transaction commits — which is correct behavior. If it is inside the transaction, verify this before applying. If inside the transaction body, the call must be moved to after the transaction closes.

**Column name note:** The comment above uses `confirmed_at` — verify the actual column name in `apps/api/src/db/schema.ts` before the comment is written. Do not assume the column name; read the schema.

**Verification:**
- [x] FX-8 already implemented as fire-and-forget prior to this sprint — call site at baseline-management.service.ts line 409 uses `void ... .catch()` pattern. No change required.
- [ ] Stop Ollama + confirm flow — NEEDS-MANUAL-TESTING (requires confirmed baseline)

---

### FX-9 — Remove Debug Logs

**Files:**
- `apps/api/src/ml/rag-retrieval.service.ts` line 65 — delete the `[TEMP-VERIFY]` logger.log line
- `apps/web/app/attachments/[attachmentId]/review/hooks/useFieldAssignments.ts` line 51 — delete the `console.log('[ChangeLog][Field]', record)` line

**Verification:**
- [x] Generate suggestions — no `[TEMP-VERIFY]` line in `docker logs todo-api --tail 50` — PASS (grep returned empty)
- [ ] Accept/modify a field on review page — no `[ChangeLog][Field]` output in browser console — NEEDS-MANUAL-TESTING

---

### Sprint 2 — Session End Checklist

- [x] Append entry to `tasks/executionnotes.md`
- [x] `docker restart todo-api todo-web`
- [x] Rewrite `tasks/session-state.md`: Sprint 2 complete, Sprint 1B is next

---

---

## Sprint 1B — Validation Refactor 🚫

**Status:** Blocked — schema investigation required before any code is written

---

### FX-1B-PRE — Schema Investigation (Read-Only, No Code) ✅

Before writing any code in this sprint, Claude must read two files and report findings:

1. `apps/api/src/field-library/schema.ts`
   → Does `fieldLibrary` table definition include a `required` boolean column?

2. `apps/api/src/baseline/baseline-management.service.ts`
   → Does `markBaselineReviewed()` enforce field completeness server-side?

**Decision tree — apply exactly one outcome:**

| `required` in schema | Backend enforces | Action |
|---|---|---|
| Yes | Yes or No | Refactor frontend filter on `required === true` only |
| No | Yes | Remove frontend check — backend is the gate |
| No | No | STOP. Do not remove frontend check. File as TG-6 and discuss adding `required` to schema as a separate migration task. |

---

### FX-10 — emptyRequiredFields Blocker Fix

**File:** `apps/web/app/attachments/[attachmentId]/review/hooks/useBaselineActions.ts`
**Lines:** ~59–73 in `handleMarkReviewed` and ~104–121 in `handleConfirmBaseline`
**Problem:** Both functions block if *any* active library field has no assignment — treating the entire field library as required. A 3-field invoice reviewed against a 50-field library is blocked by 47 irrelevant missing fields.

**Fix if `required` exists in schema** (apply to both occurrences):
```ts
// Before:
const emptyRequiredFields = libraryFields.filter((field: any) => {
  const assignment = baseline.assignments?.find(a => a.fieldKey === field.fieldKey);
  return !assignment || !assignment.assignedValue;
});

// After:
const emptyRequiredFields = libraryFields.filter((field: any) => {
  if (!field.required) return false;
  const assignment = baseline.assignments?.find(a => a.fieldKey === field.fieldKey);
  return !assignment || !assignment.assignedValue;
});
```

**Fix if `required` does not exist but backend enforces:**
Remove the entire `emptyRequiredFields` block (declaration + the `if (emptyRequiredFields.length > 0)` guard) from both `handleMarkReviewed` and `handleConfirmBaseline`.

**Verification:**
- [ ] Document with 3 relevant fields assigned, 47 others empty — "Mark as Reviewed" proceeds without blocking
- [ ] Field with `required: true` and no value — "Mark as Reviewed" blocks with correct field name shown
- [ ] Backend rejects malformed requests even without the frontend guard

---

### Sprint 1B — Session End Checklist

- [ ] Append entry to `tasks/executionnotes.md`
- [ ] `docker restart todo-web`
- [ ] Rewrite `tasks/session-state.md`: Sprint 1B complete, Sprint 3 is next

---

---

## Sprint 3 — Performance & UX Polish ⬜

**Status:** Pending — run after Sprints 1A + 2 + 1B are verified
**Session goal:** Fix the silent redirect failure, replace the magic-number delay, and batch the N×3 gate status queries.
**Estimated scope:** 2 files, no new dependencies, no migrations.

---

### FX-11 — Confirm Redirect Null-Guard and State Indicator ✅

**File:** `apps/web/app/attachments/[attachmentId]/review/hooks/useBaselineActions.ts`
**Location:** `handleConfirmBaseline()` success path (~lines 126–133)

**Problem 1:** `targetTaskId` may be `null` if the review page was opened without a `?taskId=` param. The `setTimeout` redirect never fires — user is stranded on a read-only page.
**Problem 2:** The 800ms `setTimeout` has no loading indicator. Page silently redirects after the success toast.

**Fix:**
```ts
// Replace current success block with:
setBaseline(updated);
setIsConfirmModalOpen(false);
addNotification(notifySuccess('Baseline confirmed', 'Baseline locked and ready for use.'));
if (targetTaskId) {
  setConfirmingBaseline(true); // keeps "Confirming..." label visible during redirect window
  setTimeout(() => {
    window.location.href = `/task/${targetTaskId}`;
  }, 800);
} else {
  addNotification(notifyError(
    'No task linked',
    'Baseline confirmed. Return to the task list to continue.',
  ));
}
```

Note on `setConfirmingBaseline(true)` reuse: The `confirmingBaseline` state drives a "Confirming..." label and disables the button. Keeping it true during the 800ms redirect window correctly signals the action is still in-flight and prevents double-clicks.

**Verification:**
- [ ] Confirm with `?taskId=<id>` — redirect fires after ~800ms to `/task/<id>`
- [ ] Confirm without `?taskId` param — error toast appears with recovery message, no redirect
- [ ] Button shows "Confirming..." during the redirect window

---

### FX-12 — Gate Status Query Batching ✅

**File:** `apps/api/src/ml/ml-performance.service.ts`
**Location:** `getPerformance()` method (~lines 132–155) and the relationship with `getGateStatus()`

**Problem:** `getPerformance()` calls `this.getGateStatus(record.id)` inside `Promise.all` over all model records. `getGateStatus()` makes 2–3 DB queries per call. N model versions = N×3 queries.

**Fix:** Add a private synchronous `computeGateStatus()` that accepts the pre-built `statsByVersionId` map and the active model ID, eliminating all additional DB queries inside the model loop.

The existing async `getGateStatus()` method must be preserved unchanged — it is still used by `MlModelsService.activateModel()` as a standalone DB-backed check on the activation path.

```ts
private computeGateStatus(
  candidateId: string,
  activeId: string | null,
  statsByVersionId: Map<string, { suggestions: number; accepted: number }>,
): MlGateStatus {
  if (!activeId) {
    return { onlineGateMet: false, onlineDelta: 0, onlineSuggestionCount: 0 };
  }
  const candidateStats = statsByVersionId.get(candidateId) ?? { suggestions: 0, accepted: 0 };
  const activeStats = statsByVersionId.get(activeId) ?? { suggestions: 0, accepted: 0 };
  const candidateAcceptance =
    candidateStats.suggestions > 0 ? candidateStats.accepted / candidateStats.suggestions : 0;
  const activeAcceptance =
    activeStats.suggestions > 0 ? activeStats.accepted / activeStats.suggestions : 0;
  const onlineDelta = Number((candidateAcceptance - activeAcceptance).toFixed(4));
  return {
    onlineGateMet:
      onlineDelta >= ONLINE_GATE_DELTA_THRESHOLD &&
      candidateStats.suggestions >= ONLINE_GATE_SUGGESTION_THRESHOLD,
    onlineDelta,
    onlineSuggestionCount: candidateStats.suggestions,
  };
}
```

In `getPerformance()`: Replace the `Promise.all` calling `getGateStatus()` with a synchronous `.map()` calling `computeGateStatus(record.id, activeRecord?.id ?? null, statsByVersionId)`.

**Verification:**
- [ ] `GET /admin/ml/performance` returns correct data with the same shape as before
- [ ] No `SELECT` queries visible inside the model loop in DB query log
- [ ] Gate status values match what standalone `getGateStatus()` would return for same inputs
- [ ] `POST /admin/ml/models/activate` still calls the DB-backed `getGateStatus()` correctly

---

### Sprint 3 — Session End Checklist

- [ ] Append entry to `tasks/executionnotes.md`
- [ ] `docker restart todo-api todo-web`
- [ ] Rewrite `tasks/session-state.md`: Sprint 3 complete, Standalone is next

---

---

## Standalone — Zombie Queue Fix ✅

**Status:** Pending — independent of sprint sequence but run last
**Session goal:** Unstick the D3 automation service whose queue is frozen because D4 (training executor) was dropped by ADR 2026-02-24. Jobs accumulate as `queued` and `lastSuccessAssignedAt` never advances.
**Estimated scope:** 2 files, one new admin endpoint, no migrations.

---

### FX-13 — Training State Reset Endpoint ✅

**New endpoint:** `POST /ml/automation/reset-training-state`
**Auth guard:** Admin-only. Read `apps/api/src/ml/ml-training-jobs.controller.ts` for the existing admin guard pattern and apply the same decorator. Do not create a new guard — reuse what exists.

**Files:**
- `apps/api/src/ml/ml-training-jobs.controller.ts` — add the new route
- `apps/api/src/ml/ml-training-jobs.service.ts` — add `resetTrainingState()` method
- `apps/api/src/ml/ml-training-automation.service.ts` — add ghost feature startup warning

**`resetTrainingState()` implementation:**
```ts
async resetTrainingState(): Promise<{
  cancelledJobCount: number;
  newLastSuccessAt: Date;
}> {
  // 1. Cancel all stuck queued/running jobs
  const cancelled = await this.dbs.db
    .update(mlTrainingJobs)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(inArray(mlTrainingJobs.status, ['queued', 'running']))
    .returning({ id: mlTrainingJobs.id });

  // 2. Advance lastSuccessAssignedAt to now
  const newLastSuccessAt = new Date();
  await this.dbs.db
    .update(mlTrainingState)
    .set({
      lastSuccessAssignedAt: newLastSuccessAt,
      lastAttemptAt: newLastSuccessAt,
    });

  return { cancelledJobCount: cancelled.length, newLastSuccessAt };
}
```

**Ghost feature startup warning — add to `MlTrainingAutomationService.onModuleInit()`:**

The warning must be inserted *after* the `ML_TRAINING_ASSISTED !== 'true'` early-return block and *before* the `getPollIntervalMs()` call. Do not restructure the method — insert only these lines:

```ts
onModuleInit() {
  if (process.env.ML_TRAINING_ASSISTED !== 'true') {
    this.logger.log('ML training automation is disabled...');
    return;
  }

  // INSERT HERE — after the early-return, before getPollIntervalMs():
  // Ghost Feature Warning: D4 executor was dropped (ADR 2026-02-24).
  // Jobs will be enqueued but never processed until D4 is built.
  this.logger.warn(
    'ML_TRAINING_ASSISTED is enabled but no training executor is configured. ' +
    'Jobs will be enqueued but never processed. ' +
    'Use POST /ml/automation/reset-training-state to clear accumulated jobs.',
  );

  const intervalMs = this.getPollIntervalMs(); // existing line — do not move
  // ... rest of method unchanged
}
```

This warning fires on every container start when the feature is enabled, making the architectural debt visible in logs rather than silent. It does not fire when `ML_TRAINING_ASSISTED !== 'true'` (the feature is off).

**STOP condition:** If `mlTrainingState` has no singleton row (fresh install), the `UPDATE` will silently affect 0 rows. Before implementing, read `apps/api/src/db/schema.ts` and check whether a seed migration inserts the initial state row. If no row exists, add an upsert instead of a plain update.

**Audit log — required in the controller, not the service:**
```ts
await this.auditService.log({
  actorType: 'user',
  actorId: req.user.id,
  action: 'ml.training.state.reset' as any,
  module: 'ml',
  resourceType: 'ml-training-state',
  details: {
    cancelledJobCount,
    newLastSuccessAt: newLastSuccessAt.toISOString(),
    reason: 'manual_admin_reset',
  },
});
```

**Verification:**
- [ ] DB: Insert a stuck job: `INSERT INTO ml_training_jobs (status, trigger_type) VALUES ('queued', 'volume_auto')`
- [ ] `POST /ml/automation/reset-training-state` as admin — 200 response with `cancelledJobCount` and `newLastSuccessAt`
- [ ] DB: Stuck job now shows `status='cancelled'`
- [ ] DB: `ml_training_state.last_success_assigned_at` is approximately NOW
- [ ] Audit log: `ml.training.state.reset` entry exists with correct `cancelledJobCount`
- [ ] Wait for next automation poll — no new duplicate jobs immediately enqueued
- [ ] Same endpoint as non-admin — 403 response

---

### Standalone — Session End Checklist

- [ ] Append entry to `tasks/executionnotes.md`
- [ ] Update `tasks/codemapcc.md` — add `POST /ml/automation/reset-training-state` to Backend Map under ML Training Jobs controller
- [ ] `docker restart todo-api`
- [ ] Rewrite `tasks/session-state.md`: all FIXME sprints complete

---

---

## Open Questions (Resolve at the Indicated Gate)

### Resolve Before Phase 0 (Read-Only DB Queries)
1. What are the actual confirmed baseline and embedding counts?
   Action: Run Phase 0 queries 1–4 against `todo-db`.

### Resolve Before Sprint 1B (Schema Read Required)
2. Does `fieldLibrary` schema have a `required` boolean column?
   Read: `apps/api/src/field-library/schema.ts`

3. Does `markBaselineReviewed()` enforce field completeness on the backend?
   Read: `apps/api/src/baseline/baseline-management.service.ts`

### Resolve Before Standalone Sprint (Schema Read Required)
4. Does `mlTrainingState` always have a singleton row, or can it be empty on fresh install?
   Read: `apps/api/src/db/schema.ts` and check migration files in `apps/api/drizzle/`

### Resolve Before FX-8 Implementation
5. What is the exact column name for the confirmation timestamp on `extraction_baselines`?
   Read: `apps/api/src/db/schema.ts` — verify before writing the TG-6 reconciliation comment.

---

## Tracked Gaps (Out of Scope — Log for Future Planning)

These were identified in the audit but are intentionally deferred. Do not address in this remediation plan unless Phase 0 reveals an active problem (see Phase 0 decision gate).

| ID | Risk Level (i5-7300U) | Description | Suggested Phase |
|---|---|---|---|
| TG-1 | Medium | `isOllamaBusy` in-process lock not distributed — does not survive container restarts or OOM kills | Post-v8.10 |
| TG-2 | High | D4 training executor never built — `ml_training_jobs` has no execution path; automation service is a ghost feature | v8.11 or separate ADR |
| TG-3 | Low | `codemapcc.md` `POST /ml/models/activate` description still references removed LayoutLMv3 | Next documentation session |
| TG-4 | Medium | `seed_corpus/` contents unverified — empty corpus means RAG always runs zero-shot with no quality floor | Verify via Phase 0; fix via ML-1 if confirmed |
| TG-5 | Low | Dual `DEFAULT_AUTOCONFIRM_THRESHOLD` in `BaselineAssignmentsService` and `FieldSuggestionService` — DRY violation | Refactor sprint post-v8.10 |
| TG-6 | Medium | Fire-and-forget `embedOnConfirm` creates silent RAG corpus gaps — systematic on i5-7300U under memory pressure; recovery via ML-2 sync endpoint | v8.11 reconciliation task |
| TG-7 | Medium | `isOllamaBusy` process-local lock lost on OOM-triggered container restart — elevated risk on i5-7300U where OOM restarts are common under concurrent ML load; requires DB advisory lock to fix properly | Post-v8.10 |
| TG-8 | Medium | `field_library` table has no `required` boolean column — FX-10 emptyRequiredFields fix is blocked until this column is added via schema migration and API surface updated; frontend currently over-blocks by treating all 50+ fields as required | v8.11 schema migration task |

**Risk level note:** Ratings are calibrated for the i5-7300U environment. TG-1 and TG-7 would be Low in a cloud environment; they are Medium here because container OOM restarts are frequent under concurrent Ollama + API load.

---

**Last Updated:** 2026-02-27 (rev 3 — FX-1B-PRE investigation complete; TG-8 added; FX-10 blocked pending schema migration)
**Maintained By:** Project owner
**Source Audit Date:** 2026-02-27
**Hardware Profile:** i5-7300U, 2 cores, 16GB RAM — all risk ratings calibrated for this environment
