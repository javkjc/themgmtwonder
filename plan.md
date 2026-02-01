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
- Introduce **definition-first flow-builder mental model**
- Introduce **reusable workflow elements (admin-governed)**
- Provide **validation and dry-run preview** tooling only
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
- Relationship / Transaction Graph (belongs to v9+)
- Collaboration semantics

---

### Core Design Rule (Non-Negotiable)

> v6 MUST expose workflows as **human-defined, inspectable, inert graphs of intent**,  
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
- executionnotes.md appended (append-only)
- Verification: Manual (owned by user)

---

## 3. Current State (v6 Entry Point)

- v1–v5 complete and locked
- Workflow definition + execution schemas exist
- Backend supports workflow definition persistence (create/update)
- Admin workflow list & detail pages exist
- Admin workflow editor (draft mode) exists
- ❌ No versioning or activation UI
- ❌ No reusable element library
- ❌ No validation or dry-run tooling
- Codebase migration-safe

---

## 4. Next Actions (Execution Queue)

MODE: Workflow Management — Admin UI (v6 only)  
Sequential execution. One concern per task.

---

### **10.1 Admin Workflow List & Detail Pages (Read-Only)**

**Status:** ✅ DONE

---

### **10.2 Workflow Definition Editor UI (Draft Mode)**

**Status:** ✅ DONE

---

### **10.3 Workflow Versioning & Activation Controls**

**Status:** ✅ DONE

**Objective**  
Allow admins to **explicitly manage workflow lifecycle state** without affecting existing executions.

---

#### In Scope

**Versioning**
- Explicit “Create New Version” action
- New version is cloned from selected version
- Version number increments monotonically
- Previous versions become immutable

**Activation**
- Explicit activate / deactivate actions
- Enforce invariant:
  - **only one active version per workflow**
- Deactivation does NOT affect:
  - existing workflow executions
  - execution history

**Visibility**
- Version history list on workflow detail page
- Clear indication of:
  - active version
  - inactive versions
  - version number
  - creation timestamp

---

#### Rules

- Activation is explicit and user-confirmed
- No implicit version creation
- No auto-activation
- No execution triggers
- No task mutation

---

### **10.4 Workflow Validation & Dry-Run Preview**

**Status:** ✅ DONE

**Objective**
Provide **non-executing validation and human-readable explanation tooling**.

---

#### In Scope

**Validation**
- Structural checks:
  - missing steps
  - invalid ordering
  - missing assignees
  - unsupported step types
- Validation may run on:
  - draft definitions
  - saved definitions

**Dry-Run Preview**
- Human-readable execution explanation
- Possible paths shown (IF / ELSE)
- Derived from:
  - draft state OR
  - saved definition

---

#### Rules

- No execution records created
- No persistence of preview output
- No background evaluation
- No side effects

---

**Completion Summary**
Implemented via [apps/web/app/lib/workflow-validation.ts](apps/web/app/lib/workflow-validation.ts) with pure validation functions (`validateWorkflow`, `generateWorkflowExplanation`, `generateDryRunPreview`). Integrated into workflow editor at [apps/web/app/workflows/[id]/edit/page.tsx](apps/web/app/workflows/[id]/edit/page.tsx) with real-time validation and preview display. All validation is non-executing, non-persisting, and side-effect free.

---

### **10.5 Admin Audit Coverage Verification**

**Status:** ✅ DONE

**Objective**
Ensure **complete audit coverage** for all admin workflow management actions.

---

#### Audit Scope

Audit entries must exist for:
- Workflow creation
- Workflow editing
- Version creation
- Activation
- Deactivation

---

#### Audit Requirements

- Append-only audit log
- Before / after snapshots where applicable
- Actor attribution (admin user)
- Timestamped entries
- No silent changes

---

**Completion Summary**
Audit coverage verified complete. All workflow management operations in [apps/api/src/workflows/workflows.controller.ts](apps/api/src/workflows/workflows.controller.ts) include audit logging via [apps/api/src/audit/audit.service.ts](apps/api/src/audit/audit.service.ts). Coverage confirmed for: workflow.create (lines 58-85), workflow.update (lines 111-141), workflow.create_version (lines 271-298), workflow.activate (lines 319-337), workflow.deactivate (lines 358-376). All entries include actor attribution, timestamps, before/after snapshots, IP address, and user agent. Audit log is append-only.

---

### **10.6 Reusable Workflow Elements (Admin Library)**

**Status:** ✅ DONE

**Objective**  
Introduce **admin-defined reusable workflow elements** to enable no-code composition without sacrificing governance.

---

#### In Scope

**Element Types**
- Step elements:
  - approve
  - review
  - acknowledge
- Decision elements:
  - IF / ELSE branching
  - mandatory default (ELSE) path

**Template Model**
- Versioned element templates
- Each template defines:
  - element type
  - display label
  - default configuration
  - editable fields
  - validation constraints

**Usage**
- Workflow definitions reference:
  - template ID + version
- Each placement creates an **instance configuration**
- Editing an instance does NOT mutate the template
- Updating a template does NOT retroactively change workflows

---

#### Rules

- Admin-only management
- No execution
- No automation
- Full audit coverage for:
  - element creation
  - element update
  - element deprecation

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
- relationship graph
- collaboration

without a **new plan.md for the next phase (v7)**.

---

Last Updated: 2026-01-31
Status: v6 Workflow Management (Admin UI) — ⬜ IN PROGRESS
