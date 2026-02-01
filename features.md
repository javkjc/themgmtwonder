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

**What this is**
- Task as the single authoritative unit of work
- Calendar as a derived, non-authoritative view
- Explicit scheduling with full audit coverage

**Status**
✅ Complete

---

## v3 — Task State & Document Intelligence Foundations (Complete)

**What this is**
- Explicit task stages as stable primitives
- Stage-aware remarks and attachments
- Deterministic, user-triggered OCR as derived data
- Raw OCR text and extraction stored immutably as non-authoritative outputs

**Status**
✅ Complete

---

## v4 — Structural Task Relationships (Parent / Child) (Complete)

**What this is**
- Structural grouping without workflows or automation
- Hard constraints enforced at the data model level
- Read-only visibility of relationships

**Status**
✅ Complete

---

## v5 — Workflow Foundations (Backend Only) (Complete)

**What this is**
- Inert workflow definitions and execution records
- Explicit, auditable workflow start and step actions
- No UI, no automation, no task coupling

**Status**
✅ Complete

---

## v6 — Workflow Management (Admin UI) (Complete)

**What this is**
- Admin-only workflow authoring and versioning
- Definition-first, non-executing flow builder
- Validation, dry-run preview, reusable governed elements

**Status**
✅ Complete

---

## v7 — Workflow Participation (Minimal User Operations) (Planned)

**What this is**
- User inbox for pending workflow steps
- Explicit approve / reject / acknowledge actions
- Full execution trace visibility with audit integrity

**Design Intent**
This version is intentionally **thin**.  
It establishes the **minimum operational floor** required for downstream reasoning and governance layers.

---

## v8 — Evidence Review & Derived Data Verification (Visual) (Planned)

**What this is**
- Visual, side-by-side inspection of source documents and extracted OCR data
- Field-to-source linkage via highlights / bounding boxes
- Per-field confidence indicators and unresolved-field tracking
- Explicit user-corrected extraction revisions with full audit trail
- Preservation of original OCR output and prior revisions

**What this is not**
- No authoritative data mutation
- No automatic correction or learning
- No workflow coupling

**Design Intent**
Derived data must be **inspectable, explainable, and correctable by humans**  
*before* it is used to explain reality, simulate outcomes, or advise decisions.

---

## v9 — Reality View: Relationship & Obligation Graph (Read-Only) (Planned)

**What this is**
- Derived visual graph of real-world entities, obligations, and relationships
- Explanation of blocking conditions, dependencies, and current status
- Traceability back to evidence, workflows, and source records
- Zero execution or mutation authority

**Design Intent**
Humans should be able to **see reality** before they are given correction power.

---

## v10 — Graph-Governed Editing (Explicit Mutation) (Planned)

**What this is**
- Explicit, audited edits initiated from graph inspectors
- Writes to existing authoritative domain tables only
- Strong validation and confirmation requirements
- No automation, no implicit side effects

**Design Intent**
Introduce **correction power** only after reality is visible and understandable.

---

## v11 — Drafts & Simulation (What-If Reasoning) (Planned)

**What this is**
- Draft graphs fully detached from authoritative data
- Simulation of outcomes (cashflow, dependencies, impact)
- Visual comparison between draft and authoritative reality
- Explicit commit converts draft → authoritative records

**Design Intent**
Enable **thinking before acting** without contaminating reality.

---

## v12 — Undo & Correction Semantics (Planned)

**What this is**
- Undo restores system validity, not historical state
- Corrections are explicit, forward-moving, and auditable
- No silent rollback or time travel

**Design Intent**
Provide safety guarantees **after** correction power exists.

---

## v13 — Assistive Planning & Intelligence (Advisory Only) (Planned)

**What this is**
- Advisory insights over authoritative and draft graphs
- Risk indicators, prioritisation, and recommendations
- All outputs are derived, explainable, and non-executing
- Human remains the decision-maker

**Design Intent**
Intelligence is earned **after** governance, visibility, and correction are solid.

---

## v14 — External Channels & Integrations (Planned)

**What this is**
- External capture surfaces (Telegram, email, API, mobile)
- Capture-only by default
- Optional explicit handoff into governed workflows

**Design Intent**
Integrations are **surfaces**, not core capabilities.

---

## v15 — Collaboration Semantics (Planned)

**What this is**
- Presence-aware visibility and shared context
- No shared mutation authority
- Governance remains admin-defined

**Design Intent**
Collaboration is a **multiplier**, not a foundation.

---

## Canonical Invariants (Stable)

- Explicit > implicit
- Auditability over convenience
- Derived data is never authoritative
- Undo restores validity, not history
- Operational actions are corrected, not undone
