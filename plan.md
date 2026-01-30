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
- Allow **creation, editing, versioning, and activation** of workflows
- Introduce **definition-first flow builder mental model**
- Introduce **reusable workflow elements (admin-governed)**
- Provide **validation and preview** tooling only
- No workflow execution from admin UI
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

### Drag & Drop Semantics (Authoritative)

Drag-and-drop is permitted **only as a visual ordering and placement aid**.

**Allowed**
- Reordering steps within a linear sequence
- Reordering branches within an explicit decision (IF / ELSE)
- Dragging reusable elements into valid insertion points

**Forbidden**
- Free-form wiring between nodes
- Creating logic or branches via drag gestures
- Implicit semantic changes on drag
- Auto-save or background persistence on drag
- Any drag action that alters execution behavior without explicit confirmation

> **Rule:** Drag-and-drop may change *order or placement*, never *semantics*.

---

### Definition of Done (All Tasks)

- Admin UI behavior verified manually by user
- No regressions to v5 behavior
- No workflow execution triggered via UI
- Validation and preview are non-mutating and non-persistent
- Audit trail complete for all admin actions
- Changes are minimal, localized, reversible
- plan.md updated at start and end of work
- executionnotes.md appended (append-only, latest at bottom)
- Verification: Manual (owned by user)

---

## 3. Current State (v6 Entry Point)

- v1–v5 complete and locked
- Workflow definition and execution schemas exist
- Backend supports workflow definition persistence (create/update)
- Admin workflow list & detail pages exist
- Admin workflow editor (draft mode) exists
- No versioning or activation UI exists
- No reusable element library exists
- No validation or dry-run tooling exists
- Codebase migration-safe

---

## 4. Next Actions (Execution Queue)

MODE: Workflow Management — Admin UI (v6 only)  
Sequential execution. One concern per task.

---

### **10.1 Admin Workflow List & Detail Pages (Read-Only)**

**Status:** ✅ DONE

**Objective**  
Provide admin-only, read-only visibility into workflow definitions.

**In Scope**
- `/workflows` list view:
  - name
  - description
  - version
  - active status
  - last updated
- `/workflows/[id]` detail view:
  - workflow metadata
  - ordered steps
  - conditions (read-only)

**Rules**
- Admin-only access
- No mutation capability
- No execution controls
- No side effects

---

### **10.2 Workflow Definition Editor UI (Draft Mode)**

**Status:** ✅ DONE

**Objective**  
Provide an **admin-only workflow editor** for authoring and editing workflows in a **draft-only, inert state**.

This task establishes the **primary authoring experience** but does NOT enable activation, execution, or versioning.

---

#### Navigation & Routing (Authoritative)

1) **Workflow List**
   - Route: `/workflows`
   - Add navigation:
     - **Create Workflow** → `/workflows/new`

2) **Workflow Detail**
   - Route: `/workflows/[id]`
   - Add navigation:
     - **Edit** → `/workflows/[id]/edit`
   - Edit control is admin-only visible
   - No mutation on navigation

3) **Workflow Editor**
   - Create: `/workflows/new`
   - Edit: `/workflows/[id]/edit`
   - Admin-only access
   - Forced password change gating applies

No other navigation paths are permitted under this task.

---

#### Editor Capabilities

**Draft Metadata**
- Edit workflow name
- Edit workflow description

**Ordered Step Editor**
- Add step
- Remove step
- Explicitly reorder steps (drag-and-drop or controls)
- Step properties:
  - step type (approve / review / acknowledge, etc.)
  - assignee (role or user reference)

**Draft State Rules**
- Draft state is client-side only until explicit save
- No auto-save
- No background persistence
- No implicit mutation

**Save Behavior**
- Explicit **Save Draft**
- Validation errors block save
- On success:
  - Persist definition
  - Redirect to read-only detail page

---

#### Preview Panel (Editor Only)

- Read-only
- Derived entirely from draft state
- No persistence
- No execution
- No validation side effects

---

#### Explicitly Forbidden in 10.2

- Activation / deactivation
- Version incrementing
- Execution triggers
- Conditional routing enforcement
- Background jobs
- Auto-save
- Implicit validation

---

### **10.3 Workflow Versioning & Activation Controls**

**Status:** ⬜ TODO

**Objective**  
Allow admins to **explicitly manage workflow lifecycle state** without affecting existing executions.

**In Scope**
- Explicit version increment
- Activate / deactivate workflow versions
- Enforce invariant:
  - **only one active version per workflow**

**Visibility**
- Version history list per workflow
- Active vs inactive clearly indicated

**Rules**
- Activation is explicit and user-confirmed
- Deactivation does NOT affect existing executions
- No implicit version creation
- No auto-activation
- No execution triggers

---

### **10.4 Workflow Validation & Dry-Run Preview**

**Status:** ⬜ TODO

**Objective**  
Provide **non-executing validation and explanation tooling**.

**In Scope**
- Structural validation:
  - step ordering integrity
  - missing assignees
  - unsupported step types
- Human-readable explanations
- Dry-run path preview
- Derived from draft or saved definitions

**Rules**
- No execution
- No persistence of preview output
- No background evaluation
- No side effects

---

### **10.5 Admin Audit Coverage Verification**

**Status:** ⬜ TODO

**Objective**  
Ensure **complete audit coverage** for all admin workflow management actions.

**In Scope**
- Audit entries for:
  - workflow creation
  - workflow editing
  - version creation
  - activation
  - deactivation

**Audit Requirements**
- Append-only audit log
- Before/after snapshots where applicable
- Actor attribution
- Timestamped entries
- No silent changes

---

### **10.6 Reusable Workflow Elements (Admin Library)**

**Status:** ⬜ TODO

**Objective**  
Introduce **admin-defined reusable workflow elements** to support no-code workflow composition.

**In Scope**
- Admin-managed element library
- Step elements (approve / review / acknowledge)
- Decision elements (IF / ELSE)
- Default configuration + editable fields
- Versioned templates
- Instance-level overrides without mutating templates

**Rules**
- Admin-only management
- No execution
- No automation
- Full audit coverage
- Template updates do NOT retroactively change workflows

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
- ✅ Inert workflow definitions
- ✅ Audit-first design
- ✅ Page-level orchestration

---

## STOP CONDITION (v6)

Stop immediately when:
- Tasks **10.1–10.6** are all marked ✅ DONE
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

Last Updated: 2026-01-30  
Status: v6 Workflow Management (Admin UI) — ⬜ IN PROGRESS
