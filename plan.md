PLAN — v3 Execution Contract

CLAUDE / CODEX:
Read sections 1–5 only.
Execute Next Actions sequentially.
One concern per task.
Stop immediately when all tasks are marked ✅ DONE.

This plan governs **v3 Capability Foundations ONLY**.
No work beyond v3 is permitted under this plan.

v1 and v2 are complete and must not be modified unless explicitly stated.

---

## 1. Project Snapshot (Stable)

**Stack**

Frontend: Next.js (App Router, React, TypeScript)  
Backend: NestJS + Drizzle ORM  
Database: PostgreSQL 16  
Auth: JWT (httpOnly cookies)  
Infrastructure: Dockerized (Web → API → DB → OCR Worker)

---

## 2. v3 Scope Lock & Principles

### Scope Lock (v3)
- Introduce **foundational primitives only**
- No automatic workflows
- No background automation without explicit user action
- No real-time collaboration
- No permission model redesign
- No breaking API changes unless explicitly listed

### Explicitly Out of Scope for v3
- Collaboration features
- Workflow engines
- Undo / correction semantics
- Assistive planning or ML intelligence
- Security refactors or audits beyond local changes required by OCR

These belong to **future plan phases**.

---

### Core Design Rule (Non-Negotiable)
> All v3 changes MUST remain valid if the system later supports:
> - multiple users per task
> - workflow-driven transitions
> - system actors performing derived actions

v3 must **prepare for** but not **enable** these capabilities.

---

### Definition of Done (All Tasks)
- Runtime behavior verified manually by user
- No regressions to v2 behavior
- No implicit state mutation
- Audit trail complete and accurate
- Changes are minimal, localized, reversible
- plan.md updated at start and end of work
- executionnotes.md appended (append-only)
- Verification: Not performed (manual), unless explicitly stated otherwise

---

## 3. Current State (v3 Entry Point)

- v1 Feature Delivery: ✅ Complete
- v1 Hardening & Correctness: ✅ Complete
- v2 UX & Product Evolution: ✅ Complete
- Codebase stable, auditable, migration-safe
- No known blocking runtime issues

### Regression Gate (Informational Only)
- Automated regression scripts are **not gating v3**:
  - `typecheck` script not defined
  - `lint` failures due to **pre-existing** `@typescript-eslint/react-hooks/unsafe-any`
  - `jest` unit/e2e exit with `jest-worker` spawn `EPERM` (environmental)
- These issues are acknowledged and documented
- **No fixes are required for v3 completion**
- Manual verification remains authoritative

(See `executionnotes.md` → 2026-01-27 Regression Gate)

---

## 4. Next Actions (Execution Queue)

MODE: Capability Foundations (v3 only)  
Sequential execution. One concern per task.

---

### **7.1 Task Stages — Data & Semantics Only**

**Status:** ✅ DONE

- Added `stageKey` to tasks
- Defined system stage constants
- Stage changes are explicit and audited
- Existing tasks default safely

No further work permitted under this task.

---

### **7.2 Stage-Aware Content Tagging (Remarks & Attachments)**

**Status:** ✅ DONE

- Remarks and attachments capture `stageKeyAtCreation`
- Informational stage badges displayed
- No mutation of existing data

No further work permitted under this task.

---

### **7.3 Derived Task Views (UX Clarity)**

**Status:** ✅ DONE

**Objective**
Provide derived, read-only task views to improve user reasoning without prioritization or automation.

**In Scope**
- Derived task lists (e.g. unscheduled tasks)
- Read-only, user-controlled filters
- No prioritization logic
- No highlighting or auto-focus

**Out of Scope**
- Any implicit guidance
- Any mutation of task state

No further work permitted under this task.

---

### **7.4 Document Intelligence (OCR) — Foundations**

OCR is treated as **deterministic extraction**, not intelligence.

Subtasks must be executed **in order**.

---

#### **7.4a OCR Storage & Data Model (Derived-Only)**

**Status:** ✅ DONE

---

#### **7.4b Manual OCR Trigger**

**Status:** ✅ DONE

- Explicit per-attachment user action
- Backend trigger endpoint functional
- OCR worker invocation, derived storage, and audits complete
- No automation or background execution

---

#### **7.4c OCR Viewer (Read-Only, Inline)**

**Status:** ✅ DONE

- Inline expandable viewer under attachment
- Read-only extracted text
- Copy-to-clipboard
- Clear status indicators

---

#### **7.4d OCR → Task / Remark Apply (Explicit & Audited)**

**Status:** ✅ DONE

- Explicit apply actions only
- Confirmation required
- Before/after audit snapshots recorded
- No interpretation or parsing

---

#### **7.4e OCR Search Index**

**Status:** ⏸️ DEFERRED (v3 Scope Lock)

**Decision**
Deferred to a future phase.

**Rationale**
- Search semantics not yet stable
- Must align with future workflows and intelligence
- v3 remains extraction + explicit interaction only

---

### **7.5 Collaboration Readiness Audit (No Enablement)**

**Status:** ✅ DONE

**Objective**
Verify v3 changes do not block future collaboration.

**In Scope**
- Schema review
- Audit expressiveness review
- Identification of blockers only

---

### **7.6 Workflow Readiness Audit (No Enablement)**

**Status:** ✅ DONE

**Objective**
Verify v3 changes do not block future workflows.

**In Scope**
- Explicit transition validation
- Audit sufficiency
- No implicit assumptions

---

## 5. Guardrails (Inherited)

### Runtime Preconditions
- Docker services must be running
- OCR worker available when executing OCR tasks
- If missing → **STOP**

### Forbidden
- ❌ Web browsing
- ❌ Dependency changes unless specified
- ❌ Implicit automation
- ❌ Silent state mutation
- ❌ Schema redesign beyond task scope

### Required Patterns
- ✅ Explicit user actions
- ✅ Derived data never authoritative
- ✅ Audit-first changes
- ✅ Page-level orchestration
- ✅ Global toast system only

### Documentation Rules
- executionnotes.md → append-only
- codemapcc.md → structure/navigation only
- Never mix execution notes into codemapcc.md

---

## STOP CONDITION (v3)

Stop immediately when:
- Tasks **7.1–7.6** are all marked ✅ DONE
- No undocumented blockers remain

Do NOT proceed to:
- collaboration
- workflows
- undo
- intelligence
- security refactors

without a **new plan.md for the next phase**.

---

Last Updated: 2026-01-29  
Status: v3 Foundations — In Progress (7.3, 7.5, 7.6 remaining)
