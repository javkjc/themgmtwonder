# FEATURES — Product Capabilities & Versioned Pipeline

This document defines **what the product is designed to support**, not execution order.

Execution is governed by:
- **plan.md** — single source of truth for implementation
- **executionnotes.md** — append-only evidence of work performed

All features below preserve the following **non-negotiable invariants**:

- Explicit user intent is required for all state mutation
- Auditability-first (before/after snapshots where applicable)
- No background automation
- No implicit execution
- Derived data is never authoritative
- Backend remains the source of truth

---

## v1–v2 — Core Task & Calendar System (Complete)

### Purpose
Establish a correct, auditable single-user task and calendar system.

### Capabilities
- Task CRUD as authoritative work unit
- Calendar as derived scheduling view
- Explicit schedule / reschedule / unschedule
- Attachments and remarks
- Full audit logging
- Ownership & permission enforcement

### Execution Boundaries
- Explicit user actions only
- No automation
- No background processing

### Status
✅ Complete

---

## v3 — Task State & Document Intelligence Foundations (Complete)

### Purpose
Introduce **foundational primitives** required for future workflows and intelligence **without enabling them**.

---

### v3.1 Explicit Task Stages

**Capabilities**
- Single explicit stage per task
- Stage changes require confirmation
- Stage transitions fully audited
- Stable system-defined stage keys

**Execution Boundaries**
- Backend + UI
- No workflows
- No automation

**Status**
✅ Complete

---

### v3.2 Stage-Aware Context

**Capabilities**
- Remarks capture stage-at-creation
- Attachments capture stage-at-creation
- Informational only

**Status**
✅ Complete

---

### v3.3 Derived Task Views

**Capabilities**
- Derived, read-only task lists
- Scheduled / unscheduled filtering
- Calendar unscheduled panels

**Execution Boundaries**
- UI-only derivation
- No state mutation

**Status**
✅ Complete

---

### v3.4 Document Intelligence — OCR (Deterministic)

**Capabilities**
- Derived OCR storage per attachment
- Image + PDF OCR
- Explicit user-triggered execution
- Read-only viewer
- Explicit apply to remark / description
- Full audit trail

**Execution Boundaries**
- Backend + UI
- No auto OCR
- No interpretation
- No search coupling

**Status**
✅ Complete

---

## v4 — Structural Task Relationships (Parent / Child) (Complete)

### Purpose
Enable **structural grouping** of tasks without workflows or automation.

---

### v4.1 Parent–Child Data Model

**Capabilities**
- Independent / Parent / Child roles
- Max depth: 2 levels
- One parent per child

**Execution Boundaries**
- Backend schema + constraints only

**Status**
✅ Complete

---

### v4.2 Structural Constraints

**Capabilities**
- Parent cannot be scheduled
- Parent cannot close with open children
- Child cannot reopen if parent is closed

**Status**
✅ Complete

---

### v4.3 Association & Disassociation

**Capabilities**
- Explicit attach / detach
- Mandatory remark
- Before/after audit snapshots

**Status**
✅ Complete

---

### v4.4 Read-Only Relationship Visibility

**Capabilities**
- Relationship section in task detail
- Parent / children navigation
- Relationship column in task list
- Read-only modals

**Status**
✅ Complete

---

### v4.5 Delete Semantics

**Capabilities**
- Parent deletion blocked if children exist
- Child deletion detaches before delete
- Explicit audit entries

**Status**
✅ Complete

---

## v5 — Workflow Foundations (Backend Only) (Complete)

### Purpose
Introduce **inert workflow primitives** without execution automation or UI.

---

### v5.1 Workflow Definitions (Data Model)

**Capabilities**
- Workflow definitions
- Versioned, admin-owned
- Declarative steps and conditions
- No execution logic

**Execution Boundaries**
- Backend only
- Inert data

**Status**
✅ Complete

---

### v5.2 Workflow Execution Records

**Capabilities**
- Workflow execution records
- Step execution history
- Status tracking
- Target via resourceType/resourceId

**Status**
✅ Complete

---

### v5.3 Explicit Workflow Start

**Capabilities**
- User-triggered workflow start
- Ownership validation
- Audit logging

**Status**
✅ Complete

---

### v5.4 Workflow Step Actions

**Capabilities**
- Explicit approve / reject / acknowledge
- Mandatory remark
- Stop-on-error semantics
- No auto-progression

**Status**
✅ Complete

---

### v5.5 Workflow Isolation Audit

**Capabilities**
- No coupling to tasks
- No service cross-dependencies
- Audit sufficiency verified

**Status**
✅ Complete

---

## v6 — Workflow Management (Admin UI) (Planned)

### Purpose
Allow **admins to define and manage workflows**.

---

### v6.1 Workflow Definition Management

**Capabilities**
- Admin UI to create/edit workflows
- Step ordering
- Conditional routing rules
- Versioning and activation

**Execution Boundaries**
- Admin-only UI
- No execution
- No task mutation

---

### v6.2 Workflow Validation & Preview

**Capabilities**
- Dry-run validation
- Human-readable explanation
- No execution

---

## v7 — Workflow Participation (User UI) (Planned)

### Purpose
Allow users to **interact with workflows explicitly**.

---

### v7.1 Workflow Inbox

**Capabilities**
- List of pending workflow steps
- Read-only context
- Explicit action buttons

---

### v7.2 Workflow History & Traceability

**Capabilities**
- Full execution timeline
- Step decisions & remarks
- Audit-backed visibility

---

## v8 — External Intake (Telegram) (Planned)

### Purpose
Capture **external intent** without mutation.

---

### v8.1 Telegram Capture

**Capabilities**
- Receive images and text
- Store as attachments
- OCR optional and explicit

**Execution Boundaries**
- Capture-only
- No task mutation
- No scheduling

---

### v8.2 Suggested Actions

**Capabilities**
- Non-binding suggestions
- Explicit user choice
- “Do nothing” always available

---

## v9 — Undo & Correction Semantics (Future)

Undo restores **validity**, not history.

---

## v10 — Assistive Planning & Intelligence (Future)

Advisory only. No execution authority.

---

## v11 — Collaboration Semantics (Future)

Presence-aware only. No shared control.

---

## Canonical Invariants (Stable)

- Explicit > implicit
- Auditability over convenience
- Derived data is never authoritative
- Undo restores validity, not history
- Operational actions are corrected, not undone
