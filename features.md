# FEATURES — Product Capabilities & Versioned Pipeline

This document defines **what the product is designed to support**, not execution order.

Execution is governed by:
- **plan.md** — single source of truth for implementation
- **executionnotes.md** — append-only evidence of work performed

All features below must preserve the following **non-negotiable invariants**:

- Explicit user intent is required for all state mutation
- Auditability-first (before/after snapshots where applicable)
- No background automation
- No implicit execution
- Derived data is never authoritative
- Backend remains the source of truth

---

## 1. Product Overview

A task- and calendar-centric work management system designed for:

- Structured individual work today
- Safe, explicit collaboration later
- Deterministic workflows without automation
- Audit-first operational correctness

Core philosophy:
- Tasks are the single source of truth
- Calendar is a derived, disposable view
- The system helps users **understand before acting**
- The system never acts without explicit user choice

---

## 2. Implemented Capabilities (v1–v2 Complete)

### v1 — Core System
- Authentication & security
- Task CRUD (source of truth)
- Calendar (derived view)
- Attachments & remarks
- Audit logging
- Admin & system settings
- Hardening & correctness guarantees

### v2 — UX & Product Evolution
- Modal-based task creation
- Global UI theming
- UX regression sweep
- Customizations semantics
- Calendar v2 drag ownership model
- Closeout review (no blockers)

---

## 3. v3 — Capability Foundations (In Progress)

### Purpose
Introduce **foundational primitives** required for future collaboration, workflows, and intelligence — **without enabling them yet**.

v3 explicitly does **not** introduce:
- collaboration
- workflows
- automation
- intelligence
- background execution

---

### v3.1 Task State Foundations

**Intent**  
Provide a stable, explicit task state model compatible with future workflows.

**Capabilities**
- Tasks have a single explicit stage (status, not workflow)
- Stage changes:
  - require explicit user action
  - are fully audited
- Stages use stable system-defined keys
- Existing tasks default safely

**Stage-Aware Context**
- Remarks store the stage active at creation time
- Attachments store the stage active at creation time
- Stage-at-creation tags are informational only

**UX**
- Minimal stage selector in task detail
- Explicit confirmation before stage change
- No pipelines or enforced order

**Non-Goals**
- No workflow rules
- No automation
- No drag-based stage transitions

---

### v3.2 Document Intelligence — OCR (Extraction Layer Only)

**Intent**  
Enable deterministic text extraction from attachments to support user understanding.

**Foundations (Breakdown-Ready)**
- OCR data model (derived, immutable)
- OCR status tracking
- Local OCR worker (separate container)

**User Interaction**
- Manual “Retrieve text” action per attachment
- OCR runs only on explicit user request
- Failures are visible and audited

**Presentation**
- Inline OCR viewer under attachment
- Expand / collapse
- Read-only text
- Copy to clipboard

**Explicit Apply**
- OCR text may be:
  - added as a remark
  - appended to task description
- Requires explicit confirmation
- Fully audited

**Optional**
- OCR text may participate in global search as derived data

**Non-Goals**
- No auto OCR
- No background processing
- No intelligence or field detection

---

### v3.3 Derived Task Views (UX Clarity)

**Intent**  
Improve reasoning about task state without prioritization or automation.

**Capabilities**
- Unscheduled task list supports derived tabs:
  - All unscheduled
  - Recently unscheduled
- Tabs are:
  - derived
  - read-only
  - user-controlled

**Non-Goals**
- No auto focus
- No highlighting
- No implicit prioritization

---

## 4. v4 — Collaboration Semantics (Presence-Aware)

### Purpose
Allow multiple users to coexist safely **without real-time co-editing**.

v4 introduces **awareness**, not shared control.

---

### v4.1 Presence Awareness

**Capabilities**
- Presence indicators:
  - viewing
  - editing
- Presence is:
  - ephemeral
  - best-effort
  - informational only
- Presence never blocks backend mutations

**Non-Goals**
- No hard locks
- No correctness guarantees
- No persistence requirements

---

### v4.2 Soft Edit Prevention

**Intent**
Reduce accidental conflicts while preserving backend authority.

**Capabilities**
- UI may warn or disable edit affordances when another user is editing
- Backend remains authoritative
- Collisions are acceptable and explainable

---

### v4.3 Calendar Semantics (Multi-User Safe)

**Scope**
- Schedule
- Reschedule
- Resize
- Unschedule

**Rules**
- Drag / resize is local and optimistic
- Server is authoritative
- **First valid commit wins**
- Conflicts are rejected with explanation

**Propagation**
- Post-commit state propagation to other users
- Push invalidate → refetch preferred
- Polling fallback acceptable

**Non-Goals**
- No live drag previews
- No reservations
- No background reconciliation

---

### v4.4 Awareness Interaction Primitives

**Capabilities**
- Conflict explanation (“why did this fail?”)
- Change awareness (“what changed since I last looked?”)
- “Why is this disabled?” explanations

---

## 5. v5 — Workflow Semantics (User-Triggered Only)

### Purpose
Enable structured execution **without automation**.

---

### v5.1 Workflow Definitions

**Capabilities**
- Explicit workflow definitions
- Allowed transitions only
- Stable identifiers

**Non-Goals**
- No enforced order
- No triggers
- No automation

---

### v5.2 Workflow Execution

**Capabilities**
- Explicit user trigger
- Deterministic, synchronous execution
- Single execution record per run
- Full before/after audit

---

### v5.3 Execution Interaction Primitives

**Capabilities**
- Preview / simulate before execution
- Explain workflow steps
- Explicit cancel / abort
- “Do nothing” as first-class option

---

## 6. v5.x — Undo & Correction Semantics

### Purpose
Provide **safe, honest reversibility** without time travel.

Undo restores **validity**, not history.

---

### v5.x.1 Undo Eligibility

Undo allowed only if:
- target is a single execution
- no subsequent overwrites exist
- no dependent operational records exist

Undo blocked if:
- multi-user interference occurred
- operational records exist (e.g. task started, logs created)

---

### v5.x.2 Simulated Undo

**Capabilities**
- Read-only undo simulation
- Produces a corrective plan:
  - safe actions
  - blocked actions (with reasons)

---

### v5.x.3 Undo Confirmation & Execution

**Capabilities**
- Explicit confirmation UI
- Compensating execution (not rollback)
- Stop-on-error
- Full audit linkage

---

### v5.x.4 Operational Irreversibility

**Rule**
Once operational records exist:
- undo is not applicable
- only corrective workflows are offered

---

## 7. v6 — Assistive Planning & Intelligence (Advisory)

### Purpose
Help users reason **before acting**, without execution authority.

---

### v6.1 Deterministic Planning Engine (Non-ML)

**Capabilities**
- Analyzes:
  - tasks
  - stages
  - schedules
  - OCR data
  - constraints
- Produces bounded explicit options
- Always includes “do nothing”
- No side effects
- No state mutation

---

### v6.2 Assistive Intelligence (Optional ML)

**Capabilities**
- Runs only after explicit user request
- May:
  - explain options
  - describe tradeoffs
  - structure OCR text
  - suggest extracted fields

**Non-Roles**
- No option generation
- No execution
- No state mutation

---

### v6.3 Planning Interaction Primitives

**Capabilities**
- Option explanation
- Side-by-side comparison
- Explicit selection
- Abort ML job
- User acknowledgement

---

## 8. v6.x — Operational Continuity Interactions

**Capabilities**
- Resume where I left off
- Pause / freeze task
- Structured intent capture (“why”)
- Acknowledge external changes
- Provenance tracing (“where did this value come from?”)

---

## 9. v7 — Security Hardening & Codebase Integrity

### Purpose
Prepare the system for scale, monetization, and external scrutiny.

---

### v7.1 Security Hardening

**Scope**
- Auth & session review
- Authorization boundaries
- Audit log integrity
- Attachment safety
- OCR worker isolation
- Dependency vulnerability scan
- Secrets handling audit

---

### v7.2 Refactoring & Cleanup

**Scope**
- Remove dead code
- Consolidate duplicated logic
- Normalize module boundaries
- Reduce coupling
- Harden error paths
- Simplify complex logic

---

### v7.3 Code Audit

**Scope**
- Architecture review
- Threat modeling (lightweight)
- Performance risk review
- Migration safety review
- Explicit documentation of accepted risks

---

## 10. Permanently Out of Scope

- Background automation
- Implicit execution
- Google Docs–style real-time collaboration
- AI-driven auto-mutation
- System acting without explicit user intent

---

## 11. Canonical Invariants (Stable)

- Explicit > implicit
- Auditability over convenience
- Derived data is never authoritative
- Undo restores validity, not history
- Operational actions are corrected, not undone

---

### Status
- v1–v2: Complete
- v3: In progress
- v4–v7: Planned and phase-gated
