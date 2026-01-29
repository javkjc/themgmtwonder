# PLAN — v6 Execution Contract (Workflow Management — Admin UI)

CLAUDE / CODEX:
Read sections 1–5 only.  
Execute **Next Actions** sequentially.  
One concern per task.  
Stop immediately when all tasks are marked ✅ DONE.

This plan governs **v6 Workflow Management (Admin UI) ONLY**.  
No work beyond v6 is permitted under this plan.

v1–v5 are **complete and locked** and must not be modified unless explicitly stated.

---

## 1. Project Snapshot (Stable)

**Stack**

Frontend: Next.js (App Router, React, TypeScript)  
Backend: NestJS + Drizzle ORM  
Database: PostgreSQL 16  
Auth: JWT (httpOnly cookies)  
Infrastructure: Dockerized (Web → API → DB → OCR Worker)

---

## 2. v6 Scope Lock & Principles

### Scope Lock (v6)

- Introduce **admin-only UI** for managing workflow definitions
- Allow **creation, editing, versioning, activation** of workflows
- Provide **validation and preview** only
- No execution from admin UI
- No task mutation
- No background automation
- No permission model redesign
- No workflow participation UI (belongs to v7)

### Explicitly Out of Scope for v6

- Workflow execution UI
- User inbox or participation
- Task state mutation
- Automatic triggers or routing
- Background jobs, timers, schedulers
- Undo / correction semantics
- Intelligence or ML
- External intake (Telegram)
- Collaboration semantics

These belong to **future plan phases**.

---

### Core Design Rule (Non-Negotiable)

> v6 MUST expose workflows as **human-defined, inspectable, inert graphs**,  
> NOT as executable automation and NOT as hidden system behavior.

Admin UI:
- manages **definitions only**
- never executes workflows
- never mutates tasks
- never implies automation

---

### Definition of Done (All Tasks)

- Admin UI functions verified manually by user
- No regressions to v5 behavior
- No workflow execution triggered via UI
- Validation is non-mutating and non-persistent
- Audit trail complete for all admin actions
- Changes are minimal, localized, reversible
- plan.md updated at start and end of work
- executionnotes.md appended (append-only, latest at bottom)
- Verification: Manual (owned by user)

---

## 3. Current State (v6 Entry Point)

- v1–v5 complete and locked
- Workflow definitions & execution models exist
- Backend APIs available for workflow CRUD (data-level)
- No admin UI exists
- No validation or preview tooling exists
- Codebase migration-safe

---

## 4. Next Actions (Execution Queue)

MODE: Workflow Management — Admin UI (v6 only)  
Sequential execution. One concern per task.

---

### **10.1 Admin Workflow List & Detail Pages (Read-Only)**

**Status:** ✅ DONE

**Objective**  
Provide admin-only visibility into existing workflow definitions.

**In Scope**
- Admin route(s) for workflow management
- List view:
  - name
  - version
  - active status
  - last updated
- Detail view:
  - workflow metadata
  - ordered steps
  - conditions (read-only)
- No mutation capability

**Rules**
- Admin-only access
- No execution controls
- No side effects

---

### **10.2 Workflow Definition Editor (Draft Mode)**

**Status:** ⬜ TODO

**Objective**  
Allow admins to create and edit workflow definitions safely.

**In Scope**
- Create new workflow definitions
- Edit name and description
- Edit ordered steps:
  - step type
  - assignee (role / user reference)
- Draft state only
- Explicit save required

**Rules**
- No execution
- No auto-save
- Changes are inert until activated
- Validation errors block save

---

### **10.3 Workflow Versioning & Activation Controls**

**Status:** ⬜ TODO

**Objective**  
Allow admins to manage workflow versions and activation state.

**In Scope**
- Explicit version increment
- Activate / deactivate workflow versions
- Enforce:
  - only one active version per workflow
- Display version history

**Rules**
- Activation is explicit
- Deactivation does not affect existing executions
- Full audit entries for all state changes

---

### **10.4 Workflow Validation & Dry-Run Preview**

**Status:** ⬜ TODO

**Objective**  
Provide non-executing validation and preview tooling.

**In Scope**
- Structural validation:
  - step ordering
  - missing assignees
  - unsupported step types
- Dry-run preview:
  - human-readable execution path
  - condition evaluation explanation
- No persistence of preview results

**Rules**
- No execution records created
- No task mutation
- No workflow execution triggered

---

### **10.5 Admin Audit Coverage Verification**

**Status:** ⬜ TODO

**Objective**  
Ensure all admin workflow actions are auditable.

**In Scope**
- Audit entries for:
  - create
  - edit
  - version
  - activate / deactivate
- Before/after snapshots where applicable
- Actor attribution (admin user)

**Rules**
- Append-only audit log
- No silent changes

---

## 5. Guardrails (Inherited)

### Runtime Preconditions
- Docker services must be running
- Database migrations applied
- If missing → **STOP**

### Forbidden
- ❌ Workflow execution from admin UI
- ❌ Task mutation
- ❌ Background automation
- ❌ Implicit validation side effects
- ❌ Dependency changes unless specified

### Required Patterns
- ✅ Explicit admin intent
- ✅ Draft vs active separation
- ✅ Inert definitions
- ✅ Audit-first design
- ✅ Page-level orchestration

### Documentation Rules
- executionnotes.md → append-only (latest at bottom)
- codemapcc.md → structure/navigation only
- Never mix execution notes into codemapcc.md

---

## STOP CONDITION (v6)

Stop immediately when:
- Tasks **10.1–10.5** are all marked ✅ DONE
- No undocumented blockers remain

Do NOT proceed to:
- workflow participation UI
- execution UI
- automation
- intelligence
- external intake
- collaboration

without a **new plan.md for the next phase (v7)**.

---

Last Updated: 2026-01-29  
Status: v6 Workflow Management (Admin UI) — ⬜ NOT STARTED
