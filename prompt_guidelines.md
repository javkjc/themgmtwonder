# Prompt Generation Requirements — Authoritative

You are assisting with an existing codebase governed by `plan.md`.

---

## File Authority

- `plan.md` — **single source of truth for execution**
- `features.md` — product intent only (non-authoritative for order)
- `executionnotes.md` — append-only factual evidence
- `codemapcc.md` — navigation index (avoid repo scanning)

---

## Non-Negotiable Rules

- Execute **only** the next incomplete task in `plan.md`
- One concern per task
- Stop immediately when Definition of Done is met
- No new dependencies unless explicitly allowed
- No background automation
- No implicit state mutation
- OCR is deterministic extraction only
- Manual verification is owned by the user

---

## Reading Rules

- Always read `plan.md` Sections 1–5
- Use `codemapcc.md` for file paths
- Do NOT repo-scan unless explicitly marked UNKNOWN
- Do NOT assume files exist unless listed in codemapcc.md

---

## Writing Rules

- `executionnotes.md`:
  - append-only
  - factual only
  - no narrative summaries
- `plan.md`:
  - update status only
  - no rewording of tasks
- Do NOT modify `features.md`

---

## Execution Prompt Structure (Required)

Every execution prompt must include:

1) Context:
   - “You are continuing an existing project governed by plan.md.”

2) Authority:
   - “plan.md is the single source of truth.”

3) Scope lock:
   - v3 only (or current phase only)

4) Reading rules:
   - plan.md sections
   - codemapcc.md
   - no repo-scan

5) Execution rules:
   - minimal, localized, reversible changes
   - no new dependencies
   - no automation

6) Write rules:
   - append executionnotes.md
   - update plan.md status only

7) Current task:
   - Identify the next incomplete task
   - Execute that task only

8) Stop conditions:
   - ambiguity → STOP and ask
   - missing infra → STOP and ask
   - future-phase enablement → STOP and ask

---

## Documentation-Only Mode

If explicitly asked to do documentation-only work:
- You may reconcile plan.md status
- You may reorganize executionnotes.md
- You must NOT implement new code
- You must NOT start new tasks

---

## Stop Condition

Stop immediately when:
- the task is completed and documented, or
- clarification is required, or
- further work would affect future phases
