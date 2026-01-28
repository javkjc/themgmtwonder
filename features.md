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
Introduce **foundational primitives** required for future features — **without enabling them yet**.

v3 explicitly does **not** introduce:
- workflows
- collaboration
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

**Foundations**
- OCR data model (derived, immutable)
- OCR status tracking
- Local OCR worker runs as a separate container

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

## 4. v4 — Structural Task Relationships (Parent–Child)

### Purpose
Enable structured grouping and dependency modeling **without introducing workflows or automation**.

This phase exists to make future workflows and collaboration *possible*, not active.

---

### v4.1 Parent–Child Task Model

**Core Rules**
- A task may be:
  - Independent
  - Parent
  - Child
- Maximum depth: **2 levels**
  - Parent → Child
  - No grandparents
  - No child-of-child

---

### v4.2 Structural Constraints

**Parent Task**
- Cannot be scheduled on the calendar
- Cannot be closed if any child task is not closed
- Has no parent itself

**Child Task**
- Can be scheduled independently
- Has exactly one parent
- Cannot be reopened if its parent is closed

**Independent Task**
- Has no parent
- May later be promoted to parent or attached as a child

---

### v4.3 Stage Semantics (Non-Mutating)

- Parent and child stages are independent
- Stage changes:
  - do not cascade
  - do not auto-sync
- Constraints:
  - Parent cannot close unless all children are closed
  - Child cannot reopen if parent is closed

---

### v4.4 Association & Disassociation

- Tasks can be:
  - Converted into a parent
  - Attached to a parent as a child
  - Detached from a parent (becoming independent)

Rules:
- Explicit user action required
- Mandatory remark required
- Fully audited (before/after)

---

### v4.5 Delete Semantics

- Deleting a parent:
  - Blocked if children exist
- Deleting a child:
  - Removes association only
  - Does not affect parent state

---

## 5. v5 — External Intake (Telegram, Explicit Only)

### Purpose
Allow external intent capture **without automatic task mutation**.

Telegram acts strictly as a **capture surface**, not an executor.

---

### v5.1 Telegram Bot Setup (Out-of-Band)

**Status**
- Telegram bot is **not yet created**
- Bot setup occurs **outside the IDE / codebase**

**Setup Characteristics**
- Bot is created via Telegram’s BotFather
- Bot token is stored securely (environment variable / secret)
- No logic is embedded in Telegram itself
- Bot does not hold user authority

This setup is considered **infrastructure preparation**, not a product feature.

---

### v5.2 Telegram Intake Capabilities

**Capabilities**
- Accept images and text
- Forward content to the backend
- Store content as attachments
- Allow OCR to be triggered explicitly

Telegram:
- Never mutates tasks
- Never schedules events
- Never executes actions autonomously
- Never bypasses application permissions

---

### v5.3 Suggested Actions (User-Confirmed)

After OCR + basic extraction, the system may suggest:
- Create a task
- Create a calendar event
- Add attachment to existing task
- Schedule existing task
- Do nothing

Rules:
- Suggestions are non-binding
- User must explicitly choose
- “Do nothing” is always available

---

## 6. v6 — Workflow Orchestration (User-Triggered Only)

### Purpose
Support **explicit, multi-step orchestration** without embedding procedural logic into the core API.

This phase introduces orchestration, **not automation**.

---

### v6.1 Role of Workflow Engine (e.g. n8n)

- Runs as a separate container
- Treated as a system actor
- Does not authenticate users
- Does not own permissions
- Does not mutate core state

The application:
- Validates intent
- Triggers workflows explicitly
- Applies all authoritative mutations
- Writes audit logs

---

### v6.2 Supported Orchestration Use Cases

- OCR orchestration (engine-agnostic)
- Multi-step “apply OCR” preparation
- Parent–child association orchestration
- Derived data rebuilds (e.g. search index)

All executions:
- Explicitly triggered
- Audited
- Non-automatic

---

### v6.3 Authentication Model

- Users authenticate only with the application
- Application ↔ workflow engine uses service tokens
- Workflow callbacks are authenticated as system actors

---

## 7. v7 — Undo & Correction Semantics

### Purpose
Provide **safe, honest reversibility** without time travel.

Undo restores **validity**, not history.

---

## 8. v8 — Assistive Planning & Intelligence (Advisory)

Help users reason **before acting**, without execution authority.

---

## 9. v9 — Collaboration Semantics (Presence-Aware Only)

Introduced only **after workflows and undo semantics exist**.

- Informational presence only
- No shared control
- No correctness guarantees

---

## 10. v10 — Security Hardening & Codebase Integrity

- Auth & authorization review
- Audit log integrity
- Attachment safety
- Dependency scanning
- Explicit documentation of accepted risks

---

## 11. Permanently Out of Scope

- Background automation
- Implicit execution
- Google Docs–style real-time collaboration
- AI-driven auto-mutation
- System acting without explicit user intent

---

## 12. Canonical Invariants (Stable)

- Explicit > implicit
- Auditability over convenience
- Derived data is never authoritative
- Undo restores validity, not history
- Operational actions are corrected, not undone

---

### Status
- v1–v2: Complete
- v3: In progress
- v4–v10: Planned and phase-gated
