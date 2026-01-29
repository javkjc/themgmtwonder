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

## 1. Product Overview

A task-, calendar-, and signal-aware work management system designed to unify:

- Human-entered work (tasks, remarks, schedules)
- Machine-generated signals (documents, sensors, devices)
- Explicit orchestration without automation
- Audit-first operational correctness

Core philosophy:
- Tasks are the single source of truth
- Calendar is a derived, disposable view
- External inputs (OCR, sensors, messages) are **observational**
- The system helps users **understand before acting**
- The system never acts without explicit user choice

---

## 2. Core System Capabilities

### 2.1 Task & Calendar Foundations

**Capabilities**
- Task CRUD as the authoritative work unit
- Calendar as a derived view of scheduled tasks
- Explicit scheduling, rescheduling, and unscheduling
- No calendar-owned state

**Rules**
- Calendar mutations always originate from task changes
- No implicit scheduling
- Conflicts are rejected explicitly

---

### 2.2 Attachments, Remarks & Audit

**Capabilities**
- File attachments linked to tasks
- Append-only remarks
- Full audit log with before/after snapshots
- Ownership and permission enforcement

**Rules**
- No background processing
- No implicit content mutation
- Derived data never overwrites user input

---

## 3. Task State Foundations

### 3.1 Explicit Task Stages

**Capabilities**
- Tasks have a single explicit stage
- Stage changes require explicit user action
- Stage transitions are fully audited
- Stable, system-defined stage keys

**Rules**
- Stages are status, not workflows
- No enforced order
- No automation

---

### 3.2 Stage-Aware Context

**Capabilities**
- Remarks capture stage-at-creation
- Attachments capture stage-at-creation
- Informational badges only

**Rules**
- No retroactive mutation
- No cascade effects

---

## 4. Document Intelligence — OCR (Deterministic Extraction)

### Purpose
Enable deterministic text extraction to support user understanding, **not intelligence or automation**.

---

### 4.1 OCR Foundations

**Capabilities**
- Derived OCR storage per attachment
- Immutable OCR outputs (re-runs create new rows)
- Status tracking:
  - Ready
  - In Progress
  - Complete
  - Failed
- Local OCR worker runs as a separate container
- Supports image and PDF OCR through the same `/ocr` contract

**Rules**
- OCR is inert observational data
- OCR outputs never become authoritative
- No shared filesystem assumptions between API and worker (byte-stream based)

---

### 4.2 Manual OCR Trigger

**Capabilities**
- Explicit “Retrieve OCR text” action per attachment
- User-triggered only
- Fully audited (request / success / failure)

**Rules**
- No automatic OCR on upload
- No background retries
- No silent execution

---

### 4.3 OCR Viewer (Read-Only)

**Capabilities**
- Inline expandable viewer under attachment
- Read-only extracted text
- Copy-to-clipboard
- Clear status indicators (single source of truth, no duplicate badges)

**Rules**
- Viewer never mutates task state
- Viewer does not re-run OCR unless explicitly triggered

---

### 4.4 Explicit OCR Apply Actions

**Capabilities**
- User may explicitly:
  - Add OCR text as a remark
  - Append OCR text to task description
- Confirmation required
- Before/after audit snapshots recorded

**Rules**
- No auto-apply
- No interpretation
- No field extraction

---

### 4.5 OCR Search Participation (Deferred)

OCR-derived text **may** participate in search in a future phase.
This is explicitly deferred until search semantics are stable.

---

## 5. Derived Task Views (UX Clarity)

**Capabilities**
- Derived, read-only task views (e.g. unscheduled lists)
- User-controlled filtering
- No prioritization logic

**Rules**
- No highlighting
- No auto-focus
- No implicit guidance

---

## 6. Structural Task Relationships (Parent–Child)

### Purpose
Enable structured grouping without workflows or automation.

---

### 6.1 Parent–Child Model

**Rules**
- A task may be:
  - Independent
  - Parent
  - Child
- Maximum depth: 2 levels
- No child-of-child

---

### 6.2 Constraints

**Parent Task**
- Cannot be scheduled
- Cannot be closed if any child is open
- Cannot have a parent

**Child Task**
- Can be scheduled independently
- Cannot reopen if parent is closed

---

### 6.3 Association & Disassociation

**Capabilities**
- Convert independent task into parent
- Attach task as child
- Detach child back to independent

**Rules**
- Explicit user action
- Mandatory remark
- Fully audited

---

## 7. External Intake (Explicit Only)

### 7.1 Telegram Intake

**Capabilities**
- Accept images and text via bot
- Store as attachments
- OCR may be triggered explicitly later
- Suggested actions are non-binding and require explicit confirmation

**Rules**
- Telegram is capture-only
- No task mutation
- No scheduling
- No bypassing permissions

**Prerequisites (Out-of-Band Setup)**
- Bot created via Telegram BotFather
- Bot token stored as environment variable / secret
- Webhook/polling configured outside IDE if needed
- Bot does not hold user authority

---

### 7.2 Suggested Actions (Non-Binding)

After OCR or intake, the system may suggest:
- Create task
- Create event
- Attach to existing task
- Do nothing

User must explicitly choose.

---

## 8. Workflow Orchestration (User-Triggered Only)

### Purpose
Support explicit multi-step orchestration **without embedding automation**.

---

### 8.1 Workflow Engine Role

**Characteristics**
- Runs as a separate container (e.g. n8n)
- Acts as a system actor
- Never authenticates users
- Never mutates core state directly

**Application Responsibilities**
- Validate intent
- Apply mutations
- Write audit logs

---

## 9. Live Sensor & Device Integration

### Purpose
Enable real-time visibility into physical-world signals **without allowing live data to mutate state automatically**.

---

### 9.1 Sensor Hardware (ESP8266 / ESP32)

**Capabilities**
- Read onboard or attached sensors
- Publish telemetry at ≥ 6 ticks/sec
- Stateless, reconnect-safe

**Rules**
- Devices never hold authority
- Devices never mutate tasks

---

### 9.2 Sensor Transport (MQTT)

**Capabilities**
- MQTT broker runs as a separate service
- Topic-based device isolation
- Fire-and-forget publishing

**Rules**
- Core application does not subscribe directly
- Transport is not authoritative

---

### 9.3 Ingestion Service (System Actor)

**Capabilities**
- Subscribes to MQTT
- Validates device identity
- Normalizes sensor payloads
- Maintains latest values in memory
- Detects thresholds or conditions

**Rules**
- No direct task mutation
- No scheduling
- No audit ownership

---

### 9.4 Live Dashboard (Read-Only)

**Capabilities**
- Real-time charts and indicators
- Rolling windows (seconds/minutes)
- Device health (online/offline)

**Rules**
- Read-only
- No persistence required
- No audit entries

---

### 9.5 Explicit Snapshot Actions

From the dashboard, users may explicitly:
- Create a task from a snapshot
- Attach snapshot to an existing task
- Trigger workflows manually
- Do nothing

All actions:
- Explicit
- Snapshot-based
- Fully audited

---

## 10. Undo & Correction Semantics

Undo restores **validity**, not history.
No time travel.
No automatic rollback.

---

## 11. Assistive Planning & Intelligence (Advisory)

- Suggestions only
- No execution authority
- No implicit mutation

---

## 12. Collaboration Semantics (Deferred)

- Presence-aware only
- No shared control
- Introduced only after workflows and undo exist

---

## 13. Security & Integrity

- Auth & authorization review
- Device isolation
- Audit log integrity
- Dependency scanning

---

## 14. Permanently Out of Scope

- Background automation
- Implicit execution
- Real-time collaborative editing
- AI-driven auto-mutation
- System acting without explicit user intent

---

## 15. Canonical Invariants

- Explicit > implicit
- Auditability over convenience
- Derived data is never authoritative
- Undo restores validity, not history
- Operational actions are corrected, not undone