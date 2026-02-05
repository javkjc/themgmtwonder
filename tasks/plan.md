<!--
PLAN.MD STRUCTURE TEMPLATE
This file is a reusable template that gets content-swapped per version.

Sections:
- Overview: What we're building (1 paragraph)
- Prerequisites: What must be done first
- Task Groups: Execution breakdown (A, B, C...)
  - Each task group: Objective, Requirements, Files, Verification
- Implementation Order: Sequence dependencies
- Constraints: Governance rules
- Testing Strategy: How to verify
- AI Prompt Template: How to invoke code generation

When generating new plan.md:
1. Copy this structure
2. Paste relevant features.md version section
3. AI generates task breakdown following this template
-->

# PLAN — v8.6 Field-Based Extraction Assignment & Baseline

**Document Version:** 1.0
**Status:** 🚧 IN PROGRESS
**Current Phase:** Field Assignment (Data Model + APIs + Review UI)
**Baseline:** v8.5 Complete (Field Builder) + v8.1 Complete (Extraction Review & Governance)
**As-of:** 2026-02-04

**NEXT TASK:** Task Group B1 — Segments API Projection (first unchecked task after completed A1/A2)

---

## Overview

**What we are building (v8.6):**
A governed, **field-based extraction assignment** system built on an **authoritative Baseline** model. Admins manage a global **Field Library**. Users review an attachment's extraction, assign extracted text to governed fields, and confirm a **single authoritative baseline** per attachment.

**Key Features:**

* **Field Library (Admin-managed):** versioned, status-controlled fields (active/hidden/archived)
* **Baseline Extraction (Authority spine):** draft -> reviewed -> confirmed -> archived, with "one confirmed baseline per attachment"
* **Extracted Text Pool:** readable segments available for assignment (no disappearance)
* **Field Assignment:** one value per field per baseline + validation + correction reasons
* **(Later) ML Suggestions:** optional prefill suggestions via FastAPI microservice
* **(Later) Utilization Locking:** hard lock edits once baseline is used for records/workflows/exports

**What we are NOT building (in v8.6 unless explicitly listed):**

* No auto-execution/background parsing
* No ML training
* No workflow coupling beyond utilization markers
* No batch assignment operations
* No "candidate" concepts exposed in UI (only raw segments + assignments)

**Success Criteria:**

* [ ] Admins can manage governed fields via UI
* [ ] Review page shows baseline badge + reviewed/confirm flow (baseline lifecycle)
* [ ] Review page displays extracted text pool (segments)
* [ ] Users can assign values to governed fields with validation + correction reasons
* [ ] Baseline confirmation locks assignments; system reads only confirmed baselines
* [ ] Utilization blocks editing (later milestone) with backend enforcement + UI projection

---

## Prerequisites (Dependencies Check)

**Required Complete:**

* [x] v8.1 — Extraction Review UI & Governance
* [x] v8.5 — Field Builder infrastructure
* [x] v3 — Attachments + OCR worker baseline
* [x] v1 — Audit logging

**v8.6 Completed (Evidence-backed):**

* [x] **8.6.1** Field Library Data Model  
  Status: ✅ COMPLETE  
  Notes: Schema and migration delivered (tasks/executionnotes.md)
* [x] **8.6.2** Field Library CRUD APIs (Admin-only)
  Status: ✅ COMPLETE
  Notes: Admin-only CRUD endpoints shipped (tasks/executionnotes.md)
* [x] **8.6.3** Field Library UI (`/admin/fields`) + Nav link added
  Status: ✅ COMPLETE
  Notes: Admin page and navigation entry implemented (tasks/executionnotes.md)
* [x] **8.6.4** Baseline Data Model (`extraction_baselines` + partial unique confirmed index)  
  Status: ✅ COMPLETE  
  Notes: Table, enums, and confirmed-only unique index created
* [x] **8.6.5** Baseline State Machine Service (transactional confirm + audit)  
  Status: ✅ COMPLETE  
  Notes: Draft->Reviewed->Confirmed->Archived lifecycle enforced in service
* [x] **8.6.6** Baseline Confirmation UI (Review Page)  
  Status: ✅ COMPLETE  
  Notes: Baseline badge, reviewed/confirm actions, modal, and draft auto-create on load

**Microtasks Completed:**

* [x] Admin nav entry for `/admin/fields`
* [x] Unhide endpoint + UI (hidden -> active) + audit action

---

## v8.6 Implementation Plan

### Task Group A — Baseline Review UX (Projection + Minimal API)

#### Task A1: Baseline Read/Write API (Thin Controller Wrappers)

Status: ✅ COMPLETE
Notes: Endpoints exposed with attachment ownership guard; delegates to service

**Objective:** Expose minimal endpoints required for UI to project baseline status and trigger transitions.

**Files (Backend):**

* `apps/api/src/baseline/baseline.controller.ts` (NEW)
* `apps/api/src/baseline/baseline.module.ts` (wire controller)
* DTOs if needed: `apps/api/src/baseline/dto/*.ts`
* (Auth/ownership reuse only; no new RBAC semantics)

**Requirements:**

1. `GET /attachments/:attachmentId/baseline` -> current baseline (or null)
2. `POST /attachments/:attachmentId/baseline/draft` -> create draft (idempotent behavior preferred)
3. `POST /baselines/:baselineId/review` -> mark reviewed
4. `POST /baselines/:baselineId/confirm` -> confirm baseline (transactional behavior already in service)

**Verification:**

* [ ] Ownership access enforced (same as attachments review access)
* [ ] No lifecycle logic duplicated in controller
* [ ] Audit stays in service layer

---

#### Task A2: Baseline Badge + Reviewed/Confirm Buttons (Review Page)

Status: ✅ COMPLETE
Notes: Badge, reviewed/confirm buttons, confirmation modal, and post-confirm redirect/toast implemented

**Objective:** Project baseline state and allow draft -> reviewed -> confirmed actions with explicit intent.

* `apps/web/app/lib/api/baselines.ts` (NEW)
* `apps/web/app/attachments/[attachmentId]/review/page.tsx`
* Optional: `apps/web/app/components/baseline/BaselineStatusBadge.tsx` (NEW)

**Requirements:**

* Show badge: Draft / Reviewed / Confirmed / Archived
* Button rules:

  * Draft -> "Mark as Reviewed"
  * Reviewed -> "Confirm Baseline" + confirmation modal
  * Confirmed -> "Confirmed ✓" disabled
* On page load:

  * If no baseline exists, create draft explicitly (single call, no polling)

**Verification:**

* [ ] Buttons appear only when valid per baseline status
* [ ] Confirm shows modal explanation before action
* [ ] Redirect/toast after confirm matches existing app patterns

---

### Task Group B Extracted Text Pool (Segments)

#### Task B1: Segments API Projection

**Objective:** Provide review page with extracted text segments (read-only).

**Files (Backend):**

* Prefer reuse: existing endpoints that already serve segments
* If none exists: add minimal read-only endpoint:

  * `GET /attachments/:attachmentId/extracted-text-segments`
* Do not add edit endpoints

**Verification:**

* [ ] Returns segments (text, confidence, boundingBox, id)
* [ ] No coupling to assignments yet

---

#### Task B2: Extracted Text Pool UI (Review Page)

**Objective:** Display segments list (read-only) with confidence indicators.

**Files (Frontend):**

* `apps/web/app/attachments/[attachmentId]/review/page.tsx`
* Optional: `apps/web/app/components/extraction/ExtractedTextPool.tsx` (NEW)

**Requirements:**

* List segments with:

  * truncated text (expand on click)
  * confidence color banding
* No "candidate" UI
* Segments remain visible regardless of assignments

---

### Task Group C — Field Assignment Core

#### Task C1: Assignment Data Model

**Objective:** Add `baseline_field_assignments` table with constraints.

**Files (Backend):**

* Drizzle schema + migration only:

  * `apps/api/src/db/schema.ts` (or `apps/api/src/baseline/schema.ts` if that's your pattern)
  * `apps/api/drizzle/<migration>.sql`

**Requirements:**

* Table per spec:

  * unique(baseline_id, field_key)
  * optional source_segment_id
  * corrected_from + correction_reason fields
* Foreign keys: baselines, field_library, extracted_text_segments, users

---

#### Task C2: FieldAssignmentValidator Service

**Objective:** Validate assigned_value against field_library.character_type + limit.

**Files (Backend):**

* `apps/api/src/baseline/field-assignment-validator.service.ts` (NEW) or similar
* Unit-level validation helpers only (no endpoints)

---

#### Task C3: Field Assignment APIs

**Objective:** Assign/update/remove assignments with governance semantics.

**Files (Backend):**

* `apps/api/src/baseline/assignments.controller.ts` (NEW) **OR** extend baseline.controller (minimal)
* `apps/api/src/baseline/assignments.service.ts` (NEW)

**Endpoints:**

* `POST /baselines/:id/assign`
* `DELETE /baselines/:id/assign/:fieldKey`
* `GET /baselines/:id/assignments`

Rules:

* If updating existing assignment -> requires correction_reason
* Reject edits when baseline is confirmed/archived (and later utilized)

---

#### Task C4: Field Assignment Panel UI (Review Page)

**Objective:** Display active fields and allow manual entry + assignment to baseline.

**Files (Frontend):**

* `apps/web/app/lib/api/assignments.ts` (NEW)
* `apps/web/app/attachments/[attachmentId]/review/page.tsx`
* `apps/web/app/components/extraction/FieldAssignmentPanel.tsx` (NEW)

Rules:

* Pull active fields from `/fields?status=active`
* Show input type based on character_type
* Validate on blur (server-validated; UI just displays errors)

---

### Task Group D — Interaction Enhancements (Drag/Drop + Correction Reasons)

**Blocked by:** Task Group C (Field Assignment Core) must be stable before D begins.

#### Task D1: Drag-and-drop from Segments -> Fields

* Confirmation modal per assignment
* No auto-save

#### Task D2: Correction Reason Modal (mandatory on edit of existing)

* Min chars enforced (frontend + backend)

---

### Task Group E — ML Suggestions (Deferred Until Core Works)

**Blocked by:** Task Group C stable + at least one full assignment round tested end-to-end.

#### Task E1: FastAPI Suggestion Endpoint

#### Task E2: SuggestionApplicationService (NestJS)

#### Task E3: Suggestion Display + Accept/Modify/Clear

(Do not start until Task Group C is stable.)

---

### Task Group F — Utilization Locking (Later in v8.6)

**Blocked by:** Baseline confirmation flow (Task Group A) verified in production + at least one baseline confirmed and utilized.

#### Task F1: markUtilized service wiring

#### Task F2: Backend rejection (403) on edit/delete if utilized

#### Task F3: UI read-only badges/tooltips

---

## Implementation Order

1. **A1 -> A2**: Baseline projection endpoints + review badge/buttons
2. **B1 -> B2**: Segments projection + extracted text pool UI
3. **C1 -> C4**: Assignments DB + validation + APIs + assignment panel UI
4. **D1 -> D2**: drag/drop + correction reasons gating
5. **E***: ML suggestions (after core assignment is stable)
6. **F***: utilization locking (after baseline/assignment flows are correct)

---

## Constraints & Governance

* **Backend Authority:** UI must project state; no lifecycle inference
* **Explicit Intent:** No background mutations; all state changes require user action
* **Auditability:** All baseline transitions + assignment mutations audited
* **Immutability:** Confirmed baseline is read-only; utilization makes it hard-locked
* **No Hidden Coupling:** Field Library status affects availability for *new* assignments only; history remains visible

---

## Testing Strategy

### Manual Test Cases (Minimum)

1. **Baseline Creation**

   * Open review page for attachment without baseline -> draft created
2. **Draft -> Reviewed -> Confirmed**

   * Verify buttons appear correctly and transitions succeed
3. **Segments Display**

   * Verify extracted text pool lists segments with confidence display
4. **Assignments**

   * Assign value to field; update requires correction reason; delete requires reason
5. **Confirmation Lock**

   * After confirmed, assignment inputs disabled and API rejects edits
6. **Regression**

   * Field Library admin page still works (create/hide/unhide/archive)

---

## Notes for AI Code Generation

**Prompt Template:**

```
SYSTEM EXECUTION PROMPT — v8.6 Task X: [Task Name]

Authoritative rules: tasks/plan.md first, backend authoritative, no optimistic updates.
Allowed files: [explicit list]
Objective: [single concern]
Requirements: [acceptance criteria]
Verification: [checklist]
Final step: append tasks/executionnotes.md + short report
```

---






