# FEATURES — Product Capabilities & Versioned Pipeline

This document defines **what the product is designed to support**, not execution order.

Execution is governed by:
- **tasks/plan.md** — single source of truth for implementation
- **tasks/executionnotes.md** — append-only evidence of work performed

All features below preserve the following **non-negotiable invariants**:

- Explicit user intent is required for all state mutation 
- Auditability-first (before/after snapshots where applicable)
- No background automation
- No implicit execution
- Derived data is never authoritative
- Backend remains the source of truth

---

## Status Legend
- ✅ **Complete**: Fully implemented and verified
- 🚧 **In Progress**: Currently being built
- 📋 **Re-baselined**: Aspirational vision, not ready to implement
- ❌ **Superseded**: Replaced by newer version

---

## v1 — Core Task Management ✅ (Complete)

**What this is**
- CRUD operations for personal tasks with title, description, status, category, pin, duration
- Remarks system for task annotations
- Audit logging for all mutations
- Basic auth-protected task views

**What this is not**
- No calendar scheduling UI or drag/drop views (that's v2)
- No attachments or OCR (that's v3)
- No workflows (that's v5-v7)

**Design Intent**
Task as the single authoritative unit of work.

**Dependencies**
- **NO DEPENDENCIES** (foundational)

**What Was Built**

**Database Schema:**
- `users`: id, email, passwordHash, mustChangePassword, role, isAdmin, failedLoginAttempts, lockUntil, createdAt
- `todos`: id, userId, title, description, done, createdAt, updatedAt, category, isPinned, durationMin, startAt, unscheduledAt, stageKey, parentId (nullable, used in v4), start/duration nullable
- `remarks`: id, todoId, userId, content, createdAt, stageKeyAtCreation
- `audit_logs`: id, userId, actorType, action, module, resourceType, resourceId, details, ipAddress, userAgent, createdAt

**Backend Services:**
- `apps/api/src/todos/todos.service.ts`: Task CRUD, search, bulk updates, stage changes, audit deltas
- `apps/api/src/remarks/remarks.service.ts`: Add/list/delete remarks tied to a task
- `apps/api/src/audit/audit.service.ts`: Records audit entries for all task/remark mutations

**API Endpoints:**
- `POST /todos`: Create task
- `GET /todos`: List tasks with filters
- `GET /todos/:id`: Get task detail
- `PATCH /todos/:id`: Update task
- `DELETE /todos/:id`: Delete task
- `POST /todos/bulk/done|category|delete`: Bulk operations
- `GET /remarks/todo/:todoId`: List remarks for task
- `POST /remarks/todo/:todoId`: Add remark
- `DELETE /remarks/:id`: Delete remark

**Frontend Components:**
- `apps/web/app/page.tsx`: Authenticated task list with filters, bulk actions, create/update/delete/pin/duration edits
- `apps/web/app/task/[id]/page.tsx`: Task detail with remarks, stage changes, history, audit timeline

**Governance Alignment**
- **Explicit Intent:** All mutations flow through guarded REST endpoints with CSRF + JWT; UI requires explicit clicks and confirmations
- **Auditability:** `audit_logs` table captures action, module, resource plus before/after deltas; timestamps on todos and remarks

**Status**
✅ Complete

---

## v2 — Calendar View ✅ (Complete)

**What this is**
- Calendar-based scheduling with visual time allocation
- Drag-and-drop between unscheduled list and calendar
- Resizing events to change duration
- Conflict detection and unschedule support

**What this is not**
- No workflow ties or parent/child constraints beyond schedule exclusion rules
- No recurring events or calendar sync

**Design Intent**
Provide a visual time allocation view derived from existing tasks.

**Dependencies**
- **REQUIRES:** v1 (Core Task Management)

**What Was Built**

**Database Schema:**
- `todos`: Uses existing `startAt`, `durationMin`, `unscheduledAt` fields
- Added indexes: `todos_user_start_at_idx` for calendar queries
- `user_settings` and `system_settings`: Working hours/days, duration bounds for scheduling UI hints

**Backend Services:**
- `apps/api/src/todos/todos.service.ts`: 
  - EXTENDED: Schedule/unschedule with overlap checks
  - NEW: `recentlyUnscheduled()` method
  - NEW: List filters by scheduled windows

**API Endpoints:**
- `PATCH /todos/:id/schedule`: Schedule/unschedule with conflict detection
- `GET /todos?scheduledAfter&scheduledBefore`: Windowed fetch for calendar view
- `GET /todos/recently-unscheduled`: Recently unscheduled tasks

**Frontend Components:**
- `apps/web/app/calendar/page.tsx`: Drag/drop calendar, resize handles, unscheduled panel, schedule modal, create-on-slot
- Shared components: `ScheduleModal`, `DragContext`, `DraggableTask`, `DroppableZone`, `useScheduledEvents`

**Governance Alignment**
- **Explicit Intent:** Scheduling initiated by explicit drag/drop or modal actions; conflict responses surfaced to user for decision
- **Auditability:** Schedule/unschedule actions logged via audit service with before/after `startAt` and `durationMin` values

**Status**
✅ Complete

---

## v3 — Task State & Document Intelligence Foundations ✅ (Complete)

**What this is**
- File attachments on tasks with duplicate-name protection and 20MB limit
- OCR worker integration to extract text from attachments
- Apply OCR results to remarks or task descriptions
- Stage-aware attachment tracking

**What this is not**
- No full-text search across OCR outputs
- No multi-file workflows or batch OCR processing
- No automatic OCR triggering (user-initiated only)

**Design Intent**
Capture supporting documents and convert them into actionable text inside tasks. Deterministic, user-triggered OCR as derived data.

**Dependencies**
- **REQUIRES:** v1 (Core Task Management)
- **REQUIRES:** v2 (Calendar View - for stage awareness)

**What Was Built**

**Database Schema:**
- `attachments`: id, todoId, userId, filename, storedFilename, mimeType, size, createdAt, stageKeyAtCreation
- `attachment_ocr_outputs`: id, attachmentId, extractedText, metadata, status, createdAt

**Backend Services:**
- `apps/api/src/attachments/attachments.service.ts`: 
  - Upload/download/delete with duplicate filename guard
  - Stage capture on upload (records current task stage)
- `apps/api/src/ocr/ocr.service.ts`: 
  - Call external OCR worker
  - Store derived output as non-authoritative data
  - Enforce ownership checks

**API Endpoints:**
- `GET /attachments/todo/:todoId`: List attachments for task
- `POST /attachments/todo/:todoId`: Upload attachment
- `GET /attachments/:id/download`: Download attachment
- `DELETE /attachments/:id`: Delete attachment
- `GET /attachments/:id/ocr`: Get OCR results
- `POST /attachments/:id/ocr`: Trigger OCR worker
- `POST /attachments/:id/ocr/apply`: Apply OCR text to remark or description

**Frontend Components:**
- `apps/web/app/task/[id]/page.tsx`: 
  - Attachment uploader with drag state
  - OCR trigger button per attachment
  - OCR results viewer
  - Apply-to-remark/description actions with preview

**Governance Alignment**
- **Explicit Intent:** Uploads and OCR requests initiated per attachment; applying OCR requires explicit target selection and remark length validation
- **Auditability:** `attachment.upload`, `attachment.delete`, `OCR_REQUESTED`, `OCR_SUCCEEDED`, `OCR_FAILED` events logged; remark/description deltas recorded via audit service

**Status**
✅ Complete

---


## v3.5 — OCR Retrieval & Confirmation Flow ✅ (Complete)

**What this is**
- OCR draft/confirm workflow (OCR suggests → user reviews → confirms → immutable)
- Utilization tracking (Categories A/B/C: authoritative records, workflows, exports)
- Redo rules based on utilization type
- Option-C archive (hard archive for externalized data)

**What this is not**
- Not correction history with versioning
- Not automatic OCR suggestions
- Not workflow-coupled (Category B utilization deferred to post-v9)

**Dependencies**
- **REQUIRES:** v3 (existing OCR infrastructure)
- **MODIFIES:** v3 database schema and services (see below)

**Modifications to v3:**
1. **`attachment_ocr_outputs` table - EXTEND:**
   - ADD: `status` enum: 'draft' | 'confirmed' | 'archived'
   - ADD: `confirmedAt` timestamp
   - ADD: `utilizedAt` timestamp
   - ADD: `utilizationType` enum: null | 'authoritative_record' | 'workflow_approval' | 'data_export'
   - ADD: `utilizationMetadata` JSON (what record, what export, etc.)

2. **OCR Service - MODIFY:**
   - Trigger OCR → creates `status='draft'`
   - New endpoint: `POST /attachments/:id/ocr/confirm` → sets `status='confirmed'`
   - New endpoint: `POST /attachments/:id/ocr/archive` → sets `status='archived'`
   - Redo validation: check utilization type before allowing new draft

3. **Apply OCR Logic - MODIFY:**
   - Can only apply from `status='confirmed'` OCR results
   - Draft OCR not readable by apply/export functions

**Redo Rules:**
- Category A (authoritative record created): ❌ Never
- Category B (workflow approval): ❌ Never (deferred to v9 integration)
- Category C (data export): ⚠️ Only after Option-C archive
- Non-utilization (viewing, drafts, UI preview): ✅ Always allowed

  **Status**
  ✅ Complete

--- 

## v4 — Structural Task Relationships (Parent / Child) ✅ (Complete)

**What this is**
- Parent-child task links with maximum depth of 2 levels
- Deletion and scheduling safeguards (cannot delete parent with children)
- Visibility of parent/child relationships
- Explicit associate/disassociate actions with remark requirements

**What this is not**
- No cross-user linking (parent and children must belong to same user)
- No recursive hierarchies beyond one level
- No automatic child task generation (that's v11)

**Design Intent**
Enable decomposition of work while preventing conflicting lifecycle states.

**Dependencies**
- **REQUIRES:** v1 (Core Task Management)
- **REQUIRES:** v2 (Calendar View - for scheduling constraints)
- **REQUIRES:** v3 (Document Intelligence - for stage awareness)

**What Was Built**

**Database Schema:**
- `todos.parentId`: Foreign key to todos.id (nullable)
- Added index: `todos_parent_id_idx`
- Hard constraints enforced at data model level:
  - Cannot delete parent with children
  - Cannot set parent status=completed if children incomplete
  - Parent tasks blocked from scheduling

**Backend Services:**
- `apps/api/src/todos/todos.service.ts`:
  - EXTENDED: Parent validation on task operations
  - NEW: `associate()` method (set parent with validation)
  - NEW: `disassociate()` method (remove parent with checks)
  - NEW: Close/open rules enforcement
  - NEW: Child count enrichment in task queries

**API Endpoints:**
- `GET /todos/:id/children`: List child tasks
- `GET /todos/:id/parent`: Get parent task
- `POST /todos/:id/associate`: Set parent (requires remark)
- `POST /todos/:id/disassociate`: Remove parent (requires remark)

**Frontend Components:**
- `apps/web/app/task/[id]/page.tsx`:
  - Parent/child relationship panels
  - "Set Parent" modal with eligible parent lookup and required remark
  - "Remove Parent" modal with required remark
  - Visual indicators for parent/child status
- `apps/web/app/calendar/page.tsx`:
  - Filters out parent tasks from scheduling (cannot schedule parents)
  - Unschedule zone respects child restrictions

**Governance Alignment**
- **Explicit Intent:** Association/disassociation require explicit remark input; scheduling blocked for parents at service layer
- **Auditability:** `associate`, `disassociate`, and parent-blocked schedule attempts logged with before/after `parentId` values and required remarks

**Status**
✅ Complete

---

## v5 � Workflow Foundations (Temporal-Backed Runtime Bridge) 📋 (Not started)

> **Note:** This is an aspirational vision. Infrastructure not yet implemented.

**What this is**
- Durable workflow definition store (JSON, versioned, immutable once published)
- Trigger + payload capture that starts Temporal orchestrator workflows
- Runtime projection tables that mirror Temporal execution state for the UI
- Approval signal plumbing (backend ? Temporal) with full audit trail

**What this is not**
- No user-authored code or expressions in definitions
- No direct UI ? Temporal calls (backend is the only bridge)
- Not a visual builder (that�s v10); not a generic DAG runner (the interpreter lives in v9)

**Design Intent**
Make workflow definitions governable data, and route all execution to Temporal for durability while keeping business/audit state in Postgres.

**Dependencies**
- **REQUIRES:** v1 (Core Task Management - audit/logging)
- **REQUIRES:** v2 (Calendar View)
- **REQUIRES:** v3 (Document Intelligence)
- **REQUIRES:** v4 (Parent/Child relationships)

**What Was Defined**

**Database Schema (reframed):**
- `workflow_definitions`: id, name, version, status (draft/published), nodeGraph (JSON), inputSchema (JSON), publishedAt, publishedBy, workflowGroupId
- `workflow_versions`: immutable snapshot rows for each publish
- `workflow_instances`: id, workflowVersionId, triggerType, triggerPayload, temporalWorkflowId, status (running/waiting/completed/failed), currentNodeRef, startedAt, completedAt, lastHeartbeatAt
- `workflow_instance_events`: ordered log of state changes surfaced from Temporal (node started/completed, signal received, timer awaited, approval outcome)

**Backend Services:**
- `WorkflowDefinitionService`: drafts, publish (locks version), node registry validation (Zod)
- `WorkflowRuntimeService`: trigger matching, `startInstance(definitionVersionId, triggerPayload)`, map Temporal workflow IDs, persist projections
- `WorkflowSignalService`: `sendApproval(instanceId, nodeRef, decision, remark)` ? Temporal signal
- `WorkflowStateProjector`: consumes Temporal updates (task queue/webhook) and writes `workflow_instances` + `workflow_instance_events`

**API Endpoints:**
- `POST /workflows`: create draft definition
- `POST /workflows/:id/publish`: publish immutable version (enables triggers)
- `POST /workflows/:versionId/start` (manual start for testing)
- `GET /workflows/instances/:id`: UI-friendly instance state (joined with projection tables)
- `POST /workflows/instances/:id/approvals`: Approve/Reject a waiting Approval node (backend sends Temporal signal)

**Frontend Components:**
- None (runtime bridge only; UI arrives in v6/v7/v10)

**Governance Alignment**
- **Explicit Intent:** Publish required before execution; triggers are explicitly bound to versions; approvals require remark and are audited.
- **Auditability:** Definition publish, trigger start, signal sends, and each Temporal-emitted event are recorded in `workflow_instance_events`.

**Status**
Re-baselined to Temporal-backed runtime (replaces prior inert model).

---

## v6 � Workflow Management (Admin UI) 📋 (Not started)

> **Note:** This is an aspirational vision. Infrastructure not yet implemented.

**What this is**
- Admin authoring UI backed by Node Registry (allowed node types + Zod schemas)
- Draft ? Publish ? Immutable lifecycle; publish makes versions triggerable
- Node template library (pre-configured nodes) instead of arbitrary scripts
- Version list with governance controls (who published, when, checksum)

**What this is not**
- End-user participation UI (that�s v7)
- Any scripting/expressions/custom code blocks
- Visual canvas editor (that�s v10)

**Design Intent**
Provide a governed, schema-validated way to author workflows that are safe to hand to Temporal without exposing Temporal to users.

**Dependencies**
- **REQUIRES:** v1 (Core Task Management)
- **REQUIRES:** v2 (Calendar View)
- **REQUIRES:** v3 (Document Intelligence)
- **REQUIRES:** v4 (Parent/Child relationships)
- **REQUIRES:** v5 (Temporal-backed foundations)

**What Was Built**

**Database Schema:**
- `workflow_definitions` / `workflow_versions` (from v5) enforce `status in (draft,published)` and immutability after publish.
- `node_registry` (logical table/config): allowed node types, config schema (Zod), defaults, UI form metadata.
- `workflow_node_templates`: id, nodeType, defaultConfig, displayLabel, registryVersion, isDeprecated.

**Backend Services:**
- `WorkflowAuthoringService`: draft CRUD, publish (locks version, computes hash), register templates.
- `NodeRegistryService`: serves schemas to UI, validates drafts before publish.
- `VersionCatalogService`: list versions per workflowGroupId, show publish metadata, diff hashes.

**API Endpoints:**
- `GET /workflow-node-registry`: registry payload for builder (node types + schemas)
- `POST /workflows`: create draft; `PUT /workflows/:id`: update draft (blocked if published)
- `POST /workflows/:id/publish`: publish immutable version (sets triggerable flag)
- `GET /workflows/:id/versions`: list versions + hash + publisher
- `GET /workflows/node-templates`: list templates; CRUD endpoints for templates (admin only)

**Frontend Components:**
- `apps/web/app/workflows/page.tsx`: list workflows with active version + publish metadata
- `apps/web/app/workflows/[id]/edit/page.tsx`: draft editor (form-driven, registry-backed)
- `apps/web/app/workflows/templates/page.tsx`: node template library (drag-to-use in v10)

**Governance Alignment**
- **Explicit Intent:** Publish action is explicit and records checksum + publisher; drafts cannot run.
- **Auditability:** Authoring actions logged (`workflow.publish`, `workflow.template.create`, etc.) with before/after and registry version used.

**Status**
Re-baselined; UI remains but semantics now bind to Temporal-backed runtime.

---

## v7 � Workflow Participation (Temporal Signals UI) 📋 (Not Started)

> **Note:** This is an aspirational vision. Infrastructure not yet implemented.

**What this is**
- User inbox driven by Temporal runtime projection (waiting Approval nodes)
- Execution detail derived from `workflow_instance_events` (Temporal-sourced)
- Approve/Reject actions call backend, which sends Temporal signals
- Audit-first view of long-running instances (safe for days/months)

**What this is not**
- Users do not interact with Temporal directly
- No ad-hoc scripting or step overrides (those are governed in v13/v15)
- Not a builder/editor (that�s v10)

**Design Intent**
Surface Temporal runtime state to end-users in a governed, signal-only UI while keeping deterministic execution in workers.

**Dependencies**
- **REQUIRES:** v5 (Temporal-backed foundations)
- **REQUIRES:** v6 (Workflow Management)

**What Was Built**

**Database Schema:**
- Uses `workflow_instances` + `workflow_instance_events` (from v5 projection) instead of per-step tables.
- `workflow_approvals_inbox` view/materialized view: pending approval nodes for a user/role, derived from projections.

**Backend Services:**
- `WorkflowInboxService`: `getMyPendingApprovals(userId)` from projection tables.
- `WorkflowInstanceQuery`: returns timeline assembled from `workflow_instance_events` (node started/completed, signal awaited/received).
- `WorkflowApprovalService`: validates assignment, requires remark, sends Temporal signal, records audit event.

**API Endpoints:**
- `GET /workflow-inbox`: pending approvals for current user
- `GET /workflows/instances/:id/timeline`: ordered event/timeline view
- `POST /workflows/instances/:id/approvals`: Approve/Reject waiting node (remark required)

**Frontend Components:**
- `apps/web/app/workflows/inbox/page.tsx`: inbox fed by projection view; shows "waiting since" (Temporal timers safe)
- `apps/web/app/workflows/instances/[id]/page.tsx`: timeline + current node card; approval form with remark

**Governance Alignment**
- **Explicit Intent:** Only approvals exposed; no arbitrary mutations. Remarks required. Assignment and role checks enforced server-side.
- **Auditability:** Each approval emits Temporal signal and logs to `workflow_instance_events` + AuditService.

**Known Limitations**
- Access control to execution detail by resource owner is still to-be-tightened; documented for follow-up.

**Status**
Re-baselined to Temporal-signal participation; replaces prior step-action model.

---

## v8.1 — Additional Features ✅ (Completed)
Status: Completed
TASK GROUP A: Core State Machine (Blockers)
Task A1: Add Extraction State to UI
Priority: CRITICAL - Blocks all other work
Estimated Effort: Small
Dependencies: None
Changes needed:

Frontend must query getCurrentConfirmedOcr() to check if confirmed extraction exists
Frontend must query checkRedoEligibility() before showing "Retrieve" button
Button states:

"Retrieve Data" (no confirmed extraction exists)
"Redo Retrieval" (confirmed exists + redo allowed)
Disabled + tooltip (confirmed exists + redo blocked)



Files to modify:

Task detail page where OCR trigger button lives
Add loading state for eligibility check


Task A2: Block Concurrent Retrieval
Priority: HIGH
Estimated Effort: Small
Dependencies: A1
Changes needed:

Frontend: Disable retrieve button while processingStatus = 'pending'
Backend already has this via attachment_ocr_outputs.processingStatus
Just need UI to respect it

Files to modify:

Task detail page OCR button
Add check for existing pending OCR


Task A3: Enforce Redo Rules in UI
Priority: HIGH
Estimated Effort: Medium
Dependencies: A1
Changes needed:

Call GET /attachments/:id/ocr/redo-eligibility before allowing retrieve
Show tooltip explaining why redo is blocked:

"Authoritative record created from this data"
"Data has been exported - must archive first"
"Workflow approval committed"


Add "Archive & Redo" workflow for Category C

Files to modify:

Task detail OCR section
New tooltip component explaining utilization


TASK GROUP B: Review Page Semantics
Task B1: Rename & Reframe Review Page
Priority: MEDIUM
Estimated Effort: Small
Dependencies: None (can be done in parallel)
Changes needed:

Page title: "OCR Review" → "Extracted Data Review"
Section headers: "OCR Fields" → "Extracted Fields"
Help text: Explain this is reviewing extraction, not the document itself
Add state badge: "Draft" / "Confirmed" / "Archived"

Files to modify:

/attachments/[id]/review/page.tsx (or wherever review page is)
Update all copy to use "extraction" not "OCR"


Task B2: Show Extraction Provenance
Priority: MEDIUM
Estimated Effort: Medium
Dependencies: B1
Changes needed:

For each field, show:

Original extracted value (grayed out if corrected)
Current value (highlighted if corrected)
"Extracted via: OCR" badge
Correction history link (if corrections exist)


Distinguish original vs corrected visually

Files to modify:

OcrFieldList component
Add "original value" display above current value
Add strikethrough style for corrected originals


Task B3: Handle Empty/Failed Extraction
Priority: HIGH
Estimated Effort: Small
Dependencies: None
Changes needed:

If parsedFields.length === 0: Show "No fields extracted"
If PDF preview fails: Show error + download link
If OCR confidence universally low: Show warning banner
Don't fail silently

Files to modify:

Review page error states
Add empty state UI


TASK GROUP C: Editing Governance
Task C1: Block Editing on Utilized Extraction
Priority: CRITICAL
Estimated Effort: Medium
Dependencies: Backend already tracks utilization
Changes needed:

Check attachment_ocr_outputs.utilization_type before showing edit button
If utilized: Hide edit button, show "Read-only (data in use)" badge
Add tooltip explaining why: "Authoritative record created" / "Data exported" / "Workflow approved"

Files to modify:

OcrFieldList component
Add utilization check in field render


Task C2: Require Correction Reason for Edits
Priority: HIGH
Estimated Effort: Small
Dependencies: C1
Changes needed:

OcrFieldEditModal must have mandatory "Reason for correction" textarea
Cannot save without reason (client + server validation)
Reason shown in correction history

Files to modify:

OcrFieldEditModal component
Make correctionReason required (not optional)
Update DTO validation on backend


Task C3: Show Draft vs Confirmed State Clearly
Priority: HIGH
Estimated Effort: Small
Dependencies: None
Changes needed:

Review page must show banner at top:

Draft: Yellow banner "This is a draft extraction. Confirm to make it the baseline."
Confirmed: Green banner "This is the confirmed baseline extraction."
Archived: Gray banner "This extraction is archived (view only)."


Hide confirm button if already confirmed

Files to modify:

Review page header
Add state banner component


TASK GROUP D: Confirmation Semantics
Task D1: Add Confirmation Explanation Modal
Priority: MEDIUM
Estimated Effort: Small
Dependencies: None
Changes needed:

Before confirm, show modal:

"Confirming will:"
"✓ Lock this data as the baseline"
"✓ Make it available for use in tasks/exports/workflows"
"✗ Cannot be edited after utilization"
"Are you sure?"


Require explicit "Yes, Confirm" click

Files to modify:

Review page confirm button
Add confirmation modal component


Task D2: Block Confirm Button on Draft After Utilization
Priority: LOW (edge case)
Estimated Effort: Small
Dependencies: Backend already prevents this
Changes needed:

If somehow user has draft + confirmed exists: Hide confirm button
Show message: "A confirmed extraction already exists for this attachment"

Files to modify:

Review page logic
Check for existing confirmed before showing confirm


TASK GROUP E: Terminology Cleanup
Task E1: Decouple "OCR" from "Extraction" in Code
Priority: LOW (refactor)
Estimated Effort: Large (but safe)
Dependencies: All other tasks complete
Changes needed:

Rename internally:

ocrResults → extractionFields (or keep as is, just document)
ocrCorrections → extractionCorrections (or keep)
Services can stay named OCR (implementation detail)


Update all UI copy to say "extraction" not "OCR"
Backend schema can stay as-is (breaking change not worth it)

Files to modify:

All frontend components
User-facing text only
Backend stays unchanged (API contract)


Recommended Implementation Order
Phase 1: Critical Blockers (Week 1)

Task A1: Add Extraction State to UI
Task A2: Block Concurrent Retrieval
Task C1: Block Editing on Utilized Extraction
Task B3: Handle Empty/Failed Extraction

Phase 2: Governance (Week 2)
5. Task A3: Enforce Redo Rules in UI
6. Task C2: Require Correction Reason
7. Task C3: Show Draft vs Confirmed State
8. Task D1: Add Confirmation Explanation Modal
Phase 3: Polish (Week 3)
9. Task B1: Rename & Reframe Review Page
10. Task B2: Show Extraction Provenance
11. Task D2: Block Confirm on Existing Confirmed
Phase 4: Refactor (Optional)
12. Task E1: Decouple "OCR" from "Extraction" (if desired)

Conflict Analysis with v3.5/v8
No conflicts found - These tasks extend existing work:

✅ v3.5 provides the state machine (draft/confirmed/archived)
✅ v3.5 provides utilization tracking
✅ v3.5 provides redo eligibility checks
✅ v8 Tasks 1-4 provide the backend services
✅ These tasks build UI on top of that foundation

Key insight: The backend is correct, the frontend just needs to respect it.


---

## v8.5 — Field Builder (Structured Extraction Authoring) ✅ (Complete)

**Status:** ✅ Complete

---

  Architecture Context (from codemapcc.md)

  **Frontend:**
  - Review Page: `apps/web/app/attachments/[attachmentId]/review/page.tsx`
  - Components: `OcrFieldList`, `OcrFieldEditModal` (existing correction UI)
  - API client: `apps/web/app/lib/api/ocr.ts`

  **Backend:**
  - Controllers: `apps/api/src/ocr/ocr.controller.ts` (corrections)
  - Services: `apps/api/src/ocr/ocr-corrections.service.ts`, `apps/api/src/ocr/ocr-parsing.service.ts`
  - DTOs: `apps/api/src/ocr/dto/create-ocr-correction.dto.ts`

  **Database:**
  - Tables: `ocr_results` (parsed fields), `ocr_corrections` (user edits), `attachment_ocr_outputs` (status/lifecycle)
  - Relevant columns: `status` (draft/confirmed/archived), `utilizationType` (lockout trigger)

  ---

  Prerequisites

  Before v8.5 can start:
  - ✅ v8.1 OCR extraction complete (attachment_ocr_outputs table exists)
  - ✅ v8.2 OCR confirmation flow complete (draft → confirmed states work)
  - ✅ C1 utilization lockout implemented (utilizationType enforcement)
  - ✅ C2 correction reason requirement implemented (mandatory reason for edits)
  - ✅ Review Page exists at `/attachments/[id]/review` with viewer + field list
  - ✅ Backend correction API accepts new fields (or can be extended)

  ---

  Constraints

  - ❌ No workflow orchestration (that's v9)
  - ❌ No changes to OCR engine or worker
  - ❌ No automatic field inference without user action
  - ❌ No table/line-item extraction (out of scope for v8.5)
  - ✅ Must work with existing OCR lifecycle (draft → confirmed → archived)
  - ✅ Must reuse existing correction audit trail mechanism if possible
  - ✅ All mutations require explicit user action + reason

  ---

  Task Dependencies

  Suggested execution order:
  1. **8.5.1** (UI layout) → establishes panel structure
  2. **8.5.2** (governance gates) → prevents accidental edits
  3. **8.5.3** (manual add) → core capability
  4. **8.5.4** (text selection) → builds on manual add
  5. **8.5.5** (templates) → pure UI convenience (can be parallel with 8.5.4)
  6. **8.5.6** (normalization helpers) → final polish

  ---

  Verification Guidance

  Each task checkpoint should verify:
  - **Manual testing**: Specific user flows (e.g., "create field, confirm extraction, verify lockout")
  - **DB queries**: Confirm audit records exist in `ocr_corrections` table
  - **Status checks**: Verify status-based behavior (draft editable, confirmed read-only)
  - **Edge cases**: Empty fields, long values, special characters

  ---


  Overview

  A governed Field Builder integrated into the Extracted Data Review page that allows users to convert raw extracted text into structured fields (key/value pairs) through explicit, auditable actions. It supports scenarios where parsing yields zero or low-quality fields by enabling manual field creation from the extracted text.

  ---

  What This Is

  - **Manual field authoring**: User-driven conversion of raw text into structured fields
  - **Governed mutations**: All field additions/edits require explicit user action + reason
  - **Draft lifecycle integration**: Works within existing draft → confirmed → utilized states
  - **Audit-first**: Every field creation/edit produces complete audit evidence
  - **Empty-state support**: Handles "no fields extracted" scenarios gracefully

  ---

  What This Is NOT

  - ❌ No automatic background extraction or auto-field creation
  - ❌ No learning, model fine-tuning, or AI inference
  - ❌ No authoritative record creation (remains derived data)
  - ❌ No silent overwrites of existing fields (all edits are explicit + audited)
  - ❌ No table/line-item intelligence (unless added as separate sub-feature)

  ---

   Design Intent

  When parsing yields zero or low-quality fields, users need a way to convert evidence into usable structured data while preserving:

  - **Explicit intent**: No silent mutations
  - **Auditability**: Complete before/after trails
  - **Backend authority**: Server validates and stores
  - **Lifecycle compliance**: Respects draft → confirm → utilize states

  ---

  Core UX: How Field Builder Works

  Review Page Layout

  **Existing components:**
  - Document viewer (PDF/image)
  - Extracted fields list

  **New addition:**
  - **Field Builder panel** (toggleable)

  **Three sections:**
  1. **Raw Extracted Text** (read-only display)
  2. **Field Builder** (authoring tools)
  3. **Extracted Fields** (current working set with corrections)

  Primary User Flow

  1. User opens Review Page
  2. **If fields exist**: User can refine/add fields via Field Builder
  3. **If fields are empty**: User creates fields manually from extracted text
  4. User confirms extraction (existing confirm semantics)
  5. **After utilization**: Field Builder becomes read-only (C1 lockout)

  ---

  Capabilities

  Capability A — Add Field (Manual)

  **What it does:**
  User creates a new field by providing:
  - Field name (required)
  - Field value (required)  
  - Optional field type: text | number | date | currency (UI validation only)
  - Mandatory reason (reuses C2 correction requirement)

  **Rules:**
  - Creating a field is treated as a correction-style mutation (requires reason)
  - No auto-save; explicit "Add Field" button click required
  - Audit trail captures: fieldKey, value, reason, timestamp, actor

  ---

  Capability B — Create Field from Text Selection

  **What it does:**
  User selects text in "Raw Extracted Text" panel and clicks:
  - **"Use Selection as Value"** → prompts for field name (manual entry or from suggestions)

  **Optional enhancement:**
  - **"Use Selection as Label"** (e.g., user highlights "Total")
  - **"Use Selection as Value"** (e.g., user highlights "$123.45")

  **Rules:**
  - Selection does NOT mutate anything until user clicks "Create Field"
  - Field creation requires a reason
  - Cancel action discards selection without changes

  ---

  Capability C — Suggested Field Templates

  **What it does:**
  Provides quick-add templates for common fields (pure UI convenience):
  - **Invoice/receipt fields**: Vendor, Date, Total, Tax, Subtotal, Currency, Invoice No
  - **Document fields**: Reference No, Subject, Amount, Notes

  **Rules:**
  - Templates only pre-fill **field names** (no value inference)
  - User must manually enter values
  - Choosing a template does not mutate fields until user confirms creation
  - Final creation still requires a reason

  ---

  Capability D — Normalization Helpers (UI-only)

  **What it does:**
  Small assistive actions that preview changes before applying:
  - Trim whitespace
  - Normalize currency format (e.g., remove commas)
  - Date parse preview (e.g., "interprets as 2025-02-05")

  **Rules:**
  - Helpers require explicit button click
  - Show preview before applying
  - If helper changes the stored value, it requires a reason
  - Changes generate audit evidence (before/after)
  - Store as text by default unless backend supports typed values

  ---

  Data Model & Governance Alignment

  Authoritative Principle

  Field Builder does NOT create a new OCR output record.  
  It only modifies the draft working extraction fields that will later be confirmed.

  Status-Based Behavior

  | Status      | Field Builder State |
  |-------------|---------------------|
  | `draft`     | ✅ Enabled (full editing) |
  | `confirmed` | 🔒 Read-only (view raw text + fields) |
  | `archived`  | 🔒 View-only |

  Utilization-Based Lockout (C1 Compliance)

  **When `utilizationType` is present:**
  - Disable/hide Field Builder inputs
  - Show badge: **"Read-only (data in use)"** with tooltip explaining lock reason
  - All mutation buttons hidden or disabled

  Audit & Evidence

  Every Field Builder mutation produces:
  - Field name (fieldKey)
  - Before/after values (or "created" for new fields)
  - Reason (mandatory)
  - Timestamp + actor (userId)

  ---

  Review Page: "No Fields Extracted" State

  **When `parsedFields.length === 0`:**

  **Display:**
  - Message: "No fields extracted."
  - Raw extracted text remains visible
  - Helper link: "Why no fields were extracted?" (UX-only, no backend action)

  **CTA:**
  - Prominent button: **"Create fields from extracted text"**
  - Opens Field Builder panel with manual entry focused

  ---

  API/Implementation Notes (Non-Binding)

  Option 1 (Preferred): Reuse Existing Correction Mechanism

  - Treat "add field" as a correction entry where `fieldKey` is new
  - Backend validates reason (already enforced by C2)
  - Keeps audit trail consistent with existing corrections
  - Endpoint: Extend existing correction creation logic

  Option 2: Add Dedicated Endpoint (If Needed)

  - `POST /attachments/:id/extraction/fields` to append a draft field
  - Still requires reason
  - Still blocks when utilized/confirmed as per governance
  - Separate audit trail or merged with corrections

  ---

  Out of Scope (Explicit)

  - ❌ Automatic key/value detection from raw text without user action
  - ❌ Table/line-item extraction (can be separate v8.6 module if needed)
  - ❌ OCR engine changes or model improvements
  - ❌ Background parsing retries or re-extraction triggers
  - ❌ Field type enforcement at database level (UI validation only for v8.5)

  ---

  Task Breakdown

  Task 8.5.1 — Review Page UI: Field Builder Panel + Empty-State Behaviors

  **Objective:**  
  Add Field Builder panel to Review Page with proper empty-state handling.

  **Requirements:**
  - Add toggleable **Field Builder** panel to existing Review Page layout
  - Ensure page contains 3 sections:
    - Raw Extracted Text (read-only)
    - Field Builder (authoring tools)
    - Extracted Fields (current working set)
  - Implement "No fields extracted" behaviors:
    - Show message: "No fields extracted."
    - Keep raw extracted text visible
    - Promote CTA: "Create fields from extracted text"
    - Include helper link: "Why no fields were extracted?" (UX-only)

  ---

  Task 8.5.2 — Governance Gates: Status + Utilization Lockout Enforcement

  **Objective:**  
  Enforce status and utilization-based editing rules on both UI and server.

  **Requirements:**
  - **Status-based enablement:**
    - `draft`: Field Builder enabled
    - `confirmed`: Field Builder read-only (view raw text + fields)
    - `archived`: View-only
  - **Utilization-based lockout (C1):**
    - When `utilizationType` present: disable/hide Field Builder inputs
    - Show badge: "Read-only (data in use)" with tooltip
  - **Backend validation:**
    - Reject mutations when extraction is `confirmed`, `archived`, or has `utilizationType`
  - **UI accuracy:**
    - Field Builder appearance must match actual edit permissions (no "looks editable but fails on submit")

  ---

  Task 8.5.3 — Capability A: Add Field (Manual) with Mandatory Reason

  **Objective:**  
  Implement manual field creation with full audit trail.

  **Requirements:**
  - **Form fields:**
    - Field name (required)
    - Field value (required)
    - Optional field type selector: `text | number | date | currency` (UI validation only)
    - Mandatory reason (reuse C2 correction requirement)
  - **Explicit submit:** "Add Field" button (no auto-save)
  - **Behavior rules:**
    - Treat add field as correction-style mutation requiring reason
    - Mutation produces audit evidence: created fieldKey, value, reason, timestamp, actor
  - **Audit representation:**
    - "created" semantics: before = null/empty, after = new value

  ---

  Task 8.5.4 — Capability B: Create Field from Text Selection

  **Objective:**  
  Allow users to create fields by selecting text from raw extraction output.

  **Requirements:**
  - **Text selection actions:**
    - "Use Selection as Value" → prompts for field name (manual or from suggestion list)
    - Optional enhancement: "Use Selection as Label" / "Use Selection as Value"
  - **Rules:**
    - Selection does NOT mutate until user clicks "Create Field"
    - Field creation requires a reason
  - **UX requirements:**
    - Clear preview of selected text before field creation
    - Cancel path discards selection without changes
    - Show character count or length validation if relevant

  ---

  Task 8.5.5 — Capability C: Suggested Field Templates

  **Objective:**  
  Provide quick-add templates for common field names (UI convenience only).

  **Requirements:**
  - **Template categories:**
    - Invoice/receipt: Vendor, Date, Total, Tax, Subtotal, Currency, Invoice No
    - Document: Reference No, Subject, Amount, Notes
  - **Rules:**
    - Templates only pre-fill field names (no value inference)
    - Choosing a template does NOT mutate fields until user confirms creation
    - Final creation still requires a reason and produces audit evidence
  - **Ensure:**
    - Templates remain optional (do not block manual entry)
    - User can dismiss template suggestions

  ---

  Task 8.5.6 — Capability D: Normalization Helpers (UI-Only, Explicit Apply)

  **Objective:**  
  Implement helper actions that preview changes before applying.

  **Requirements:**
  - **Helper actions (never auto-commit):**
    - Trim whitespace (preview/apply)
    - Currency normalization (e.g., remove commas) on explicit click
    - Date parse preview ("interprets as YYYY-MM-DD") without changing stored value until applied
  - **Rules:**
    - Helpers must be explicit (button click) and show preview before applying
    - If helper changes stored field value, action requires a reason and generates audit evidence (before/after)
  - **Confirm:**
    - Helpers do not create typed backend values unless backend explicitly supports it
    - Store as text by default (type validation is UI-only for v8.5)


  

---

## v8.6 — Field-Based Extraction Assignment & Baseline ✅ (Complete)
Based on your existing document and ML architecture decisions, here's the complete v8.6 specification with milestones:

**Status:** ✅ (Complete)
**What's Done:** Milestones 8.6.1-8.6.6 (Field Library CRUD, Admin UI, Baseline Data Model, State Machine, Baseline Confirmation UI)
**What's Pending:** Milestones 8.6.7-8.6.19 (Extracted Text Pool, Field Assignment UI, Review Page Layout, Utilization & Locking, File Type Validation)

**Dependencies:**
- **REQUIRES:** v8.1 (OCR retrieval & confirmation workflow)
- **REQUIRES:** v8.5 (Field Builder infrastructure)
- **EXTENDS:** v3 OCR system (adds field library + baseline model)

**Out of Scope:**
- ML Suggestions (moved to v8.8)
- Table Review (moved to v8.7)


Capability A — Field Library (Admin-Managed)
Milestone 8.6.1: Field Library Data Model

NEW TABLE: field_library (id, field_key, label, character_type, character_limit, version, status, created_by, created_at, updated_at)

field_key: VARCHAR(255) UNIQUE — Stable identifier (e.g., invoice_number, total_amount, currency_code)
label: VARCHAR(255) — User-facing display name (e.g., "Invoice Number", "Currency")
character_type: ENUM('varchar', 'int', 'decimal', 'date', 'currency')
  - varchar: Text strings
  - int: Whole numbers
  - decimal: Decimal numbers (for monetary amounts)
  - date: ISO 8601 dates
  - currency: ISO 4217 currency codes (exactly 3 uppercase letters: USD, EUR, GBP, JPY)
character_limit: INT NULLABLE — Optional length constraint
version: INT DEFAULT 1 — For field evolution tracking
status: ENUM('active', 'hidden', 'archived') DEFAULT 'active'
created_by: FK to users (admin who created field)


Indexes: field_key (unique), status (for filtering active fields)

Milestone 8.6.2: Field Library CRUD APIs (Admin-Only)

GET /fields — List all fields (with status filter: active/hidden/archived)
GET /fields/:field_key — Get field detail
POST /fields — Create new field (admin only, validates field_key uniqueness)
PUT /fields/:field_key — Update field (admin only, creates new version if character_type changes)
PATCH /fields/:field_key/archive — Archive field (admin only, sets status='archived')
PATCH /fields/:field_key/hide — Hide field (admin only, sets status='hidden')
Validation: Prevent archiving/hiding fields currently in use (check extraction_baselines)

Milestone 8.6.3: Field Library UI (Admin Page)

Page: /admin/fields
Display: table of fields (field_key, label, character_type, status, version)
Actions: [Create Field] [Edit] [Archive] [Hide]
Create/Edit Modal:

Field Key: text input (immutable after creation, shows warning)
Label: text input (user-facing name)
Character Type: dropdown (varchar, int, decimal, date, currency)
Character Limit: number input (optional, only for varchar)


Archive confirmation modal: "Fields in use cannot be archived"


Capability B — Baseline Extraction (Single Authority)
Milestone 8.6.4: Baseline Data Model

NEW TABLE: extraction_baselines (id, attachment_id, status, confirmed_at, confirmed_by, utilized_at, utilization_type, archived_at, archived_by, created_at)

attachment_id: FK to attachments (one-to-one, each attachment has ≤1 confirmed baseline)
status: ENUM('draft', 'reviewed', 'confirmed', 'archived')
confirmed_at: TIMESTAMP NULLABLE — When baseline was confirmed
confirmed_by: FK to users — Who confirmed this baseline
utilized_at: TIMESTAMP NULLABLE — First utilization timestamp (immutable)
utilization_type: ENUM('record_created', 'workflow_committed', 'data_exported') NULLABLE
archived_at: TIMESTAMP NULLABLE — When baseline was archived (Option-C redo)
archived_by: FK to users NULLABLE


Constraint: UNIQUE(attachment_id, status) WHERE status='confirmed' — Only one confirmed baseline per attachment
Indexes: attachment_id, status

Milestone 8.6.5: Baseline State Machine (Service Layer)

NEW SERVICE: BaselineManagementService
Methods:

createDraftBaseline(attachmentId) — Creates baseline with status='draft'
markReviewed(baselineId) — Sets status='reviewed' (still editable)
confirmBaseline(baselineId, userId) — Sets status='confirmed', locks editing, archives previous baseline
archiveBaseline(baselineId, userId, reason) — Sets status='archived' (Option-C redo)


State transitions enforced:

draft → reviewed → confirmed → archived
Cannot skip states (must review before confirming)
Confirming new baseline auto-archives old one (atomic transaction)



Milestone 8.6.6: Baseline Confirmation UI (Review Page)

On Review Page (/attachments/:id/review):

Show baseline status badge: "Draft" (yellow) / "Reviewed" (blue) / "Confirmed" (green)
Button: "Mark as Reviewed" (only visible in draft state)
Button: "Confirm Baseline" (only visible in reviewed state)
Confirmation modal:

"This will lock the baseline and make it system-usable. Previous baseline will be archived."
[Cancel] [Confirm]


After confirmation: button changes to "Confirmed ✓" (disabled)




Capability C — Extracted Text Pool
Milestone 8.6.7: Extracted Text Storage (Already exists from v8.1)

Reuse existing extracted_text_segments table (from v8.1):

Contains: text, confidence, bounding_box, embedding (Sentence-BERT)
No changes needed (already stores raw OCR output)



Milestone 8.6.8: Extracted Text Display (Review Page)

Review Page left panel: "Extracted Text Pool"
Display: list of extracted text segments (read-only)

Text content (truncated if >50 chars, expand on click)
Confidence score (color-coded: green >80%, yellow 60-80%, red <60%)
Bounding box highlight on hover (if PDF/image preview available)


Unassigned text remains visible (does not disappear after assignment)
No "candidate" concept exposed to users (just raw extracted text)


Capability D — Field Assignment (Core of v8.6)
Milestone 8.6.9: Field Assignment Data Model

NEW TABLE: baseline_field_assignments (id, baseline_id, field_key, assigned_value, source_segment_id, assigned_by, assigned_at, corrected_from, correction_reason)

baseline_id: FK to extraction_baselines
field_key: FK to field_library.field_key — Which field this value belongs to
assigned_value: TEXT — The actual value (stored as text, validated against character_type)
source_segment_id: FK to extracted_text_segments NULLABLE — Which text segment this came from (null if manually entered)
assigned_by: FK to users — Who assigned this value
assigned_at: TIMESTAMP
corrected_from: TEXT NULLABLE — Previous value (if user corrected a suggestion)
correction_reason: TEXT NULLABLE — Why user corrected (required if corrected_from is not null)


Constraint: UNIQUE(baseline_id, field_key) — One field → one value per baseline

Milestone 8.6.10: Field Assignment Validation Service

NEW SERVICE: FieldAssignmentValidator
Methods:

validate(fieldKey, value) — Validates value against field character_type
Returns: { valid: boolean, error?: string, suggestedCorrection?: string }


Validation rules:

varchar: length ≤ character_limit (if set)
int: parseable as integer (no commas, no decimals)
decimal: parseable as decimal (2 decimal places, allows normalization of $, commas)
date: parseable as ISO 8601 date (YYYY-MM-DD)
currency: ISO 4217 standard (exactly 3 uppercase letters: USD, EUR, GBP, JPY) - stores currency codes, NOT monetary amounts


**Important:** Currency field stores ISO 4217 currency codes (exactly 3 uppercase letters), not monetary amounts. Use decimal field type for money values.

If validation fails: return inline guidance (e.g., "Expected number, got text")
Suggest correction: attempt to parse/normalize (e.g., "$1,234" → "1234.00" for decimal, "usd" → "USD" for currency)

Milestone 8.6.11: Field Assignment API

POST /baselines/:id/assign — Assign value to field

Body: { field_key, assigned_value, source_segment_id?, correction_reason? }
Validation: field exists, value matches character_type
If field already assigned: treat as correction (requires correction_reason)
Returns: created/updated assignment


DELETE /baselines/:id/assign/:field_key — Remove assignment (set value to null, requires reason)
GET /baselines/:id/assignments — List all assignments for baseline

Milestone 8.6.12: Field Assignment UI (Review Page)

Review Page right panel: "Field Assignment Panel"
Display: list of fields from field_library (active fields only)

Field label (user-facing name)
Input field (text/number/date picker based on character_type)
Drag-drop zone (drop text segment from left panel)
Validation indicator (green checkmark / red error icon)


Actions:

Type value manually → validates on blur
Drag text segment into field → auto-fills value
Select text segment + click "Assign to Field" → choose field from dropdown
Edit assigned value → requires correction_reason (modal)
Clear field (set to empty) → requires reason (modal)




Capability E — User Assignment & Editing (Integrated with Milestones 8.6.9-8.6.12)

**Note:** Drag-and-drop, manual editing, and correction workflows are integrated into Milestone 8.6.12 (Field Assignment UI).

**Drag-and-Drop Assignment Requirements:**

Implement drag-drop from Extracted Text Pool → Field Assignment Panel
On drop:

Extract text content from segment
Validate against field character_type
If valid: fill field, show success indicator
If invalid: show error tooltip with suggested correction
Require confirmation (modal): "Assign [text] to [field]?" [Cancel] [Confirm]


**Manual Editing with Validation Requirements:**

User edits field value directly (text input/number input/date picker)
On blur:

Call FieldAssignmentValidator.validate(field_key, value)
If invalid: show inline error message below field
Suggest correction in tooltip (if available)


User decides final value (can override validation warnings, but must acknowledge)

**Correction Reason Requirement:**

If user edits pre-filled suggestion or existing assignment:

Show modal: "Why are you correcting this value?"
Text area: correction reason (required, min 10 chars)
[Cancel] [Save Correction]


Correction reason stored in correction_reason field
Audit log: record before/after + reason


Capability F — Review Page Layout & Interaction
Milestone 8.6.13: Three-Panel Layout

Review Page structure:

Left Panel (40% width): Document Preview (PDF/image viewer, no preview for XLSX)
Middle Panel (30% width): Extracted Text Pool (read-only list)
Right Panel (30% width): Field Assignment Panel (interactive form)


Responsive: on mobile, collapse to tabs (Document / Text / Fields)

Milestone 8.6.14: Persistent Panel (Non-Modal)

Field Assignment Panel is always visible (not a modal)
User can scroll through fields while viewing document
Back button in navbar: returns to Task detail page

Milestone 8.6.15: Document Preview Handling

PDF/Image: Show preview with pdf.js (existing from v3)
XLSX: No preview, show message "Excel files have no preview. Download to view."
DOC/DOCX: Explicitly excluded, show error "Word documents not supported"


**Note:** Review → Confirm Lifecycle (Capability G) was completed in Milestones 8.6.4-8.6.6 (Baseline Data Model, State Machine, Confirmation UI) and enhanced in v8.6.add1. See above for details.

Capability H — Utilization & Locking (Pending)
Milestone 8.6.16: Utilization Tracking for Baselines

EXTEND existing UtilizationTrackingService (from v8.1):

Method: markUtilized(baselineId, type: 'record_created' | 'workflow_committed' | 'data_exported')
Called by:

Record creation APIs (Category A)
Workflow approval handlers (Category B, future)
Export endpoints (Category C)


Sets: utilized_at (first call wins), utilization_type



Milestone 8.6.17: Utilization Lockout (UI + Backend)

If baseline has utilization_type set:

UI: Disable all editing inputs, show "Read-Only (data in use)" badge
Tooltip: Explain why locked ("Authoritative record created" / "Data exported" / "Workflow approved")
Backend: Reject edit/delete requests with 403 error


Viewing does NOT count as usage (reading baseline data doesn't lock it)

Milestone 8.6.18: Utilization Indicator (Task Detail)

On Task detail page, show baseline utilization status:

"Not yet used" (utilization_type=null)
"⚠️ Record created from this data" (Category A)
"⚠️ Used in workflow approval" (Category B)
"⚠️ Data exported" (Category C)


Click indicator → shows detail (which record, when, by whom)


Capability I — Supported File Types
Milestone 8.6.19: File Type Validation

Supported for extraction:

PDF (with preview)
PNG, JPG, JPEG (with preview)
XLSX (no preview, extraction only)


Explicitly excluded:

DOC, DOCX (show error: "Word documents not supported. Please convert to PDF.")


Validation on upload (v3 attachments service):

Check MIME type
Reject unsupported types with clear error message



**v8.6 Cross-Cutting Concerns**

**Error Handling Standards:**

All API endpoints return standardized error responses:
```json
{
  "error": {
    "code": "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT",
    "message": "Human-readable error message",
    "details": {
      "field": "field_key",
      "constraint": "character_type",
      "providedValue": "abc123",
      "expectedFormat": "integer"
    }
  }
}
```

HTTP Status Codes:
- 400: Validation errors, malformed requests
- 403: Permission denied, baseline locked due to utilization
- 404: Resource not found (field, baseline, assignment)
- 409: Conflict (duplicate field_key, concurrent baseline confirmation)
- 500: Server errors (log with request ID for debugging)

**Performance Requirements:**

Field Library CRUD:
- List fields: < 200ms for 1000 fields
- Create/update field: < 100ms
- Pagination: 50 fields per page (default)

Baseline Operations:
- Create baseline: < 300ms
- Confirm baseline: < 500ms (includes archival transaction)
- List assignments: < 200ms for 100 fields

Field Assignment:
- Validate single field: < 50ms
- Bulk validate (all fields): < 500ms
- Drag-drop response: < 100ms (validation + UI update)

Review Page:
- Initial load: < 2s (PDF preview + extracted text + field library)
- Field list rendering: < 300ms for 200 fields
- Auto-save on field change: < 200ms (debounced)

**Security Considerations:**

Input Validation:
- Sanitize all text inputs (prevent XSS via field labels, assigned values)
- SQL injection prevention: Use parameterized queries for all DB operations
- Field key validation: Alphanumeric + underscore only (regex: `^[a-z0-9_]+$`)

Authorization:
- Field Library CRUD: Admin role required (JWT claim: `role: 'admin'`)
- Baseline operations: Owner or assigned user only
- Utilization tracking: System service accounts exempt from user checks

Data Protection:
- Sensitive field values (e.g., SSN, credit card): Optional encryption at rest
- Audit logs: Immutable, append-only (never delete correction history)

**Testing Strategy:**

Unit Tests (per milestone):
- Field validation service: Test all character_types with valid/invalid inputs
- Baseline state machine: Test all state transitions + invalid transitions
- Field assignment validator: Test edge cases (empty, null, unicode, SQL injection attempts)

Integration Tests:
- Field Library CRUD: Create → Update → Archive flow
- Baseline lifecycle: Draft → Reviewed → Confirmed → Utilized
- Field assignment: Drag-drop → Validate → Correct → Re-validate

E2E Tests (critical paths):
1. Create field → Assign to baseline → Confirm baseline → Create record (utilization lock)
2. Upload document → Extract text → Assign fields → Mark reviewed → Confirm
3. Admin creates field → User assigns value → Validation fails → User corrects → Success

---

## v8.6.add1 — OCR Queue Management Extension ✅ (Complete)

**What this is**
- **Target UI/UX** for OCR job management (this design will persist into v8.9+)
- User-facing panel to view, dismiss, cancel, and retry OCR jobs
- Image preprocessing for OCR quality improvements
- Per-job status tracking (queued, processing, completed, failed, dismissed)
- **Current implementation**: Lightweight database-backed tracking (backend may be replaced in v8.9)

**What this is not**
- Not the final backend architecture (implementation tentative until v8.9)
- Not batch baseline confirmation (single-attachment focus for now)
- Not locked-in (backend infrastructure subject to v8.9 redesign)

**Design Intent**
Establish the **desired user experience** for OCR job management now, with understanding that:
- **UI/UX patterns are the target** for both v8.6.add1 and v8.9 (user-facing behavior stays consistent)
- **Backend implementation is tentative** and will likely be replaced with BullMQ infrastructure in v8.9
- **User actions** (dismiss/cancel/retry) should work the same way regardless of backend changes
- This provides **immediate value** while we design v8.9's full batch processing system

**Capacity & Rate Limiting Principles**
- **Controlled job limits** to ensure system can handle the load
- **Per-user quotas** to prevent any single user from overwhelming the OCR worker
- **Queue depth monitoring** to surface when system is at capacity
- **Graceful degradation** when limits are reached (show user-friendly messages, not crashes)

**Dependencies**
- **REQUIRES:** v8.1 (OCR retrieval & confirmation workflow)
- **EXTENDS:** v3 (OCR worker integration)
- **COMPATIBLE WITH:** v8.6 (baseline & field assignment)

**What Was Built**

**Database Schema:**
- Uses existing `attachment_ocr_outputs` table with `status` field ('draft', 'confirmed', 'archived')
- No new queue tables (leverages existing OCR output tracking)
- Job state tracked via `processingStatus` in OCR outputs

**Backend Services:**
- `apps/api/src/ocr/ocr-queue.service.ts` - NEW queue management service
  - `listActiveJobs(userId)` - Returns non-dismissed jobs (queued/processing/completed/failed) with task + attachment info
  - `dismissJob(jobId, userId)` - Soft-deletes job by setting `dismissed_at` timestamp
  - `cancelJob(jobId, userId)` - Cancels queued/processing jobs (marks failed with "Cancelled by user")
  - `retryJob(jobId, userId)` - Converts failed job to new queued job (dismisses old one)
  - **Enforces per-user limit:** Max 1 processing + 2 queued jobs per user

**Backend Controller Extensions:**
- `apps/api/src/ocr/ocr.controller.ts` - EXTENDED with queue endpoints
  - `GET /ocr/jobs` - List non-dismissed OCR jobs for current user
  - `POST /ocr/jobs/:jobId/dismiss` - Dismiss completed job
  - `POST /ocr/jobs/:jobId/cancel` - Cancel queued/processing job
  - `POST /ocr/jobs/:jobId/retry` - Retry failed job

**OCR Worker Extensions:**
- `apps/ocr-worker/main.py` - EXTENDED with preprocessing
  - `preprocess_image(image_path)` - Image resize/contrast enhancement for OCR quality/speed tuning
  - Applied before Tesseract/cloud OCR processing

  **Preprocessing Parameters:**
  - **Image resize:** Max dimension 2000px (preserves aspect ratio, reduces processing time)
  - **Contrast enhancement:** CLAHE (Contrast Limited Adaptive Histogram Equalization) with clip limit 2.0
  - **Noise reduction:** Gaussian blur (kernel size 3x3) for images with estimated noise > 15%
  - **Binarization threshold:** Otsu's method for optimal threshold detection
  - **DPI normalization:** Upscale images < 150 DPI to 300 DPI using Lanczos interpolation
  - **Rotation correction:** Auto-detect and correct skew angles between -10° and +10°

**Frontend Components:**
- `apps/web/app/components/ocr/OcrQueuePanel.tsx` - NEW global UI panel (**MINIMUM VIABLE UI/UX BASELINE**)

  **Layout & Position:**
  - Fixed bottom-right corner (position: fixed, bottom: 20px, right: 20px, z-index: 9000)
  - Width: 320px, max height: 5 jobs visible (scrollable for more)
  - Dark theme (#111827 background, rounded corners, drop shadow)

  **Header:**
  - Always visible "Jobs (N)" count badge
  - Collapsed by default (user must expand to see job list)
  - Click to toggle expand/collapse

  **Per-Job Card (Minimum Information):**
  - **File Icon:** [IMG] / [PDF] / [FILE] type indicator (32x32 rounded box)
  - **Filename:** Truncated with ellipsis if too long (13px font)
  - **Status Badge:** Color-coded pill (Queued/Processing/Completed/Failed, 11px uppercase)
    - Processing: dark (#0f172a)
    - Completed: green (#16a34a)
    - Failed: red (#dc2626)
    - Queued: gray (#e2e8f0)
  - **Task Title:** "Task: [title]" (linked, truncated, 12px font)
  - **Completion DateTime:** Shows "Completed: [datetime]" for completed/failed jobs (11px gray)
  - **Error Message:** Red text below if status=failed (11px)
  - **Actions:**
    - "View" link (navigate to task detail, 12px)
    - "X" button (cancel) - for queued/processing jobs
    - "Dismiss" button - for completed jobs
    - **Failed jobs:** Both "Try again" AND "X" (dismiss) buttons stacked vertically

  **Behavior:**
  - Auto-refresh: polls every 3 seconds (configurable via `pollMs` prop)
  - **Job ordering:** Sorted by `requestedAt` ASC (oldest first, stable ordering - cancelled jobs stay in place)
  - No empty state clutter: shows "No OCR jobs in queue." if empty
  - **Custom scrollbar:** Styled thin scrollbar (8px width, semi-transparent gray)
  - **Dynamic toast offset:** CSS variable `--toast-bottom-offset` adjusts notification position to avoid overlapping queue panel (collapsed or expanded)

  **🎯 This UI/UX is the TARGET - v8.9 enhances but PRESERVES this core design**

**API Client:**
- `apps/web/app/lib/api/ocr-queue.ts` - NEW client API module
  - `fetchOcrJobs()` - Client wrapper for GET /ocr/jobs
  - `dismissOcrJob(jobId)` - Client wrapper for dismiss action
  - `cancelOcrJob(jobId)` - Client wrapper for cancel action
  - `retryOcrJob(jobId)` - Client wrapper for retry action

**API Specifications:**

**GET /ocr/jobs**
- **Authentication:** Required (JWT)
- **Query Parameters:** None (automatically filters by authenticated user)
- **Response 200:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "attachmentId": "uuid",
      "taskId": "uuid",
      "filename": "invoice_2024.pdf",
      "fileType": "PDF" | "IMAGE" | "XLSX",
      "status": "queued" | "processing" | "completed" | "failed",
      "requestedAt": "2024-02-06T10:30:00Z",
      "completedAt": "2024-02-06T10:32:15Z" | null,
      "errorMessage": "Tesseract timeout after 60s" | null,
      "taskTitle": "Process January Invoices",
      "taskUrl": "/tasks/uuid"
    }
  ],
  "queueDepth": 3,
  "userLimits": {
    "processing": 1,
    "queued": 2,
    "currentProcessing": 1,
    "currentQueued": 2
  }
}
```
- **Response 401:** Unauthorized (missing or invalid JWT)
- **Performance:** < 150ms (indexed query on userId + dismissed_at IS NULL)

**POST /ocr/jobs/:jobId/dismiss**
- **Authentication:** Required (JWT, must be job owner)
- **Request Body:** None
- **Response 200:**
```json
{
  "success": true,
  "jobId": "uuid",
  "dismissedAt": "2024-02-06T10:35:00Z"
}
```
- **Response 403:** Forbidden (not job owner)
- **Response 404:** Job not found or already dismissed
- **Response 409:** Cannot dismiss queued/processing jobs (use cancel instead)

**POST /ocr/jobs/:jobId/cancel**
- **Authentication:** Required (JWT, must be job owner)
- **Request Body:**
```json
{
  "reason": "User-initiated cancellation" // Optional, defaults to "Cancelled by user"
}
```
- **Response 200:**
```json
{
  "success": true,
  "jobId": "uuid",
  "status": "failed",
  "errorMessage": "Cancelled by user",
  "cancelledAt": "2024-02-06T10:36:00Z"
}
```
- **Response 403:** Forbidden (not job owner)
- **Response 404:** Job not found
- **Response 409:** Cannot cancel completed/failed jobs (use dismiss instead)

**POST /ocr/jobs/:jobId/retry**
- **Authentication:** Required (JWT, must be job owner)
- **Request Body:** None
- **Response 200:**
```json
{
  "success": true,
  "newJobId": "uuid",
  "oldJobId": "uuid",
  "status": "queued",
  "queuePosition": 3,
  "estimatedStartTime": "2024-02-06T10:40:00Z" // Based on current queue depth
}
```
- **Response 403:** Forbidden (not job owner or queue limit reached)
- **Response 404:** Job not found
- **Response 409:** Can only retry failed jobs
- **Response 429:** Queue limit reached (user has 1 processing + 2 queued already)

**Error Response Format (all endpoints):**
```json
{
  "error": {
    "code": "QUEUE_LIMIT_REACHED" | "JOB_NOT_FOUND" | "INVALID_STATE",
    "message": "You have reached your queue limit (1 processing + 2 queued). Wait for completion or cancel existing jobs.",
    "details": {
      "currentProcessing": 1,
      "currentQueued": 2,
      "maxProcessing": 1,
      "maxQueued": 2
    }
  }
}
```

**Governance Alignment**
- **Explicit Intent:** All job actions (dismiss/cancel/retry) require explicit user clicks; no automatic job cleanup
- **Auditability:** Job state changes logged via existing OCR audit events; retry creates new job entry
- **Ownership:** Jobs filtered by userId; users can only manage their own OCR jobs

**Integration Notes**

**OCR Queue Panel:**
- **Location:** Global panel accessible from review page or task detail (bottom-right fixed)
- **Job Lifecycle:** Queued → Processing → Completed/Failed → Dismissed (user action)
- **Retry Behavior:** Creates new queued job, dismisses failed job, preserves original attachment link
- **Preprocessing Impact:** Image preprocessing applied transparently before OCR worker processing

**Task Page (/task/[id]) Status Indicators:**
- **Attachment List Shows Queue State:**
  - "Queued" badge for attachments with queued OCR jobs
  - "In Progress" badge for attachments with processing OCR jobs
  - "Reviewed" badge for attachments with reviewed baseline (baseline status='reviewed')
- **OCR Text Panel:** Collapsed by default (user must expand to see extracted text)

**Review Page (/attachments/[attachmentId]/review) Behavior:**
- **"Mark as Reviewed" Action:** Reloads baseline data after status update to prevent empty UI state
- **Correction Reason Rules:**
  - **Draft baseline:** Edits/deletes do NOT require correction reason (freeform exploration)
  - **Reviewed baseline:** Edits/deletes REQUIRE correction reason (backend enforced, UI prompts)
- **OCR Completion Lifecycle:** When OCR completes, any reviewed baseline for that attachment is **reset to draft** (user must re-review after new OCR data arrives)

**Capacity Controls (v8.6.add1)**
- **Per-User Processing Limit:** Max 1 processing + 2 queued jobs per user (backend enforced)
- **Upload Validation:** Block new OCR requests if user's queue limit reached
- **UI Feedback:** Show message "You have reached your queue limit. Please wait for completion or cancel existing jobs."
- **Queue State Tracking:** Jobs include `dismissed_at` timestamp for soft-delete behavior
- **Cancellation Support:** Queued/processing jobs can be cancelled (marked as failed with "Cancelled by user")

**Differences from Planned v8.9:**
- **No BullMQ:** Uses database polling instead of Redis-backed job queue
- **No Bulk Upload:** Single-file OCR jobs only (batch upload deferred to v8.9)
- **No Parallel Workers:** Sequential processing via existing OCR worker (v8.9 adds concurrency)
- **No Progress Bars:** Simple status badges instead of granular progress tracking

**v8.9 Migration Path:**
When v8.9 implements the full batch processing system:
- **PRESERVE:** All UI components (`OcrQueuePanel`, action buttons, job list layout)
- **PRESERVE:** API endpoint contracts (`GET /ocr/jobs`, dismiss/cancel/retry endpoints)
- **REPLACE:** Backend implementation (swap database polling for BullMQ)
- **EXTEND:** Add bulk upload UI, progress bars, parallel processing
- **GOAL:** User experience should feel identical, just faster and more capable

**Bottom-Right Panel Evolution (v8.6.add1 → v8.9):**

| Feature | v8.6.add1 (Baseline) | v8.9 (Enhanced) |
|---------|----------------------|-----------------|
| **Position** | Fixed bottom-right ✅ | ✅ Same |
| **Job List** | Filename + status + actions ✅ | ✅ Same + queue position |
| **Status Badge** | Queued/Processing/Completed/Failed ✅ | ✅ Same + progress spinner |
| **Actions** | View/Cancel/Dismiss/Retry ✅ | ✅ Same |
| **Auto-Refresh** | 3 second polling ✅ | ✅ Same or WebSocket upgrade |
| **Batch Grouping** | ❌ None | ✅ "Batch of 12" header if >5 jobs |
| **ETA** | ❌ None | ✅ "~2 min remaining" per job |
| **Notifications** | ❌ None | ✅ Toast/sound/desktop notifications |

**Key Principle:** v8.6.add1 establishes the **minimum viable information** at bottom-right. v8.9 adds **convenience features** but keeps the core layout identical.

**Recent Refinements (Post-B3):**
- ✅ **Queue Panel UX:** Collapsed by default, completion datetime, dynamic toast offset, stable job ordering, styled scrollbar
- ✅ **Failed Job Actions:** Both "Try again" and "X" (dismiss) buttons for flexible failure recovery
- ✅ **API Response:** Jobs now include completed/failed states (until dismissed)
- ✅ **Dismissal Tracking:** Soft-delete with `dismissed_at` timestamp
- ✅ **Per-User Limits:** Enforced 1 processing + 2 queued jobs per user
- ✅ **Task Page Integration:** Queue state badges (Queued/In Progress), Reviewed badge, collapsed OCR text panel
- ✅ **Review Page Integration:** "Mark as Reviewed" reloads data, correction reason rules (draft=optional, reviewed=required), OCR completion resets reviewed → draft
- ✅ **Cancellation Support:** Cancel queued/processing jobs from UI

**v8.6.add1 Cross-Cutting Concerns**

**Performance Requirements:**

OCR Queue Operations:
- List jobs (GET /ocr/jobs): < 150ms for 100 jobs (indexed query on userId + dismissed_at)
- Dismiss job: < 100ms (single UPDATE query)
- Cancel job: < 200ms (UPDATE + worker notification)
- Retry job: < 300ms (INSERT new job + UPDATE old job)

Queue Panel UI:
- Initial render: < 200ms (collapsed state)
- Expand animation: 300ms smooth transition
- Auto-refresh polling: Every 3s (configurable, batched API call)
- Job list scrolling: 60 FPS for 50+ jobs (virtual scrolling if > 20 jobs)

OCR Worker:
- Preprocessing: < 2s for 5MB image (resize + CLAHE + binarization)
- Tesseract OCR: < 30s for single-page PDF (timeout after 60s)
- Cloud OCR fallback: < 10s for Google Vision API

**Error Handling Standards:**

Queue API Errors:
- 403 Forbidden: "You do not own this OCR job"
- 404 Not Found: "Job not found or already dismissed"
- 409 Conflict: "Cannot dismiss queued/processing jobs (use cancel instead)"
- 429 Too Many Requests: "Queue limit reached (1 processing + 2 queued). Wait for completion or cancel existing jobs."

OCR Worker Failures:
- Tesseract timeout: Mark job as failed with error "OCR processing timeout after 60s"
- Preprocessing error: Mark job as failed with error "Image preprocessing failed: [reason]"
- Cloud API error: Retry once, then mark failed with error "Cloud OCR service unavailable"
- File not found: Mark job as failed with error "Attachment file missing or corrupted"

Queue Panel Error States:
- API fetch failure: Show "Unable to load OCR jobs. Retrying..." (auto-retry after 5s)
- Dismiss/cancel failure: Show toast "Action failed. Please try again."
- Network offline: Show banner "Offline - OCR jobs will refresh when connection restored"

**Security Considerations:**

Authorization:
- All queue endpoints: Verify userId matches job owner (JWT claim)
- Job visibility: Users only see their own jobs (filtered by userId)
- Admin exemption: Admins can view all jobs (for debugging, audit logs recorded)

Input Validation:
- Job ID: UUID format validation (reject malformed IDs)
- Cancellation reason: Max 500 chars, sanitize HTML
- Retry limit: Max 3 retries per attachment (prevent infinite retry loops)

Data Protection:
- Job error messages: Sanitize file paths (don't expose server filesystem structure)
- Queue depth: Aggregate metric only (don't expose individual user queue counts)

**Testing Strategy:**

Unit Tests:
- OcrQueueService: Test listActiveJobs filters by userId + dismissed_at IS NULL
- OcrQueueService: Test dismissJob sets dismissed_at timestamp
- OcrQueueService: Test cancelJob updates status to 'failed' with reason
- OcrQueueService: Test retryJob creates new job + dismisses old job
- OcrQueueService: Test per-user limits (1 processing + 2 queued enforced)

Integration Tests:
- Queue lifecycle: Upload → Queue → Process → Complete → Dismiss
- Cancellation: Upload → Queue → Cancel → Job marked failed
- Retry: Upload → Process → Fail → Retry → New job queued
- Limit enforcement: Upload 4 files → 3rd queued → 4th rejected (HTTP 429)

E2E Tests:
1. Upload attachment → OCR queued → Panel shows "Queued" badge → Processing → Completed → Dismiss
2. Upload attachment → OCR processing → Cancel from panel → Job fails → "X" button dismisses
3. Upload attachment → OCR fails → "Try again" button → New job queued → Completes successfully
4. Upload 3 attachments simultaneously → 1 processing + 2 queued → 4th upload blocked with error
5. OCR completes → Reviewed baseline exists → Baseline reset to draft → User must re-review

**Status**
🚧 Tentative (UI/UX target established, backend subject to v8.9 redesign)
**Last Updated:** 2026-02-06 (Post-B3 refinements)

---

## v8.7 — Table Review for Structured Document Data ✅ (Complete)

**What this is**
- User-driven table review for structured data (line items, loan summaries, usage breakdowns)
- Column-to-field mapping with bulk validation
- Light editing (fix OCR mistakes, remove rows)
- Per-table confirmation workflow
- Multiple tables per document support

**What this is not**
- ❌ Not automatic table detection (user must explicitly choose "Review as Table")
- ❌ Not AI-guessed field mappings (user assigns fields from Field Library)
- ❌ Not data transformation (no formulas, mass edits)
- ❌ Not required (users can skip tables and use field-by-field assignment)

**Design Intent**
Allow users to review structured grids as tables instead of extracting every value one-by-one, while preserving validation, auditability, and explicit user control.

**Dependencies**
- **REQUIRES:** v8.6 (Field-Based Extraction Assignment & Baseline)
- **EXTENDS:** v8.6 field validation system (reuses field_library rules)
- **NEW DATA MODEL:** `baseline_tables`, `baseline_table_cells`, `baseline_table_column_mappings`

**Key Principles**
- **Nothing automatic** - User must choose "Review this section as a table"
- **Field Library integration** - Only pre-configured fields allowed (no ad-hoc columns)
- **Validation per column** - All cells validated against assigned field type
- **Confirmation per table** - Independent of other tables or baseline confirmation
- **Audit trail** - All actions logged (assign column, edit cell, confirm table)

**Architecture**

**Database Schema:**
- `baseline_tables`: id, baselineId, tableIndex, tableLabel, status (draft/confirmed), rowCount, columnCount, confirmedAt, confirmedBy, createdAt, updatedAt
  - Status: `draft` (user editing) | `confirmed` (locked, immutable)
  - tableIndex: 0-based index for multiple tables in one document
  - tableLabel: Optional user label (e.g., "Line Items", "Loan Summary")

- `baseline_table_cells`: id, tableId, rowIndex, columnIndex, cellValue, validationStatus, validationError, correctedFrom, correctionReason
  - Unique constraint: `(tableId, rowIndex, columnIndex)`
  - validationStatus: `valid` | `invalid` | `pending`
  - Stores values as TEXT, validated against field type rules

- `baseline_table_column_mappings`: id, tableId, columnIndex, fieldKey (FK to field_library), assignedBy, assignedAt
  - Unique constraint: `(tableId, columnIndex)` - one field per column
  - Maps table columns to Field Library fields

**User Flow:**
1. User uploads document with tables (e.g., invoice with line items)
2. User opens review page (v8.6 three-panel layout)
3. User selects section and clicks "Review as Table"
4. System displays editable grid
5. User assigns field to each column (dropdown from Field Library)
6. System validates all cells in column against field rules
7. User fixes validation errors (edit cells or remove rows)
8. User confirms table (locks data as immutable)
9. Confirmed table data available for downstream use (record creation, export)

**What Users Can Do:**
- ✏️ **Edit individual cells** - Fix OCR mistakes (e.g., "INV-123" → "INV-1234")
- 🗑 **Remove rows** - Delete incorrect lines (e.g., header row misdetected as data)
- ✅ **Confirm table** - Lock data as immutable baseline

**What Users CANNOT Do:**
- ❌ Change table structure (add/remove columns)
- ❌ Apply formulas or calculations
- ❌ Mass transform data (e.g., "uppercase all values in column")
- ❌ Bypass validation rules (must fix errors before confirming)

**Multiple Tables Support:**
- Single document may contain zero, one, or multiple tables
- Each table reviewed independently
- Each table has its own validation state
- One table failing validation does not block others
- Example: Invoice with "Line Items" table and "Tax Summary" table

**Validation:**
- Column assignment triggers validation of all cells in that column
- Validation uses same rules as v8.6 field assignments (varchar, int, decimal, date, currency, etc.)
- Invalid cells highlighted in red with error tooltip
- Table cannot be confirmed until all validation errors resolved
- User must explicitly fix errors (no auto-correction)

**Confirmation:**
- "Confirm Table" button disabled until all cells valid
- Confirmation modal shows summary: "Confirm X rows × Y columns?"
- On confirm, table status → `confirmed`, becomes read-only
- Confirmation logged with audit entry (who, when, row/column count)

**Utilization Tracking:**
- Same rules as v8.6 baseline utilization (Category A/B/C)
- Table data used for authoritative purposes → baseline marked as utilized
- Utilized baselines lock all table edits (same as field assignments)
- Categories:
  - **A (Authoritative record)**: Table data used to create permanent record → never redo
  - **B (Workflow approval)**: Table data used in workflow decision → never redo
  - **C (Data export)**: Table data exported externally → redo only after archive

**Governance Alignment**
- **Explicit Intent:** User must choose "Review as Table" (no auto-detection or auto-conversion)
- **Auditability:** All actions logged (table creation, column assignment, cell edits, row deletion, confirmation)
- **Validation-first:** Cannot confirm until all validation errors resolved
- **Read-only after confirmation:** Confirmed tables immutable (same as v8.6 baselines)
- **Utilization locking:** Table edits blocked after data used for authoritative purposes

**Milestones (8 total):**

**Milestone 8.7.1: Table Data Model**

NEW TABLES:

`baseline_tables`
- id: UUID PRIMARY KEY
- baselineId: FK to extraction_baselines (one baseline can have multiple tables)
- tableIndex: INT (0-based, for ordering multiple tables)
- tableLabel: VARCHAR(255) NULLABLE (user-assigned name like "Line Items")
- status: ENUM('draft', 'confirmed') DEFAULT 'draft'
- rowCount: INT (number of data rows, excluding headers)
- columnCount: INT (number of columns)
- confirmedAt: TIMESTAMP NULLABLE
- confirmedBy: FK to users NULLABLE
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
- UNIQUE(baselineId, tableIndex)

`baseline_table_cells`
- id: UUID PRIMARY KEY
- tableId: FK to baseline_tables CASCADE DELETE
- rowIndex: INT (0-based)
- columnIndex: INT (0-based)
- cellValue: TEXT (stored as string, validated against mapped field type)
- validationStatus: ENUM('valid', 'invalid', 'pending') DEFAULT 'pending'
- validationError: TEXT NULLABLE (e.g., "Expected integer, got 'abc'")
- correctedFrom: TEXT NULLABLE (original value before user edit)
- correctionReason: TEXT NULLABLE (required if correctedFrom is not null)
- correctedAt: TIMESTAMP NULLABLE
- correctedBy: FK to users NULLABLE
- UNIQUE(tableId, rowIndex, columnIndex)
- INDEX(tableId, validationStatus) for fast error queries

`baseline_table_column_mappings`
- id: UUID PRIMARY KEY
- tableId: FK to baseline_tables CASCADE DELETE
- columnIndex: INT (0-based)
- fieldKey: FK to field_library.field_key
- assignedBy: FK to users
- assignedAt: TIMESTAMP
- UNIQUE(tableId, columnIndex) - one field per column
- INDEX(tableId) for fast column lookups

Migration script:
- Create three tables with indexes
- Add foreign key constraints with CASCADE DELETE
- Seed test data: Sample table with 5 rows × 3 columns

**Milestone 8.7.2: Table CRUD Service**

NEW SERVICE: `TableManagementService` (apps/api/src/baselines/table-management.service.ts)

Methods:

`createTable(baselineId, userId, options)`
- Input: { rowCount, columnCount, tableLabel?, cellValues: string[][] }
- Validation: Baseline must exist and be in draft/reviewed state
- Creates baseline_tables entry + baseline_table_cells (rowCount × columnCount entries)
- Returns: { tableId, rowCount, columnCount, cells: Cell[] }

`updateCell(tableId, rowIndex, columnIndex, newValue, userId, correctionReason?)`
- Validation: Table must be in draft state (not confirmed)
- If cell has existing value: requires correctionReason
- Updates baseline_table_cells
- Triggers validation via FieldAssignmentValidator (if column mapped)
- Returns: { cellId, newValue, validationStatus, validationError? }

`deleteRow(tableId, rowIndex, userId, reason)`
- Validation: Table must be in draft state
- Deletes all cells in row (WHERE tableId = X AND rowIndex = Y)
- Renumbers subsequent rows (rowIndex > deleted row → rowIndex - 1)
- Logs audit event: { action: 'delete_row', tableId, rowIndex, reason }
- Returns: { success: true, newRowCount }

`assignColumnToField(tableId, columnIndex, fieldKey, userId)`
- Validation: Field must exist in field_library
- Creates baseline_table_column_mappings entry
- Triggers bulk validation: All cells in column validated against field character_type
- Updates baseline_table_cells.validationStatus for all cells in column
- Returns: { columnIndex, fieldKey, validationResults: { rowIndex, status, error? }[] }

`confirmTable(tableId, userId)`
- Validation: All cells must have validationStatus='valid'
- Sets baseline_tables.status='confirmed', confirmedAt=NOW(), confirmedBy=userId
- Locks table (no further edits allowed)
- Logs audit event: { action: 'confirm_table', tableId, userId, rowCount, columnCount }
- Returns: { success: true, confirmedAt }

**Milestone 8.7.3: Table API Endpoints**

NEW CONTROLLER: `TableController` (apps/api/src/baselines/table.controller.ts)

Endpoints:

`POST /baselines/:baselineId/tables`
- Body: { rowCount, columnCount, tableLabel?, cellValues: string[][] }
- Auth: User must own baseline or be assigned
- Returns 201: { table: Table, cells: Cell[] }
- Returns 400: Invalid cell values (wrong dimensions)
- Returns 403: Baseline already confirmed (cannot add tables)

`GET /baselines/:baselineId/tables`
- Query: ?includeConfirmed=true (default: false, only draft tables)
- Returns 200: { tables: Table[], columnMappings: ColumnMapping[] }

`GET /tables/:tableId`
- Returns 200: { table: Table, cells: Cell[][], columnMappings: ColumnMapping[] }
- Cells returned as 2D array grouped by row

`PUT /tables/:tableId/cells/:rowIndex/:columnIndex`
- Body: { value: string, correctionReason?: string }
- Auth: User must own table's baseline
- Returns 200: { cell: Cell, validationStatus, validationError? }
- Returns 403: Table already confirmed (read-only)
- Returns 409: Correction reason required (cell had previous value)

`DELETE /tables/:tableId/rows/:rowIndex`
- Body: { reason: string } (required)
- Auth: User must own table's baseline
- Returns 200: { success: true, newRowCount }
- Returns 403: Table already confirmed

`POST /tables/:tableId/columns/:columnIndex/assign`
- Body: { fieldKey: string }
- Auth: User must own table's baseline
- Returns 200: { columnMapping: ColumnMapping, validationResults: ValidationResult[] }
- Returns 400: Field not found or invalid type
- Returns 409: Column already mapped (use PUT to change)

`POST /tables/:tableId/confirm`
- Body: None
- Auth: User must own table's baseline
- Returns 200: { success: true, confirmedAt }
- Returns 400: Table has validation errors (cannot confirm)
- Returns 403: Baseline already utilized (cannot modify)

Error handling: All endpoints return standardized error format (same as v8.6)

**Milestone 8.7.4: Table Selection UI**

NEW COMPONENT: `TableCreationModal` (apps/web/app/components/tables/TableCreationModal.tsx)

Trigger:
- Review page (/attachments/:id/review) shows button: "Create Table from Selection"
- Visible only when baseline status='draft' or 'reviewed'

User Flow:
1. User selects text segments from Extracted Text Pool (multi-select with checkboxes)
2. User clicks "Create Table from Selection"
3. Modal appears with two options:
   - **Option A: Grid Detection** - "Auto-detect rows and columns" (uses spacing analysis)
   - **Option B: Manual Definition** - "I'll define the table structure myself"

Option A (Auto-detect):
- System analyzes selected segments:
  - Detect row breaks (vertical spacing > 1.5× average line height)
  - Detect column breaks (horizontal spacing > 3× average character width)
  - Display preview grid with detected cells
- User reviews grid:
  - Green borders: Detected cells
  - Red borders: Ambiguous cells (low confidence < 0.7)
- User can adjust:
  - Merge cells (drag to combine)
  - Split cells (click divider line)
  - Remove rows (click row header × button)
- Modal shows: "Detected X rows × Y columns"
- Actions: [Cancel] [Adjust Grid] [Create Table]

Option B (Manual):
- User inputs:
  - Row count: Number input (min 1, max 100)
  - Column count: Number input (min 1, max 20)
  - Table label: Text input (optional, e.g., "Line Items")
- User assigns text segments to cells:
  - Drag segment from list → Drop into grid cell
  - Each cell shows assigned text (truncated)
- Actions: [Cancel] [Create Empty Table] [Create Table]

On "Create Table":
- POST /baselines/:id/tables with cellValues
- Redirect to Table Editor (Milestone 8.7.5)
- Show success toast: "Table created with X rows × Y columns"

**Milestone 8.7.5: Table Editor UI**

NEW COMPONENT: `TableEditorPanel` (apps/web/app/components/tables/TableEditorPanel.tsx)

Layout:
- Replaces Field Assignment Panel when table is open
- Fixed-height header: Table label + status badge + action buttons
- Scrollable grid area (virtual scrolling for tables > 50 rows)
- Bottom toolbar: Focused-column mapping controls + keyboard hints

Grid Component:
- Library: `@tanstack/react-table` v8 (headless) with manual row virtualization
- Features:
  - Inline editing: Click cell → Edit mode → Blur to save
  - Row selection: Checkbox column for bulk delete
  - Column headers: Searchable mapping dropdown (search + select)
  - Validation indicators: Red border + error icon for invalid cells
  - Keyboard navigation: Arrow keys, Tab, Enter to navigate/edit

Column Mapping:
- Column header shows:
  - Current field (if mapped): "Invoice Number (varchar)" with green checkmark
  - Unmapped: "Map to field..." with gray dropdown icon
- Click header → Dropdown appears:
  - Search field library fields (typeahead)
  - Field list: [field_key] - Label (character_type)
  - On select: POST /tables/:id/columns/:index/assign
  - Show loading spinner during validation
  - After validation: Update all cells in column with validation status

Cell Editing:
- Click cell → Input appears (type based on mapped field):
  - varchar: Text input
  - int: Number input (no decimals)
  - decimal: Number input (2 decimals)
  - date: Date picker
  - currency: Text input with uppercase transform + ISO 4217 validation
- On blur:
  - PUT /tables/:id/cells/:row/:col with new value
  - If cell had previous value: Show modal "Why are you correcting this?"
  - Validation runs automatically
  - Cell border color: Green (valid) / Red (invalid)
  - Hover invalid cell → Tooltip shows error message

Row Deletion:
- Select rows via checkboxes
- Click "Delete Rows" button
- Modal: "Why are you deleting X rows?" (required reason)
- DELETE /tables/:id/rows/:index (one request per row, sequential)
- Rows removed from grid with fade animation

Validation Status Bar:
- Bottom bar shows: "X errors remaining" (count of invalid cells)
- Click "Show Errors" → Filters grid to only invalid cells
- "Confirm Table" button enabled only when errors = 0

**Milestone 8.7.6: Table Confirmation UI**

NEW COMPONENT: `TableConfirmationModal` (apps/web/app/components/tables/TableConfirmationModal.tsx)

Trigger:
- User clicks "Confirm Table" button (only enabled when all cells valid)

Modal Content:
- Header: "Confirm Table: [tableLabel]"
- Summary:
  - Rows: X data rows
  - Columns: Y columns
  - Mapped fields: Z/Y columns mapped
  - Validation: All cells valid ✓
- Warning: "Once confirmed, this table becomes read-only. You cannot edit cells or delete rows."
- Checkbox: "I understand this table will be locked after confirmation"
- Actions: [Cancel] [Confirm Table]

On Confirm:
- POST /tables/:id/confirm
- Update UI:
  - Status badge: Draft → Confirmed (green)
  - Disable all inputs (cells, row delete, column mapping)
  - Show read-only indicator: "🔒 Table confirmed on [date] by [user]"
  - Remove "Confirm Table" button
- Show success toast: "Table confirmed successfully"

Read-Only Mode:
- All cells display as plain text (no input fields)
- No row checkboxes (cannot delete)
- Column headers show mapped field (no dropdown)
- Hover cells: Show tooltip "Table is locked (confirmed)"
- Export button enabled: "Export to CSV" (downloads table data)

**Milestone 8.7.7: Multiple Tables Support**

NEW COMPONENT: `TableListPanel` (apps/web/app/components/tables/TableListPanel.tsx)

Display:
- Review page sidebar: "Tables (N)" section
- Collapsible list of tables (collapsed by default)
- Each table card shows:
  - Table label or "Table #N" if no label
  - Dimensions: "X rows × Y columns"
  - Status badge: Draft (yellow) / Confirmed (green)
  - Validation indicator: "X errors" (red) or "All valid" (green)
  - Actions: [Open] [Delete] (delete only for draft tables)

Interactions:
- Click [Open] → Loads table in Table Editor Panel (replaces Field Assignment Panel)
- Click [Delete] → Confirmation modal: "Delete table '[label]'? This cannot be undone."
- Create new table → Button: "+ Create Table" (opens Table Creation Modal)
- Switch between tables → Changes editor panel content, preserves scroll position

Independent Confirmation:
- Each table has its own status (draft/confirmed)
- Confirming one table does NOT confirm others
- Baseline can have mix: Table 1 (confirmed) + Table 2 (draft)
- Baseline confirmation (Milestone 8.6.6) requires ALL tables confirmed
- If any table has status='draft': Baseline confirmation blocked
- Error message: "Cannot confirm baseline: Table 'Line Items' is not confirmed"

**Milestone 8.7.8: Table Data Utilization**

EXTEND: `UtilizationTrackingService` (from v8.6 Milestone 8.6.13)

New Method:
`markTableUtilized(tableId, type, metadata)`
- Marks baseline as utilized (same rules as v8.6)
- Logs which table was used: { tableId, utilizationType, recordId }
- Sets baseline.utilized_at, baseline.utilization_type

Utilization Categories (same as v8.6):
- **Category A (Authoritative record)**: Table data used to create permanent record
  - Example: Line items inserted into `invoice_line_items` table
  - Locks: Entire baseline (including this table and all other tables)
- **Category B (Workflow approval)**: Table data used in approval decision
  - Example: Loan summary reviewed and approved by manager
  - Locks: Entire baseline
- **Category C (Data export)**: Table data exported externally
  - Example: Table exported to CSV and sent to accounting system
  - Locks: Entire baseline (redo allowed after archival)

UI Changes:
- Baseline utilization indicator (from v8.6) now shows table info:
  - "⚠️ Table 'Line Items' used to create 12 invoice records"
  - Click → Modal with details: Which table, which records, when, by whom
- Table Editor: If baseline utilized, show banner:
  - "🔒 This baseline is locked. Table data was used for [utilizationType]."
  - All table interactions disabled (cell edit, row delete, column mapping)
- Table List Panel: Utilized tables show lock icon 🔒

Backend Enforcement:
- All table mutation endpoints check baseline.utilization_type
- If utilized: Return 403 with error message
- Viewing table data always allowed (read-only access)

**v8.7 Cross-Cutting Concerns**

**Performance Requirements:**

Table Operations:
- Create table: < 500ms for 100 rows × 10 columns (1000 cell inserts)
- Load table: < 300ms for 100 rows × 10 columns (single query with JOIN)
- Update cell: < 100ms (single UPDATE + validation)
- Bulk validation (all cells in column): < 1s for 1000 cells
- Virtual scrolling: Render only visible rows (50 rows buffer), infinite scroll for 1000+ rows

Grid Rendering:
- Initial render: < 500ms for 100 visible rows
- Scroll performance: 60 FPS (16ms per frame)
- Cell edit response: < 50ms (optimistic update, background save)

**Security Considerations:**

SQL Injection Prevention:
- All cell values: Parameterized queries (NEVER string interpolation)
- Dynamic row/column queries: Whitelist-validated indexes (integers only)

XSS Prevention:
- Cell values: HTML-escaped before rendering in grid
- Table labels: Sanitized (strip <script>, <iframe>, event handlers)

Data Validation:
- Max table size: 1000 rows × 50 columns (50,000 cells hard limit)
- Cell value max length: 5000 characters
- Table label max length: 255 characters

Authorization:
- All table endpoints: Verify user owns baseline
- Column mapping: Verify field exists in field_library (prevent injection)
- Utilization tracking: Only system services can mark utilized

**Testing Strategy:**

Unit Tests:
- TableManagementService: Test create, update, delete, confirm operations
- FieldAssignmentValidator: Test bulk validation (all character_types)
- Cell validation: Edge cases (empty, null, max length, special characters)

Integration Tests:
- Table lifecycle: Create → Map columns → Edit cells → Confirm → Utilize → Lock
- Multiple tables: Create 3 tables → Confirm 2 → Confirm baseline (should fail)
- Concurrent edits: Two users editing different cells in same table (optimistic locking)

E2E Tests:
1. Create table from selection → Map columns → Fix validation errors → Confirm
2. Create 2 tables → Confirm table 1 → Edit table 2 → Confirm table 2 → Confirm baseline
3. Confirm table → Utilize (export CSV) → Attempt edit (should fail with 403)
4. Delete row → Verify renumbering → Confirm table → Export (verify row counts match)

**Status**
📋 Planned (not started)

---

## v8.8 — ML-Assisted Field Suggestions ✅ (Complete)

**What this is**
- ML-based field-to-text matching suggestions using Sentence-BERT
- Rule-based table detection suggestions (explicit user trigger)
- Confidence scoring (High/Medium/Low)
- Explicit accept/modify/clear workflows
- No auto-application (suggestions only)

**What this is not**
- ❌ Not automatic field assignment (user must accept suggestions)
- ❌ Not automatic table creation (ML suggests, user converts)
- ❌ Not required (manual workflow works without ML)
- ❌ Not training/learning (that's v8.9)

**Design Intent**
Provide ML assistance to speed up field and table workflows while preserving explicit user control, auditability, and graceful degradation.

**Dependencies**
- **REQUIRES:** v8.6 (baseline_field_assignments table must exist)
- **REQUIRES:** v8.7 (baseline_tables for table detection suggestions)
- **NEW INFRASTRUCTURE:** `apps/ml-service/` FastAPI microservice (Sentence-BERT)

**Key Principles**
- **Suggestions, not automation** - ML suggests, user decides
- **Non-blocking UI** - Suggestions appear inline in review UI
- **Graceful degradation** - System works without ML (if ml-service down)
- **Audit trail** - Track suggestion generation and user actions

**Architecture**

**ML Service Infrastructure:**
- NEW microservice: `apps/ml-service/` (FastAPI + Sentence-BERT)
- Model: `all-MiniLM-L6-v2` (open source, Apache 2.0 license)
- Backend network only (not exposed to internet)
- Deterministic, request/response inference (no background automation)

**Database Schema:**
- `ml_model_versions`: id, modelName, version, filePath, metrics (JSON), trainedAt, isActive, createdBy
  - Tracks ML model versions for auditability
- Extend `baseline_field_assignments`:
  - `suggestionConfidence` DECIMAL(3,2) (0.00-1.00)
  - `suggestionAccepted` BOOLEAN (true=accepted, false=modified/rejected, null=manual)
  - `modelVersionId` FK to ml_model_versions
- `ml_table_suggestions`: id, attachmentId, regionId, rowCount, columnCount, confidence, boundingBox (JSON), cellMapping (JSON), status (pending/ignored/converted), suggestedAt, ignoredAt, convertedAt
  - Tracks table detection suggestions

**Capability A: Field Suggestion Workflow**
1. User opens review page
2. User clicks **Get Suggestions** (explicit action)
3. ML service:
   - Embeds extracted text segments and field labels
   - Computes cosine similarity and token-overlap boost
   - Returns top matches with confidence (threshold default 0.50)
4. Backend writes assignments with suggestion metadata (no overwrite of manual values)
5. UI renders suggested values with badges:
   - **High (>= 0.80)**: Green
   - **Medium (0.60-0.79)**: Orange
   - **Low (0.50-0.59)**: Gray
6. User actions:
   - **Accept**: `suggestionAccepted = true`
   - **Modify**: requires correction reason when baseline is reviewed, sets `suggestionAccepted = false` + `correctedFrom`
   - **Clear**: requires reason when baseline is reviewed, deletes assignment and logs rejection metadata

**Capability B: Table Detection Workflow**
1. User opens review page → Tables tab
2. User clicks **Get Suggestions** (explicit action; no auto-trigger)
3. ML service (rule-based heuristics) analyzes OCR segments:
   - Row grouping + column alignment
   - Spacing consistency + grid validation
4. Suggestions show inline at top of Tables tab (blue background)
5. Actions:
   - **Preview**: modal grid with confidence + row/column counts
   - **Convert to Table**: creates draft table, opens editor, marks suggestion `converted`
   - **Ignore**: marks suggestion `ignored`

**What ML Suggests:**
- Field-to-text matches (which segment matches which field)
- Table regions (which segments form a structured grid)
- Column boundaries (where columns start/end)
- Row boundaries (which segments belong to same row)
- Header rows (likely column headers)

**What ML Does NOT Do:**
- ❌ Auto-assign fields (user must accept)
- ❌ Auto-create tables (user must convert)
- ❌ Auto-map columns to fields (user assigns in Table Editor)
- ❌ Auto-confirm data (user must explicitly confirm)

**Error Handling:**
- If ml-service is down: Return empty suggestions, show message "Suggestions unavailable. Continue with manual assignment."
- If ml-service times out: Log error, return empty array
- System never blocks on ML failures (graceful degradation)

**Governance Alignment**
- **Explicit Intent:** User must click "Get Suggestions" (not automatic on page load for fields)
- **Non-blocking:** Table detection banner can be dismissed
- **Auditability:** Track suggestion acceptance, modification, rejection with model version
- **No auto-mutation:** Suggestions are annotations until user accepts/converts

**Milestones (11 total):**

**Capability A: ML Service Infrastructure (5 milestones)**
- **8.8.1** - ML Data Model & Schema (extend tables for ML tracking)
- **8.8.2** - ML Service Container Setup (FastAPI + Sentence-BERT)
- **8.8.3** - Semantic Similarity Matching Service (field-to-text inference)
- **8.8.4** - ML Client Service (NestJS HTTP client)
- **8.8.5** - Suggestion API Endpoint (apply suggestions to baseline)

**Capability B: Field Suggestion Application (3 milestones)**

**Milestone 8.8.6: Suggestion Trigger UI**

NEW COMPONENT: `SuggestionTrigger` (apps/web/app/components/suggestions/SuggestionTrigger.tsx)

Location:
- Review page (/attachments/:id/review) - Field Assignment Panel header
- Positioned next to baseline status badge

UI Elements:
- Button: "✨ Get Suggestions" (primary blue, sparkle icon)
- Loading state: "Generating suggestions..." (disabled, spinner animation)
- Success state: "Suggestions applied ✓" (green checkmark, 2s timeout)
- Error state: "Suggestions unavailable" (red, show retry button)

Behavior:
- Click → POST /baselines/:id/suggestions/generate
- Request payload: { baselineId, modelVersion: 'latest' }
- Response: { suggestedAssignments: FieldAssignment[], confidence: number }
- On success:
  - Apply suggestions to Field Assignment Panel (pre-fill fields with values)
  - Add confidence badges to each suggested field (High/Medium/Low)
  - Enable accept/modify/clear actions (Milestone 8.8.8)
  - Show toast: "X field suggestions generated"
- On error (ml-service down):
  - Show error message: "Suggestion service temporarily unavailable. Continue with manual assignment."
  - Button text: "Retry Suggestions"
  - Manual workflow remains available (system not blocked)

Grace Period (First-Time UX):
- First time user opens review page: Button shows tooltip
- Tooltip: "ML can suggest field matches. Click to try!" (auto-dismiss after 5s)
- Tooltip shown once per user (localStorage: suggestions_tooltip_shown)

**Milestone 8.8.7: Suggestion Display + Badges**

NEW COMPONENT: `SuggestedFieldInput` (apps/web/app/components/suggestions/SuggestedFieldInput.tsx)

Extends: FieldInput component (from v8.6 Milestone 8.6.12)

Visual Changes:
- Pre-filled value: Text shown in lighter gray (not black) to indicate suggestion
- Confidence badge: Pill-shaped badge next to field label
  - **High (>= 0.80)**: Green pill "High confidence" + green border on input
  - **Medium (0.60-0.79)**: Yellow pill "Medium confidence" + yellow border on input
  - **Low (0.50-0.59)**: Red pill "Low confidence" + red border on input
- Suggestion source: Small text below input "Suggested from: [segment text, truncated to 30 chars]"
- Hover behavior: Tooltip shows full extracted text segment + confidence score (e.g., "0.87")

Interaction States:
1. **Initial (suggested)**: Gray text, colored border, badge visible
2. **Accepted**: Text turns black, green checkmark icon appears, badge remains
3. **Modified**: User edits value → triggers correction reason modal (Milestone 8.8.8)
4. **Cleared**: User deletes value → triggers clear reason modal (Milestone 8.8.8)

Batch Suggestion Indicator:
- Panel header shows: "X of Y fields auto-suggested" (e.g., "12 of 20 fields")
- Progress bar: Green (accepted) / Yellow (pending) / Red (modified/cleared)
- Click progress bar → Filter panel to show only suggested fields

**Milestone 8.8.8: Accept/Modify/Clear Actions**

NEW COMPONENT: `SuggestionActionModal` (apps/web/app/components/suggestions/SuggestionActionModal.tsx)

Action Flows:

**Accept Suggestion:**
- User does NOT edit pre-filled value
- User clicks "Accept" button (appears next to suggested fields)
- No modal required (implicit acceptance)
- Backend: POST /baselines/:id/assignments with { suggestionAccepted: true }
- UI updates:
  - Green checkmark icon appears
  - Border color: Gray (neutral, suggestion consumed)
  - Badge remains visible for audit trail
  - Field added to "accepted" count

**Modify Suggestion:**
- User edits pre-filled value (onChange event)
- On blur: Modal appears
- Modal title: "Why are you changing this suggestion?"
- Modal content:
  - Original suggestion: "[value]" (High confidence)
  - Your value: "[new value]"
  - Reason dropdown: Pre-defined options + "Other"
    - "OCR error in source text"
    - "Wrong field match (should be different field)"
    - "Formatting preference (e.g., uppercase)"
    - "Partial match (missing info)"
    - "Other (explain below)"
  - Text area: Correction reason (required if "Other" selected, min 10 chars)
- Actions: [Cancel] [Save Correction]
- Backend: POST /baselines/:id/assignments with:
  ```json
  {
    "fieldKey": "invoice_number",
    "assignedValue": "INV-2024-001",
    "correctedFrom": "INV2024001",
    "correctionReason": "Formatting preference (added dashes)",
    "suggestionAccepted": false,
    "suggestionConfidence": 0.85,
    "modelVersionId": "uuid"
  }
  ```
- UI updates:
  - Badge color: Orange "Modified"
  - Text turns black
  - Shows correction icon (pencil with checkmark)

**Clear Suggestion:**
- User deletes value entirely (backspace or clear button)
- On blur: Modal appears
- Modal title: "Why are you removing this suggestion?"
- Modal content:
  - Suggested value: "[value]" (High confidence)
  - Reason dropdown:
    - "Incorrect field match"
    - "Field not applicable to this document"
    - "Duplicate field (already assigned elsewhere)"
    - "Other (explain below)"
  - Text area: Reason (required if "Other", min 10 chars)
- Actions: [Cancel] [Clear Field]
- Backend: DELETE /baselines/:id/assignments/:fieldKey with body:
  ```json
  {
    "reason": "Field not applicable to this document",
    "suggestionRejected": true,
    "suggestionConfidence": 0.72,
    "modelVersionId": "uuid"
  }
  ```
- UI updates:
  - Field empty
  - Badge removed
  - Shows "cleared" in audit log

Batch Actions (Enhancement):
- Select multiple suggested fields (checkboxes)
- Bulk actions:
  - "Accept All Selected" → Accepts all without modals
  - "Clear All Selected" → Requires single reason (applies to all)
- Max selection: 20 fields at once
- Progress indicator: "Accepting 12 of 20 fields..." (sequential API calls)

**Capability C: Table Detection & Suggestion (3 milestones)**

**Milestone 8.8.9: Table Detection Model**

NEW SERVICE: ML Table Detection (apps/ml-service/detection/table_detector.py)

Algorithm: Rule-Based + Heuristics (no ML training required for v8.8)

Input:
- `extracted_text_segments`: List of segments with { text, boundingBox, confidence }
- `threshold`: Minimum confidence for table detection (default 0.60)

Detection Steps:

1. **Grid Pattern Analysis**
   - Group segments by vertical position (± 5px tolerance)
   - Identify potential rows: Groups with >= 2 segments at same Y-coordinate
   - Calculate average horizontal spacing between segments
   - Identify potential columns: Vertical alignment across rows (± 10px tolerance)

2. **Spacing Consistency Check**
   - Measure column gap consistency: Coefficient of variation < 0.3 (30% variance allowed)
   - Measure row height consistency: Standard deviation < 10px
   - If inconsistent: Reduce confidence score by 0.2

3. **Header Row Detection**
   - First row analysis: Check for bold text, larger font, or underline (from OCR metadata)
   - Keyword matching: ["Item", "Description", "Qty", "Amount", "Total", "Date", "Invoice"]
   - If header detected: Increase confidence by 0.15

4. **Cell Boundary Detection**
   - Column boundaries: Midpoint between adjacent segments
   - Row boundaries: Average vertical spacing / 2
   - Cell assignment: Each segment assigned to nearest cell (Euclidean distance)

5. **Confidence Calculation**
   ```python
   base_confidence = 0.5
   + (grid_regularity_score * 0.2)  # 0-1 based on spacing consistency
   + (header_detected * 0.15)        # Binary: 0 or 0.15
   + (min_rows_met * 0.1)            # >= 3 rows → 0.1
   + (min_cols_met * 0.05)           # >= 2 cols → 0.05
   = final_confidence (0-1.0)
   ```

Output:
```json
{
  "tableDetected": true,
  "confidence": 0.75,
  "rowCount": 5,
  "columnCount": 3,
  "boundingBox": { "x1": 50, "y1": 100, "x2": 550, "y2": 300 },
  "cells": [
    { "rowIndex": 0, "columnIndex": 0, "segmentId": "uuid", "text": "Item" },
    { "rowIndex": 0, "columnIndex": 1, "segmentId": "uuid", "text": "Quantity" }
  ],
  "headerRowIndex": 0,
  "suggestedLabel": "Line Items"  // Based on header keywords
}
```

False Positive Prevention:
- Reject if row count < 2 (not a table, just aligned text)
- Reject if column count < 2 (single column is a list, not a table)
- Reject if confidence < 0.60 (too ambiguous)

**Milestone 8.8.10: Table Detection API Integration**

NEW ENDPOINT: POST /ml/detect-tables (apps/ml-service/routes.py)

Request:
```json
{
  "attachmentId": "uuid",
  "segments": [
    { "id": "uuid", "text": "Item", "boundingBox": { "x1": 50, "y1": 100, "x2": 100, "y2": 120 }, "confidence": 0.95 }
  ],
  "threshold": 0.60  // Optional, default 0.60
}
```

Response:
```json
{
  "tables": [
    {
      "id": "ml-table-suggestion-uuid",
      "confidence": 0.75,
      "rowCount": 5,
      "columnCount": 3,
      "boundingBox": { "x1": 50, "y1": 100, "x2": 550, "y2": 300 },
      "cells": [...],
      "suggestedLabel": "Line Items"
    }
  ],
  "processingTime": 234  // milliseconds
}
```

Backend Integration: `TableSuggestionService` (apps/api/src/ml/table-suggestion.service.ts)

Methods:

`detectTables(attachmentId, userId)`
- Fetches extracted_text_segments for attachment
- Calls ml-service POST /ml/detect-tables
- Persists suggestions to ml_table_suggestions table
- Returns: { suggestions: TableSuggestion[] }

`ignoreSuggestion(suggestionId, userId)`
- Updates ml_table_suggestions.status = 'ignored'
- Sets ignoredAt timestamp
- Logs audit event: { action: 'ignore_table_suggestion', suggestionId, userId }

`convertSuggestionToTable(suggestionId, baselineId, userId)`
- Validates: Baseline must exist and be in draft/reviewed state
- Creates baseline_tables entry (from v8.7 Milestone 8.7.1)
- Creates baseline_table_cells entries (from suggestion.cells)
- Updates ml_table_suggestions.status = 'converted', convertedAt timestamp
- Returns: { tableId, redirectUrl: `/tables/${tableId}` }

NEW DATABASE TABLE: `ml_table_suggestions`
- id: UUID PRIMARY KEY
- attachmentId: FK to attachments
- regionId: VARCHAR(255) (identifier for detected table region, e.g., "region-1")
- rowCount: INT
- columnCount: INT
- confidence: DECIMAL(3,2) (0.00-1.00)
- boundingBox: JSON ({ x1, y1, x2, y2 })
- cellMapping: JSON (array of { rowIndex, columnIndex, segmentId, text })
- suggestedLabel: VARCHAR(255) NULLABLE
- status: ENUM('pending', 'ignored', 'converted') DEFAULT 'pending'
- suggestedAt: TIMESTAMP DEFAULT NOW()
- ignoredAt: TIMESTAMP NULLABLE
- convertedAt: TIMESTAMP NULLABLE
- INDEX(attachmentId, status) for fast queries

**Milestone 8.8.11: Table Suggestion Banner UI**

NEW COMPONENT: `TableSuggestionBanner` (apps/web/app/components/suggestions/TableSuggestionBanner.tsx)

Location:
- Review page - Above Field Assignment Panel
- Non-blocking: Does not interrupt user workflow
- Dismissible: User can close banner without taking action

Layout:
- Full-width banner (100% of panel width)
- Light blue background (#EFF6FF) with blue left border (4px, #3B82F6)
- Icon: Table icon (grid symbol) 24×24px
- Content layout: Icon | Message | Actions (horizontal flex)

Message Content:
- Primary text: "Detected a structured grid: [suggestedLabel] ([rowCount] rows × [columnCount] columns)"
- Confidence indicator: Badge with "High" / "Medium" / "Low" (same as field suggestions)
- Secondary text: "This may be easier to review as a table."

Actions:
- **[Preview]** - Primary button (blue)
- **[Ignore]** - Secondary button (gray text, no border)
- **[X]** - Close icon (top-right corner, same as Ignore but icon-only)

**Preview Modal:**
- Modal title: "Table Preview: [suggestedLabel]"
- Content:
  - Grid preview (read-only, rendered with simplified table component)
  - Shows first 10 rows (if more, show "...and X more rows")
  - Column headers highlighted (if headerRowIndex detected)
  - Dimensions: "[rowCount] rows × [columnCount] columns"
  - Confidence: Badge with score (e.g., "75% confidence")
- Actions:
  - [Convert to Table] - Primary button
  - [Cancel] - Secondary button

On "Convert to Table":
- POST /ml/table-suggestions/:id/convert
- Redirects to Table Editor (v8.7 Milestone 8.7.5)
- Banner disappears
- Show toast: "Table created from suggestion. Review and map columns."

On "Ignore" or [X]:
- POST /ml/table-suggestions/:id/ignore
- Banner slides up and disappears (300ms animation)
- Suggestion status → 'ignored'
- Does not reappear on page reload

Multiple Table Suggestions:
- If multiple tables detected: Show stacked banners (max 3 visible)
- If > 3 tables: Show "...and X more table suggestions" with [View All] link
- Each banner independently dismissible
- Banners ordered by confidence (highest first)

Auto-Trigger Behavior:
- Table detection runs automatically on review page load (background)
- Banner appears 2 seconds after page load (non-blocking delay)
- If ml-service fails: No banner shown (graceful degradation)
- Banner only shown if confidence >= 0.60

**v8.8 Cross-Cutting Concerns**

**Performance Requirements:**

ML Inference:
- Field suggestions: < 2s for 50 fields (embedding + similarity computation)
- Table detection: < 1s for 500 text segments
- Batch processing: Max 10 attachments queued (rate limiting)

API Response Times:
- POST /baselines/:id/suggestions/generate: < 3s (includes ML inference + DB write)
- POST /ml/detect-tables: < 1.5s
- GET /ml/table-suggestions/:attachmentId: < 200ms (cached results)

UI Responsiveness:
- Suggestion button click → Loading state: < 50ms
- Pre-fill suggested values: < 300ms for 50 fields (batch UI update)
- Banner appearance: 2s delay (configurable via feature flag)

**Error Handling:**

ML Service Failures:
- Connection timeout (5s): Show "Suggestions unavailable" message
- HTTP 500 from ml-service: Log error, show retry button
- Model loading error: Fallback to manual workflow (no suggestions)
- Invalid embeddings: Skip failed fields, continue with others

Data Validation:
- Confidence scores: Clamp to 0.0-1.0 range (reject if outside)
- Suggestion acceptance: Validate field exists before saving
- Table cell mapping: Validate rowIndex/columnIndex within bounds

Rate Limiting:
- Max 10 suggestion requests per user per hour
- HTTP 429 response: "Suggestion quota exceeded. Try again in X minutes."
- Admin users: Exempt from rate limiting

**Extension Note**
- v8.8.1 adds pairing, field context, field selection, table enhancements, and eval metrics. No learning or memory is introduced in v8.8.x.


**Security Considerations:**

ML Model Protection:
- ML service: Internal network only (not exposed to internet)
- Model files: Read-only filesystem, no user uploads
- Embeddings: Ephemeral (computed on-demand, not stored in DB)

Data Privacy:
- Text segments: Never sent to external APIs (Sentence-BERT runs locally)
- User corrections: Anonymized before exporting for training (v8.9)
- Suggestion audit trail: Track model version used (for A/B testing)

Input Sanitization:
- Text segments: Max 5000 chars (prevent memory overflow)
- Table detection: Max 1000 segments per request
- Confidence scores: Validated as numeric 0.0-1.0

**Testing Strategy:**

Unit Tests:
- ML Service: Test table detection algorithm with synthetic grid data
- Confidence calculation: Test edge cases (1 row, 1 column, irregular spacing)
- Suggestion service: Mock ML responses, test acceptance/modification/rejection flows

Integration Tests:
- End-to-end suggestion flow: Request → ML inference → DB persist → UI update
- Error handling: ML service down → Graceful degradation
- Multiple tables: Detect 3 tables → Show 3 banners → Convert one → Ignore others

E2E Tests:
1. Click "Get Suggestions" → Accept all high-confidence → Confirm baseline
2. Click "Get Suggestions" → Modify medium-confidence → Provide reason → Save
3. Table detected → Preview → Convert → Map columns → Confirm table
4. Table detected → Ignore → Banner disappears → Manual field assignment

**Status**
✅ Complete

---

## v8.8.1 — Adaptive Doc Intelligence (Pairing + Field Context + Selection + Table Enhancements + Eval) ✅ (Complete)

**What this is**
- Layout-aware label/value pairing as a derived candidate layer (no mutation of raw segments)
- Field context enrichment for better matching (neighbor text, positional cues, section headers)
- Field selection/ranking to reduce UI noise and improve review throughput
- Table detection enhancement (precision improvements on v8.8 table suggestions)
- Evaluation/monitoring (accept/modify/clear rates, top-1 accuracy, confusion by field)

**What this is not**
- ❌ Not learning or memory (v8.9+)
- ❌ Not auto-assignment or auto-confirm
- ❌ Not background automation

**Design Intent**
Improve suggestion quality and reviewer efficiency without changing governance invariants.

**Dependencies**
- **REQUIRES:** v8.6 (baseline review + validation)
- **REQUIRES:** v8.8 (ML suggestion endpoints + explicit user actions)
- **NO NEW INFRASTRUCTURE** (no vector store, no background jobs)

**Key Principles**
- Derived data only, never authoritative
- Suggestions remain opt-in
- Full provenance for any pairing context (segment IDs, positional metadata)
- No new auto-triggering behavior beyond v8.8’s explicit suggestion flow


**Impact Areas**
- Pairing layer feeds ML suggestion inputs (label/value candidates are derived only)
- Field selection influences what appears in the review panel (toggle "show all" required)
- Table detection enhancements reuse v8.8 ML flow with stricter confidence thresholds
- Evaluation is read‑only metrics from audit logs (no workflow coupling)

**Risks / Governance**
- Pairing heuristics can be wrong. Mitigation: store as candidate with confidence + provenance only.
- Field selection might hide needed fields. Mitigation: explicit “Show all fields” toggle.
- Table false positives. Mitigation: higher thresholds + ignore‑forever per attachment.

**What Was Built**
- Suggestion context schema and provenance surfaced end‑to‑end (API + UI) via `suggestionContext` on baseline assignments.
- Pairing/context pre‑processing in API and ML reranking using `pairCandidates` and `segmentContext`.
- Client‑side paired label/value cards with batch selection and drag‑to‑field using value segment text.
- Top‑N suggested fields default view with explicit “Show all fields” toggle.
- Table detection precision improvements with ignore‑forever filtering.
- Admin metrics endpoint (`/admin/ml/metrics`) and UI (`/admin/ml`) for acceptance/modify/clear rates and top‑1 accuracy.

**Status**
✅ Complete

--- 

## v8.9 — ML Model Training & Fine-Tuning 🚧 (In Progress — partially superseded)

**What this is**

Governed training data export from user corrections, model version registry, hot-swap activation, deterministic A/B testing, assisted auto-learning (volume-triggered, global only), and an admin performance dashboard. All activation remains manual.

**What this is not**

- Not automatic model updates or cron-based retraining
- Not real-time learning
- Not mandatory (manual workflow works without ML)

**Scope Clarification**
- v8.9 builds on v8.8.1 outputs (pairing/context/selection) and does not change v8.8.x invariants.
- Milestones 8.9.1–8.9.3 and 8.9.6 (A1/A2/B1/B2/B3 in plan.md) are confirmed complete.
- Milestones 8.9.7–8.9.11 (C1/C2/D0–D5/E1/E2 in plan.md) are **in progress / not yet complete**.
- Milestones 8.9.4–8.9.5 (SentenceTransformer fine-tuning + model versioning semantics) are superseded by the LayoutLMv3 pipeline introduced in v8.10.

---

**Capability A: Correction Dataset Collection** ✅ Complete (plan.md A1/A2)

**Milestone 8.9.1: Correction Data Schema** ✅ Complete
- Uses `baseline_field_assignments` joined to `extracted_text_segments`, `extraction_baselines`, and `users`.
- Filters: `suggestionConfidence IS NOT NULL` and `sourceSegmentId IS NOT NULL`.
- Export fields: `textSegment`, `suggestedField`, `userAssignedField`, `confidence`, `accepted`, `modelVersionId`, `assignedAt`, `correctionReason`.

**Milestone 8.9.2: Training Data Export API** ✅ Complete
- `GET /admin/ml/training-data` (admin-only, JWT + CSRF + AdminGuard).
- Query params: `startDate`, `endDate` (ISO, required), `minCorrections` (int, default 10).
- Implemented in `apps/api/src/ml/ml-training-data.controller.ts` + `ml-training-data.service.ts`.
- Audit log: `ml.training-data.export` with count, startDate, endDate, filter counts.

**Milestone 8.9.3: Training Data Quality Filters** ✅ Complete
- Typo filter: excludes `correctionReason = 'typo'` (case-insensitive).
- Early-user filter: excludes `assignedAt < users.createdAt + 30 days`.
- Single-user filter: excludes rows where only one distinct user corrected the same `(fieldKey, normalizedSegmentText)` pair.
- If filtered count < `minCorrections`: returns 400 with `code="insufficient_corrections"`.

---

**Capability B: Model Registry & Activation** ✅ Complete (plan.md B1/B2/B3)

**Milestone 8.9.6: Model Deployment (Hot Swap)** ✅ Complete
- `POST /ml/models/activate` in `apps/ml-service/main.py`.
- Loads model from `filePath`, runs warm-up, swaps active only on success.
- Rollback to prior model on load failure.
- `ModelRegistry` singleton in `apps/ml-service/model_registry.py`.
- Audit: `ml.model.activate.success` / `ml.model.activate.failed`.

**Model Version Admin API** ✅ Complete
- `POST /admin/ml/models` — register model version (isActive=false by default).
- `GET /admin/ml/models` — list all versions sorted by trainedAt desc.
- `POST /admin/ml/models/activate` — transactionally swaps isActive, calls ML service.
- Implemented in `apps/api/src/ml/ml-models.controller.ts` + `ml-models.service.ts`.

---

**Capability B (fine-tuning): Model Fine-Tuning Pipeline** ❌ Superseded

**Milestone 8.9.4: Fine-Tuning Script (Python)** ❌ Superseded
- Original plan: fine-tune Sentence-BERT (`all-MiniLM-L6-v2`) on text-pair correction data.
- **Superseded by:** LayoutLMv3 fine-tuning pipeline in `training-worker` container (v8.10). LayoutLMv3 requires token sequences with bounding-box coordinates and zone labels, not text pairs.
- Scripts `training/finetune.py` and `training/generate_synthetic.py` should not be built; replaced by the v8.10 training-worker.

**Milestone 8.9.5: Model Versioning semantics** ❌ Superseded (table exists, semantics amended)
- `ml_model_versions` table is built and in production.
- `modelName: 'sentence-bert-field-matching'` is superseded; new canonical name is `'layoutlmv3-extraction'`.
- `metrics` JSON schema extended to include per-field F1 and zone accuracy.
- `filePath` now points to a HuggingFace checkpoint directory, not an ONNX file.
- See v8.10 for full amendment.

---

**Capability C: A/B Testing & Suggestion Tracking** ✅ Complete (plan.md C1/C2)

**Milestone 8.9.7: Deterministic A/B Model Selection** ✅ Complete (2026-02-22, plan.md C1)
- Env flag `ML_MODEL_AB_TEST=true`.
- Deterministic 50/50 routing by stable hash of `baselineId % 2`.
- Resolves active model as A, most recent inactive as B.
- Files: `apps/api/src/ml/field-suggestion.service.ts`, `ml.service.ts`.
- Audit fields: `abGroup`, `modelVersionId`, `modelVersion`.

**Milestone 8.9.8: Suggestion Outcome Tracking Integrity** ✅ Complete (2026-02-23, plan.md C2)
- API DTOs pass `suggestionAccepted` and `modelVersionId` through correctly.
- Frontend sends correct flags for accept/modify/clear.
- Files: `baseline-assignments.service.ts`, `assign-baseline-field.dto.ts`, `delete-assignment.dto.ts`, review page.

---

**Capability D: Training Pipeline** 🚧 Partially complete / partially superseded

> D3 complete. D4 dropped by SLM+RAG pivot (ADR 2026-02-24). D5 revised to online-gate-only.

**Milestone 8.9.9: Synthetic Training Data Generator** ❌ Superseded — replaced by v8.10 seed corpus (L6)

**Milestone 8.9.10: Fine-Tuning Script** ❌ Superseded — dropped by SLM+RAG pivot; no fine-tuning pipeline

**Milestone 8.9.11: Register Trained Model Metadata** 📋 Deferred — no fine-tuning output to register under SLM+RAG architecture

**Milestone 8.9.12: Global Volume Trigger + Job State** ✅ Complete (2026-02-23, plan.md D3)
- Trigger: `qualified_corrections_since_last_success >= 1000` (global only, no per-user triggers).
- Tables: `ml_training_jobs`, `ml_training_state` singleton.
- Automation service polls every `ML_TRAINING_POLL_MS` when `ML_TRAINING_ASSISTED=true`.
- Files: `ml-training-automation.service.ts`, `ml-training-jobs.service.ts`, `ml-training-jobs.controller.ts`.

**Milestone 8.9.13: Assisted Training Run + Auto-Register Candidate** ❌ Superseded — dropped by SLM+RAG pivot (ADR 2026-02-24). RAG learning loop (v8.10 M1) replaces this.

**Milestone 8.9.14: Activation Gates** 🔄 Revised (plan.md D5)
- ~~Offline gate~~ — dropped by SLM+RAG pivot.
- **Online gate only:** candidate must beat active by ≥5% acceptance delta with ≥1000 suggestions.
- Activation remains explicit admin action only; UI disables Activate button until gate met.

---

**Capability E: Performance Dashboard** 📋 Not yet complete (plan.md E1/E2)

**Milestone 8.9.15: Performance API** 📋 Planned (plan.md E1)
- `GET /admin/ml/performance` — per-model acceptance rates, 12-week trends, recommendation signal.
- Files: `ml-performance.controller.ts`, `ml-performance.service.ts`.

**Milestone 8.9.16: Admin Performance UI** 📋 Planned (plan.md E2)
- Route: `/admin/ml/performance`.
- Summary cards, model table, 12-week trend chart, Activate button (gated by D5 online gate).
- File: `apps/web/app/admin/ml/performance/page.tsx`.

**Status**
🚧 In Progress — A1/A2/B1/B2/B3/C1/C2/D3 complete. D4 dropped (SLM+RAG pivot). D5 revised (online gate only). E1/E2 pending.




## v8.10 — Optimal Extraction Accuracy 🚧 (In Progress — SLM+RAG pivot applied 2026-02-24)

**Pivot note:** Original v8.10 planned LayoutLMv3 + fine-tuning pipeline. ADR 2026-02-24 replaced LayoutLMv3 inference with Qwen 2.5 1.5B via Ollama + pgvector RAG few-shot injection. Fine-tuning pipeline (training-worker, L2/L3/L5, D4) dropped entirely. All deterministic post-processing (zone classifier, DSPP, type validation, normalization, conflict detection, math reconciliation) preserved unchanged.

**What this is**

- PyMuPDF for PDF ingestion: auto-detect image-based vs text-based pages; use text layer directly for digital PDFs, route scanned pages through OpenCV preprocessing ✅ Built
- Dedicated `preprocessor` container: OpenCV deskew, orientation correction, shadow removal, contrast enhancement, quality gate ✅ Built
- Zone classifier: assigns document regions to `header`, `addresses`, `line_items`, `instructions`, `footer` ✅ Built
- Qwen 2.5 1.5B via Ollama (replacing LayoutLMv3): grammar-constrained JSON extraction with structured output schema; all fields nullable to prevent hallucination ✅ Built (I1)
- pgvector RAG: top-3 confirmed baselines retrieved by cosine similarity and injected as few-shot examples before each SLM call 🔄 In progress (F3 ✅ / M2/M4 pending)
- Embed-on-confirm learning loop: qualifying baselines embedded with nomic-embed-text and stored in `baseline_embeddings`; no GPU training required 📋 Pending (M1)
- Seed corpus: 5–10 synthetic gold-standard examples per document type bootstrap the RAG corpus at cold start 📋 Pending (L6)
- Per-field confidence scoring: hard overrides (math reconciliation, type validation, conflict detection) + RAG-agreement fallback formula; auto-confirm / verify / flag tiers 📋 Pending (J1)
- Verification UI: side-by-side PDF viewer + extracted fields; PDF auto-scrolls to flagged field region; confidence-driven highlighting; bulk confirm and keyboard flow 📋 Pending (K1/K2)

**What this is not**

- ❌ Not automatic field assignment (user must accept suggestions)
- ❌ Not background automation (activation remains manual)
- ❌ Not a replacement of the review/correction governance model from v8.6–v8.9
- ❌ Not GPU training or fine-tuning — the RAG corpus self-improves on each confirmed baseline
- ❌ Not LayoutLMv3 — that architecture was replaced by the SLM+RAG pivot

**Design Intent**

Maximise extraction accuracy on both scanned and digital documents using a locally-running small language model guided by retrieved few-shot context, while preserving all governance invariants (explicit intent, auditability, backend authority). The RAG learning loop means the system improves on every confirmed baseline without requiring GPU compute or fine-tuning cycles.

**Dependencies**
- **REQUIRES:** v8.6 (baseline_field_assignments, field_library)
- **REQUIRES:** v8.9 (ml_model_versions, model registry, A/B routing infrastructure)
- **AMENDS:** v8.9 model architecture (Ollama/Qwen replaces all-MiniLM-L6-v2)
- **NEW CONTAINERS:** `preprocessor` ✅, `ollama` (new), amended `ml-service`
- **DECOMMISSIONED:** `training-worker` (to be removed after M4 verified)

---

### Schema Changes

**NEW TABLE: `document_types`** ✅ Built (F1)
- `id` uuid pk, `name` varchar unique, `description` text nullable, `createdAt` timestamp

**NEW TABLE: `document_type_fields`** ✅ Built (F1)
- `id` uuid pk, `documentTypeId` fk document_types, `fieldKey` fk field_library.fieldKey, `required` boolean default false, `zoneHint` text nullable (role hints e.g. `role:subtotal`), `sortOrder` int, `createdAt` timestamp
- UNIQUE(documentTypeId, fieldKey)

**NEW TABLE: `extraction_training_examples`** ✅ Built (F1)
- `id` uuid pk, `baselineId` fk extraction_baselines, `fieldKey` fk field_library.fieldKey, `assignedValue` text, `zone` text nullable, `boundingBox` jsonb nullable, `extractionMethod` text, `confidence` decimal(5,4) nullable, `isSynthetic` boolean default false, `createdAt` timestamp
- Purpose: append-only spatial ground truth; populated by L4 on assignment

**NEW TABLE: `extraction_models`** ✅ Built (F1)
- `id` uuid pk, `modelName` text, `architecture` text, `version` text, `filePath` text, `documentTypeId` fk nullable, `metrics` jsonb, `trainedAt` timestamp, `isActive` boolean, `createdAt` timestamp

**NEW TABLE: `training_runs`** ✅ Built (F1)

**NEW TABLE: `baseline_embeddings`** ✅ Built (F3)
- `id` uuid pk, `baseline_id` uuid fk extraction_baselines, `document_type_id` uuid fk document_types, `embedding vector(768)` (nomic-embed-text output dimension), `serialized_text` text, `confirmed_fields` jsonb, `is_synthetic` boolean default false, `gold_standard` boolean default false, `quality_gate` text (`'math_pass'`|`'zero_corrections'`|`'admin'`), `created_at` timestamp
- ivfflat index on embedding (cosine ops, lists=100)

**AMEND `baseline_field_assignments`** ✅ Built (F2):
- `confidence_score` decimal(5,4) nullable — composite score (math/RAG/OCR signals)
- `zone` text nullable — zone classifier output
- `bounding_box` jsonb nullable — source bbox normalised 0–1000
- `extraction_method` text nullable — e.g. `'qwen-1.5b-rag'`, `'manual'`
- `llm_reviewed` boolean nullable
- `llm_reasoning` jsonb nullable — structured inference trace: `{rawOcrConfidence, modelConfidence, zone, dsppApplied, dsppTransforms, validationOverride, ragAgreement, ragRetrievedCount, documentTypeScoped, mathReconciliation}`
- `normalized_value` text nullable — I4 type-aware scalar
- `normalization_error` text nullable

**AMEND `attachment_ocr_outputs`** ✅ Built (F2):
- `document_type_id` uuid nullable, `extraction_path` text nullable, `preprocessing_applied` jsonb nullable, `overall_confidence` decimal(5,4) nullable, `processing_duration_ms` int nullable

---

### Capability A — PyMuPDF PDF Ingestion ✅ Complete (H1)

**Milestone 8.10.1: PyMuPDF Integration in OCR Pipeline** ✅ Complete
- Digital PDF pages: `page.get_text('words')` ≥5 words → text layer directly; `extraction_path='text_layer'`.
- Scanned pages: render via `page.get_pixmap(dpi=300)` → preprocessor → PaddleOCR; `extraction_path='ocr_preprocessed'`.
- Fallback: preprocessor quality fail → proceed unprocessed; `extraction_path='ocr_unprocessed'`.

---

### Capability B — OpenCV Preprocessor Container ✅ Complete (G1)

**Milestone 8.10.3: Preprocessor Container Setup** ✅ Complete
- `apps/preprocessor/` — FastAPI, port 6000, backend network only.
- Pipeline: orientation → deskew (Hough, ±45°) → shadow removal (morphological) → CLAHE contrast → quality gate (Laplacian variance < threshold → `{ok: false}`).

---

### Capability C — Ollama Service (new — H2) ✅ Complete (2026-02-24)

**Milestone 8.10.H2: Ollama Service** ✅ Complete (2026-02-24)
- `ollama` service in `docker-compose.yml` on backend network, port 11434, named `ollama_models` volume.
- Entrypoint: pulls `qwen2.5:1.5b` and `nomic-embed-text` on first start; cached in volume.
- Health check: `GET /api/tags` returns both model names.

---

### Capability D — pgvector + RAG Infrastructure (new — F3/M1–M4) 🔄 Partially complete

**Milestone 8.10.F3: pgvector Migration** ✅ Complete (2026-02-24)
- Postgres image → `pgvector/pgvector:pg16`. `CREATE EXTENSION vector`. `baseline_embeddings` table per schema above. ivfflat index.

**Milestone 8.10.M3: Prompt Builder Serialization Endpoint** ✅ Complete (2026-02-24)
- `POST /ml/serialize` on ml-service: converts zone-tagged segments into Phase 2 structured text.
- Reuses `serialize_segments()` from `prompt_builder.py` (built in I1).

**Milestone 8.10.M2: RAG Retrieval Service** 📋 Pending
- Given serialized document text + `document_type_id`: embed with `nomic-embed-text` → cosine similarity query `baseline_embeddings` → top-3 results.
- Graceful degradation: pgvector unavailable → return empty list; never crash.

**Milestone 8.10.M1: Embed-on-Confirm** 📋 Pending
- After baseline confirmed: run quality gate (math pass OR zero corrections OR admin gold).
- If gate passes: serialize confirmed fields (Phase 2 format) → embed with `nomic-embed-text` via Ollama → store in `baseline_embeddings`.
- Volume cap: max 5 per `document_type_id`; oldest non-gold evicted on overflow; gold never evicted.
- Fire-and-forget: embed failure never blocks confirmation.

**Milestone 8.10.M4: Wire RAG into Field Suggestion Flow** 📋 Pending
- `field-suggestion.service.ts`: call M2 before ML request; pass `ragExamples` in request body.
- `baseline.service.ts`: call M1 after `confirmBaseline()` (non-blocking).
- `ragAgreement` re-evaluated post-I4 normalization.

---

### Capability E — SLM Inference via Ollama (I1 rewrite) ✅ Complete (2026-02-24)

**Milestone 8.10.5 (rewrite): Ollama/RAG Orchestrator** ✅ Complete (2026-02-24)
- `apps/ml-service/model.py`: `httpx` POST to `http://ollama:11434/api/generate` with `qwen2.5:1.5b`, grammar-constrained structured output (all fields nullable).
- `apps/ml-service/model_registry.py`: warm-up replaced by `GET /api/tags` health-check ping.
- `apps/ml-service/prompt_builder.py` (new): Phase 2 serialization + prompt assembly.
- Request gains `ragExamples[]`; response per suggestion: `{fieldKey, suggestedValue, zone, boundingBox, extractionMethod: 'qwen-1.5b-rag', rawOcrConfidence, ragAgreement, modelConfidence: null}`.
- Graceful degradation: Ollama unreachable → `{ok: false, error: {code: "model_not_ready"}}`.

**Milestone 8.10.6: Zone Classifier Integration** ✅ Complete (I2)
- Rule-based y-ratio zone assignment; reading-order sort (pageNumber ASC, y ASC, x ASC).
- `zone_classifier.py` in ml-service.

---

### Capability F — Deterministic Post-Processing Pipeline ✅ Complete (I3–I6)

**Milestone 8.10.I3: DSPP + Type Validation + Confidence Scoring** ✅ Complete
- DSPP cleaning (S→5, O→0 etc.) per field type before validation.
- Type validation: currency/date/number → 0.0 on fail.
- Conflicting zones: confidence zeroed on all but highest-confidence occurrence.
- **Updated confidence formula (ADR 2026-02-24):**
  - Hard overrides first: math pass → 1.0; math fail / type fail / conflict → 0.0.
  - Fallback: `clamp(0.65 * ragAgreement + 0.35 * rawOcrConfidence, 0.0, 1.0)` minus 0.10 if dsppApplied.
- `llm_reasoning` sidecar: full causal trace per field.

**Milestone 8.10.I4: Value Normalization Layer** ✅ Complete
- `field-value-normalizer.ts`: currency, date, boolean, number, text normalization.
- Writes `normalized_value` + `normalization_error`; raw `value` preserved.

**Milestone 8.10.I5: Multi-Page Field Conflict Resolution** ✅ Complete
- Same `fieldKey`, different `normalizedValue` across pages → `confidence_score = 0.0` on all occurrences.

**Milestone 8.10.I6: Line-Item Math Reconciliation** ✅ Complete
- `math-reconciliation.service.ts`: sum(line_items) ≈ subtotal; subtotal + tax ≈ total (±0.02).
- Pass → all participating fields `confidence_score = 1.0` (auto_confirm). Fail → 0.0 (flag).

---

### Capability G — Training Data Capture ✅ Complete (L4)

**Milestone 8.10.16: Populate extraction_training_examples** ✅ Complete (2026-02-23)
- Silent append-only insert in `upsertAssignment()` when spatial fields present.

---

### Capability H — Seed Corpus (new — L6) 📋 Pending

**Milestone 8.10.L6: Seed Corpus**
- `seed_corpus/` directory in repo root — one JSON file per document type (5–10 files).
- `apps/api/src/scripts/seed-corpus.ts`: idempotent deploy script; embeds and inserts with `gold_standard=true`, `is_synthetic=true`.

---

### Capability I — Per-Field Confidence Tiers + Verification UI 📋 Pending (J1/K1/K2)

**Milestone 8.10.8: Confidence Tier Logic + Bulk Confirm** 📋 Pending (J1)
- Tiers derived from `confidence_score`: auto_confirm ≥ 0.90, verify ≥ 0.70, flag < 0.70.
- `POST /baselines/:id/suggestions/bulk-confirm` — accepts all auto_confirm-tier fields.

**Milestone 8.10.10: Side-by-Side Verification Layout** 📋 Pending (K1)
- Flattened JSON manifest (`GET /baselines/:id/review-manifest`) — single request; zero-request hover/highlight.
- Left 50%: PDF viewer. Right 50%: `VerificationPanel` + `JumpBar`.
- Spatial ordering; bidirectional hover sync; tier indicators.

**Milestone 8.10.11: Keyboard Flow** 📋 Pending (K2)
- Tab/Enter/Escape/F/Shift+Enter keyboard navigation.

---

### Execution Order (revised for SLM+RAG pivot)

1. F1/F2 schema migrations ✅ Done
2. F3 pgvector migration ✅ Done (2026-02-24)
3. G1 preprocessor container ✅ Done
4. H1 PyMuPDF OCR routing ✅ Done
5. H2 Ollama service ✅ Done (2026-02-24)
6. C1/C2 A/B tracking ✅ Done
7. I1 Ollama/RAG orchestrator rewrite ✅ Done (2026-02-24)
8. I2 Zone classifier ✅ Done
9. I3–I6 post-processing pipeline ✅ Done
10. M3 prompt builder endpoint ✅ Done (2026-02-24)
11. M2 RAG retrieval 📋 (depends F3, H2)
12. M4 wire RAG into suggestion flow 📋 (depends M2, M3, I1)
13. M1 embed-on-confirm 📋 (depends F3, H2, M3)
14. L4 training examples capture ✅ Done
15. L6 seed corpus 📋 (depends I1, F3, H2)
16. J1 confidence tiers + bulk confirm 📋 (depends I3)
17. K1 verification UI layout 📋 (depends J1)
18. K2 keyboard flow 📋 (depends K1)
19. D3 volume trigger ✅ Done
20. D5 activation gate (online only) 📋
21. E1/E2 performance dashboard 📋

---

**Governance Alignment**
- **Explicit Intent:** All field acceptance requires user action; bulk confirm is a separate explicit action; embedding never mutates suggested values
- **Auditability:** Zone, bounding box, extraction method, confidence, RAG trace stored per assignment; embed-on-confirm is append-only; seed corpus is gold-standard only
- **Backend authority:** Tier thresholds configurable server-side; RAG toggle server-side; activation gate server-enforced
- **No background automation:** Embed-on-confirm is post-confirmation hook, not a cron job; volume trigger (D3) is the only scheduled task (already built)

**Status**
🚧 In Progress — F1/F2/G1/H1/H2/C1/C2/D3/F3/I1/I2/I3/I4/I5/I6/L4/M3 complete. M1 (embed-on-confirm), M2 (RAG retrieval), M4 (wire RAG), L6 (seed corpus), J1/K1/K2 (UI), D5 (activation gate), E1/E2 (performance dashboard) pending. Fine-tuning pipeline (L2/L3/L5/D4) dropped by SLM+RAG pivot.

---

## v8.11 — Semantic Search 📋 (Planned)

**Pivot note (ADR 2026-02-24):** The original v8.11 scope included pgvector infrastructure (F3), embed-on-confirm (M1), RAG retrieval (M2/M4), Golden Set (N1), and field similarity check (N2). All of F3/M1–M4 were **pulled into v8.10** as core requirements of the SLM+RAG pivot. N1 (Golden Set gate) was dropped — the D5 activation gate now uses online gate only. N2 (field similarity) deferred to v8.12. v8.11 scope is now limited to semantic search on top of the v8.10 RAG corpus.

**What this is**
- Semantic search over confirmed extraction data using `nomic-embed-text` (already running in Ollama from v8.10)
- Metadata-filtered by document type; results ranked by cosine similarity
- Search UI with document type filter, date range, field value previews

**What this is not**
- Not a new embedding infrastructure — pgvector and Ollama embedding are both live from v8.10
- Not RAG (that is v8.10) — this is user-facing search, not few-shot injection
- Not a replacement for the review/baseline flow

**Tasks**
- S1 — Semantic search endpoint (`GET /search/extractions`) + search UI page

**Capability detail**

*S1 — Semantic Search*
`GET /search/extractions?q=&documentType=&dateFrom=&dateTo=&limit=`. Embed query with `nomic-embed-text` via Ollama. Cosine similarity query on `baseline_embeddings` scoped by `document_type_id` when provided. Response: `{results: [{baselineId, similarity, confirmedAt, fieldPreview[]}]}`. Search UI with filter controls; result cards link to review page.

**Governance Alignment**
- Explicit Intent: Search is read-only; no mutations triggered by search
- Auditability: search queries logged with query hash, filter applied, result count
- Backend authority: similarity threshold and result cap server-side

**REQUIRES:** v8.10 complete. `baseline_embeddings` must have entries (seed corpus from L6 sufficient for initial queries).

**Status**
📋 Planned — depends on v8.10 completion

---

## v8.12 — Self-Correcting Brain (Alias Library + Shadow Editing + Predictive UI) 📋 (Planned)

**Pivot note (2026-02-24):** Original v8.12 was Multi-Language OCR Support (moved to v8.14). This milestone introduces the three components of the self-correction layer, built on top of the v8.10 RAG corpus and v8.11 semantic search foundation.

**What this is**
- M5 — Alias Override Layer: persistent correction rules scoped by document type and field type, applied at inference time to normalize noisy OCR before the SLM prompt is generated
- K3 — Shadow Spatial Editing: non-destructive annotation layer on the Extracted Text List; raw OCR text is immutable, `verified_text` is stored as a parallel record
- M6 — Predictive UI (Glass Box): surfaces M5 alias rules as explicit "Did you mean?" suggestions in the review UI; admin Rules Manager shows all active rules and their confidence levels

**What this is not**
- Not silent auto-mutation of OCR data (raw `attachment_ocr_outputs` is never overwritten — immutability contract preserved)
- Not a replacement for the RAG loop (M5 operates on the input side of the SLM call; M1 embeds human-confirmed output values — they are fully decoupled)
- Not vendor-scoped (Layer 3 vendor/account scoping deferred until a formal `vendor_entity` model exists)
- Not a training pipeline (rules are derived from human corrections, not ML training runs)

**Design Intent**
M5 reduces the "reasoning load" on Qwen by providing cleaner input text before the extraction prompt is generated. Higher-quality SLM input → higher confidence scores → more auto-confirms via I6. M6 ensures every active rule is visible to admins, preserving the auditability-first principle. K3 allows spatial OCR corrections without destroying the original evidence layer.

**Dependencies**
- **REQUIRES:** v8.10 complete (RAG corpus populated, I6 math reconciliation live)
- **REQUIRES:** v8.11 complete (K1/K2 spatial UI stable — K3 extends the review page layout)

**Capability A: Alias Override Layer (M5)**

*Role:* Pre-Extraction Normalization

*Mechanism:* At inference time, before the OCR segments are serialized into the Ollama prompt, the system queries `correction_overrides` for rules matching the current `documentTypeId` and `fieldType`. Matching rules are applied to the raw segment text (e.g., `"5tory"` → `"Story"` for `text` fields on Invoice documents). The original raw OCR text in `attachment_ocr_outputs` is never modified.

*Scoping layers:*
- **Layer 1 (Document Type):** Rules scoped to a specific document type do not apply to other types (Invoice fixes do not affect Legal Contracts)
- **Layer 2 (Field Type):** Character-swap rules (e.g., `5` → `S`) are blocked on `number`/`currency`/`decimal` fields; permitted on `text` fields

*Data model:*
- New table `correction_overrides`: `id` (uuid pk), `rawPattern` (text), `correctedValue` (text), `documentTypeId` (uuid fk, nullable — null = all types), `fieldType` (text, nullable — null = all field types), `applyCount` (int default 0), `confidenceScore` (decimal 0–1), `isActive` (boolean default true), `createdAt`, `createdBy` (fk users)
- Rules are created automatically when a human correction is saved on a reviewed baseline (correction event → rule upsert)
- `applyCount` incremented each time a rule is used at inference time

*Architectural value:* M5 rules are a portable "Logic File" — independent of the vector DB and the SLM. If either is replaced, the alias library remains intact.

**Capability B: Shadow Spatial Editing (K3)**

*Role:* Non-Destructive Annotation

*Mechanism:* Clicking an item in the Extracted Text List on the review page opens an inline editor. Saving writes a `verified_text` value to a new `ocr_spatial_annotations` table linked to the source segment's spatial coordinates. The original `raw_text` in `extracted_text_segments` is never modified.

*Toggle View:* Review page header includes an "OCR View / Human View" toggle. OCR View shows `raw_text` for all segments; Human View shows `verified_text` where available, falling back to `raw_text`. This provides a complete audit trail of what the machine saw versus what the human declared.

*Data model:*
- New table `ocr_spatial_annotations`: `id` (uuid pk), `segmentId` (uuid fk `extracted_text_segments`), `baselineId` (uuid fk `extraction_baselines`), `rawText` (text — copied from segment at annotation time for snapshot), `verifiedText` (text), `annotatedBy` (uuid fk users), `annotatedAt` (timestamp)
- One annotation per segment per baseline (upsert on re-edit)

*Governance alignment:* Satisfies "Derived data is never authoritative" — `verified_text` is a human declaration layered over immutable OCR evidence.

**Capability C: Predictive UI — Glass Box (M6)**

*Role:* Proactive Verification with Full Transparency

*Mechanism:* When the review page loads, the API checks active M5 rules against the current document's segments. Any segment matching an active rule is flagged with a yellow underline and a "Did you mean [correctedValue]?" tooltip. Accepting the suggestion creates a field assignment with the corrected value and increments the rule's `applyCount`.

*Rules Manager (Admin):*
- New admin page `/admin/alias-rules` listing all active `correction_overrides` with columns: raw pattern, corrected value, document type scope, field type scope, apply count, confidence score, active toggle
- Admin can deactivate, delete, or manually create rules
- Rules with `confidenceScore >= 0.98` display a "High Confidence" badge — visible signal that a rule has been applied reliably enough to consider promoting, but promotion to auto-apply remains an explicit admin action (never automatic)

**Governance Alignment**
- Explicit Intent: M5 rules applied at inference time are surfaced as suggestions (M6), not silent mutations; admin must explicitly promote rules
- Auditability: `correction_overrides.applyCount` tracks rule usage; `ocr_spatial_annotations` preserves raw/verified duality; all rule changes audit-logged
- Backend authority: rule scoping, confidence thresholds, and active state managed server-side
- Derived data never authoritative: `verified_text` (K3) and alias-corrected text (M5) are both overlay layers; raw OCR is the immutable ground truth

**Capability D: Table Column Mapping RAG (T1–T4)**

*Background:* Field extraction (v8.10) improves over time via the RAG learning loop — each confirmed baseline embeds confirmed field values into `baseline_embeddings`, providing few-shot context for future similar documents. Table detection (`POST /ml/detect-tables`) has no equivalent feedback loop. Table structure is identified via heuristic geometry (spatial proximity, bounding box alignment), and column-to-field mapping is 100% manual. For document types where key data lives in tabular line-item rows (e.g. purchase orders: ITEM#, DESCRIPTION, QTY, UNIT PRICE, TOTAL), repeated manual mapping creates friction and provides no improvement signal to the system.

*What this is:*
- A RAG-style learning loop for table column mappings, parallel to the field extraction RAG loop
- When a user confirms a table's column→field assignments on a baseline, the mapping is embedded and stored in a new `table_mapping_embeddings` corpus
- Future similar tables (same document type, similar column header text or spatial layout) retrieve past confirmed mappings as few-shot context
- The system auto-suggests column assignments in the table review UI, which the user can accept, override, or ignore — never silent mutation
- Covers both header-based similarity (column header text like "Unit Price" matched to `unit_price` field) and layout-based similarity (positional embedding of column structure when headers are absent)

*What this is not:*
- Not automatic table conversion — user still explicitly triggers detection and conversion
- Not a replacement for the `detect-tables` heuristic — detection of *where* tables are remains geometry-based; this improves *what columns mean*
- Not training the table detection model — the ML heuristic in `table_detect.py` is unchanged
- Not field extraction — table cell values are stored in `baseline_table_cells`, not `baseline_field_assignments`; this is a parallel learning corpus for the table system only

*Design intent:*
Documents like purchase orders (see architecture reference: GimBooks PO template, 2026-02-24) have a fixed line-item table structure (ITEM#, DESCRIPTION, QTY, UNIT PRICE, TOTAL) that repeats identically across vendors. Once a user maps those columns once, every subsequent PO from any vendor should auto-suggest the same mapping. The first mapping is expensive (manual); all subsequent ones should be near-zero effort.

*Mechanism:*
1. **T1 — Column Mapping Corpus:** New table `table_mapping_embeddings`: `id` (uuid pk), `baseline_id` (uuid fk `extraction_baselines`), `document_type_id` (uuid fk `document_types`), `table_label` (text nullable — from `baseline_tables.tableLabel`), `column_structure` (jsonb — array of `{columnIndex, headerText, mappedFieldKey, sampleValues[3]}`), `column_structure_embedding` (vector(768)), `serialized_headers` (text — space-joined column headers for embedding input), `is_gold` (boolean default false — admin-set; never evicted), `quality_gate` (text: `'user_confirmed'` | `'admin'`), `confirmed_at` (timestamp), `created_at` (timestamp). Index: ivfflat on `column_structure_embedding` (cosine, lists=50).
2. **T2 — Embed-on-Table-Confirm:** When a user confirms all column mappings on a table (all columns in `baselineTableColumnMappings` have a `fieldKey` assigned and the table status = `'confirmed'`), embed the serialized column headers via Ollama `nomic-embed-text` (reuses the already-running embedding model from v8.10) and store in `table_mapping_embeddings`. Quality gate: `'user_confirmed'` always (no math check applicable to tables). Volume cap: max 5 per `document_type_id`, oldest non-gold evicted (mirrors M1 policy). Non-blocking — table confirmation must not fail if embedding fails.
3. **T3 — Column Mapping Retrieval:** Before presenting the column mapping UI for a newly converted table, the API retrieves the top-3 most similar past mappings from `table_mapping_embeddings` filtered by `document_type_id`. Similarity is cosine distance on column header embeddings. Returns `[{columnIndex, suggestedFieldKey, confidence, fromBaselineId}]`. Graceful degradation: if `table_mapping_embeddings` is empty or pgvector unavailable, returns empty — column mapping UI shows no suggestions (same as today).
4. **T4 — Column Suggestion UI:** In the table column mapping panel (currently shows only a field-key dropdown per column), display a "Suggested: [field label]" chip beneath each column header when T3 returns a match. Confidence ≥ 0.80 → chip highlighted green with "Accept" one-click. Confidence < 0.80 → chip shown grey (informational only). Accepting a suggestion calls the existing `assignColumnToField()` endpoint — no new API calls needed. Audit log entry: `table.column.suggestion.accepted` with `fromBaselineId` and similarity score.

*Seed corpus:* At first deploy, `table_mapping_embeddings` is empty. Admin can manually create gold entries via a new admin endpoint `POST /admin/table-mapping-corpus` accepting `{documentTypeId, columnStructure[], isGold: true}` — this covers the cold-start problem for tables in the same way L6 (seed corpus) covers cold-start for field extraction.

*Data flow summary:*
- Detection (`POST /ml/detect-tables`) → unchanged heuristic → `ml_table_suggestions`
- Conversion → `baseline_tables` + `baseline_table_cells` → unchanged
- Column mapping (user, now assisted by T3/T4) → `baselineTableColumnMappings` → unchanged
- Table confirm → T2 embeds mapping → `table_mapping_embeddings` (new)
- Future table → T3 retrieves → T4 surfaces suggestion in UI (new)

*Not addressed in this milestone (deferred post-v8.12):*
- Table cell value RAG (suggesting *values* for cells based on past similar tables) — requires cell-level embeddings and a separate corpus; scope too large
- Automatic table structure detection improvement (replacing geometry heuristic with a learned spatial model)
- Vendor-scoped column mappings (e.g. "Acme Corp always uses column 3 for unit price regardless of header text") — requires `vendor_entity` model

*Dependencies:*
- **REQUIRES v8.10:** `baseline_embeddings` infrastructure, Ollama `nomic-embed-text` running, pgvector live
- **REQUIRES v8.11:** Semantic search stable (confirms pgvector query patterns are production-ready)
- **REQUIRES v8.12 A/B/C:** Column mapping UI exists and is stable (T4 extends it)
- **NEW DEPENDENCY:** `baselineTableColumnMappings` must have `confirmedAt` timestamp column (currently absent — migration needed)

*Governance Alignment:*
- Explicit Intent: column mapping suggestions are displayed as chips; user must click Accept — never auto-applied
- Auditability: `table.column.suggestion.accepted` audit entry records the source baseline and similarity score; `table_mapping_embeddings` is append-only (eviction is hard delete, logged)
- Backend authority: similarity threshold and volume cap enforced server-side
- Derived data never authoritative: suggested field keys are recommendations only; confirmed mapping in `baselineTableColumnMappings` is the authoritative record

**Status**
📋 Planned — depends on v8.10 + v8.11 + v8.12 (A/B/C) completion

---

## v8.13 — Embedding Anonymization (Privacy Guardrail) 🔍 (Research)

**What this is**
- L8 (Phase 1 only): A pre-processing transformation applied to `serializedText` before it is passed to the Ollama embedding endpoint (`nomic-embed-text`), ensuring that sensitive PII (names, addresses, account numbers, monetary totals) is replaced with typed placeholders (e.g., `[CUSTOMER_NAME]`, `[TOTAL_AMOUNT]`) before the string enters the vector store
- The structural shape of the document (zone layout, field positions, relative ordering) is preserved — only the identity-carrying values are anonymized
- Ensures `baseline_embeddings.serialized_text` does not store unencrypted PII

**What this is not**
- Not a PDF deletion or purge pipeline (that requires a formal Data Retention Policy decision — deferred post-v8.13)
- Not a replacement for access controls on `baseline_embeddings`
- Not full document anonymization — raw `attachment_ocr_outputs` and `baseline_field_assignments` are unaffected; this applies only to the embedding input string

**Design Intent**
Decouples the structural intelligence of the RAG loop (knowing *where* a "Total" lives on an invoice) from the private identity of the document (knowing *whose* total it is). A RAG retrieval result can inform the SLM prompt without leaking the previous client's monetary values into the new extraction context.

**Dependency**
Requires a governance decision on: which field types constitute PII in this product's regulatory context; whether anonymization must be reversible or one-way; and whether existing `baseline_embeddings` rows need retroactive re-embedding. **No implementation until these questions are answered.**

**Status**
🔍 Research — governance decision required before speccing

---

## v8.14 — Multi-Language OCR Support 📋 (To be confirmed)
What this is

Support OCR for non-English documents (Spanish, French, German, Chinese, etc.)
Language detection (automatic or manual selection)
Language-specific field matching (embeddings in target language)
Per-org default language settings

What this is not

Not automatic translation (OCR outputs in original language)
Not cross-language field matching (Spanish text → English fields)


Capability A: Language Detection
Milestone 8.12.1: Language Detection Service

Integrate language detection library (langdetect or fasttext)
NEW SERVICE: LanguageDetectionService
Method: detectLanguage(text): LanguageCode

Input: sample text (first 500 chars from OCR output)
Output: ISO 639-1 language code (e.g., 'en', 'es', 'fr', 'zh')
Confidence score (0-100%)



Milestone 8.12.2: Language Field in Data Model

EXTEND extracted_text_segments: add detected_language VARCHAR(5)
EXTEND extraction_baselines: add primary_language VARCHAR(5)
Store detected language for each text segment
Baseline primary language = most common language in segments

Milestone 8.12.3: Language Detection UI

On OCR retrieval: automatically detect language
Display detected language in Review Page header
Badge: "Language: Spanish (98% confidence)"
If confidence <80%: show warning + manual language selector


Capability B: Multi-Language OCR Engine
Milestone 8.12.4: PaddleOCR Multi-Language Support

PaddleOCR already supports 80+ languages
Configure language models in FastAPI service:

python  ocr_engines = {
      'en': PaddleOCR(lang='en'),
      'es': PaddleOCR(lang='es'),
      'fr': PaddleOCR(lang='fr'),
      'zh': PaddleOCR(lang='ch'),
      # ... preload common languages
  }

On OCR request: detect language → select appropriate engine

Milestone 8.12.5: Language-Specific Model Loading

Lazy load language models (don't preload all 80 languages)
Cache loaded models in memory (30 min TTL)
If language not cached: download model (one-time), then load


Capability C: Language-Specific Field Matching
Milestone 8.12.6: Multi-Language Embeddings

Use multilingual Sentence-BERT model: paraphrase-multilingual-MiniLM-L12-v2
Supports 50+ languages in same vector space
Replace monolingual model in FastAPI service
No code changes needed (API stays same)

Milestone 8.12.7: Language-Aware Field Suggestions

When suggesting field assignments:

Embed text segments in original language
Embed field labels (translate if needed, or use multilingual embeddings)
Match in shared vector space


Example: Spanish text "Número de factura" matches field "invoice_number"


Capability D: Organization Language Settings
Milestone 8.12.8: Org Default Language

EXTEND organizations.settings: add default_language VARCHAR(5)
Admin can set default language in org settings
Used as fallback if language detection fails
Applied to new attachments automatically

Milestone 8.12.9: User Language Preference

EXTEND users table: add preferred_language VARCHAR(5)
User can set in profile settings
Affects UI language (labels, messages)
Does not affect OCR language (OCR uses detected language)


## v8.15 — Batch Extraction & Processing 📋 (Planned)
What this is

Upload multiple documents at once
Batch OCR processing (queue-based, parallel)
Bulk baseline confirmation (review all, confirm all)
Progress tracking (X of Y documents processed)
**BUILDS ON:** v8.6.add1 OCR Queue UI/UX (preserves user experience, upgrades backend)

**Dependencies**
- **REQUIRES:** v8.6.add1 (OCR Queue UI established)

What this is not

Not automatic confirmation (user must review each baseline)
Not bulk field assignment (each document assigned independently)
Not a complete redesign of queue UI (v8.6.add1 established the target UX)


Capability A: Bulk Upload
Milestone 8.13.1: Multi-File Upload UI

On Task detail page: "Upload Multiple Files" button
File picker: allow selecting multiple files (Ctrl+Click or Drag-drop)
Display upload queue: list of files with progress bars
Validation: check file types, max size (20MB each), max count (50 files)

Milestone 8.13.2: Bulk Upload API

POST /attachments/bulk/upload

Input: FormData with multiple files, task_id
Process: save each file, create attachment records
Return: array of attachment IDs


Backend: handle concurrent uploads (use async/await, rate limit per user)


Capability B: Batch OCR Processing
Milestone 8.13.3: OCR Job Queue

**REPLACES:** v8.6.add1 database polling with BullMQ infrastructure
**PRESERVES:** API endpoints and UI components from v8.6.add1

Install BullMQ (Redis-based job queue)
NEW QUEUE: ocr-processing-queue
Job structure: { attachmentId, userId, priority }
Worker: processes jobs concurrently (5 workers, configurable)

Milestone 8.13.4: Queue Job Lifecycle

On bulk upload: create OCR job for each attachment
Job states: pending → processing → completed → failed
Store job state in attachment_ocr_outputs.processing_status
Track retries: max 3 attempts, exponential backoff

**Capacity Controls (v8.9 with BullMQ):**
- **Global Queue Limit:** Maximum total jobs in BullMQ queue (e.g., 100 jobs system-wide)
- **Per-User Queue Limit:** Maximum pending jobs per user (e.g., 20 jobs per user)
- **Bulk Upload Limit:** Maximum files per bulk upload (e.g., 50 files max)
- **Concurrent Workers:** Configurable worker count (default: 5, max: 10 based on OCR worker capacity)
- **Rate Limiting:** Throttle bulk upload requests (e.g., 1 bulk upload per 30 seconds per user)
- **Queue Backpressure:** If queue depth > 80 jobs, show warning "System is busy. Your jobs may take longer."
- **Admin Controls:**
  - Dashboard showing queue depth, worker utilization, processing rate
  - Ability to pause/resume workers during maintenance
  - Ability to adjust worker count dynamically
- **Graceful Degradation:** If Redis is down, fall back to database polling (v8.6.add1 mode)

Milestone 8.13.5: Capacity Planning & Configuration

**System Settings Table:**
- `ocr_queue_max_global`: INT DEFAULT 100 (total jobs allowed system-wide)
- `ocr_queue_max_per_user`: INT DEFAULT 20 (jobs per user)
- `ocr_worker_count`: INT DEFAULT 5 (concurrent workers, max 10)
- `ocr_bulk_upload_max_files`: INT DEFAULT 50 (files per bulk upload)
- `ocr_bulk_upload_cooldown_sec`: INT DEFAULT 30 (seconds between bulk uploads per user)

**Admin Settings Page:**
- `/admin/ocr-settings` - Configure capacity limits
- Real-time queue metrics: current depth, worker utilization, avg processing time
- Alerts: notify when queue > 80% capacity

**User-Facing Limits:**
- Upload validation: check limits before accepting files
- Error messages:
  - "Queue limit reached (20/20 jobs). Please wait or cancel existing jobs."
  - "Bulk upload limit: 50 files maximum"
  - "Please wait 30 seconds before next bulk upload"

Milestone 8.13.6: Progress Tracking UI

**BUILDS ON v8.6.add1 OcrQueuePanel - Adds Enhanced Features:**

**Bottom-Right Panel Enhancements (Preserves v8.6.add1 Design):**
- **KEEP:** All existing UI elements (filename, status badge, actions, etc.)
- **ADD:** Queue position indicator per job: "Position 3 of 15" (when queued)
- **ADD:** Processing time estimate: "~2 min remaining" (based on avg processing time)
- **ADD:** Progress spinner animation for processing jobs
- **ADD:** Batch grouping: If >5 jobs from same task, show "Batch of 12" header

**New Batch Processing Widget (Separate Component):**
- On Task detail page: "Batch Processing" widget (appears during bulk uploads)
- Display: "Processing 12 of 50 documents"
- Overall progress bar (% complete) with ETA
- Summary stats: "45 succeeded, 3 processing, 2 failed"
- Expandable list with per-file status icons
- Auto-refresh every 5 seconds (polling or WebSocket)

**Visual Enhancements:**
- Toast notifications when batch completes: "OCR batch complete: 48/50 succeeded"
- Sound notification option (user preference)
- Desktop notification permission (browser API)


Capability C: Bulk Baseline Review
Milestone 8.13.6: Batch Review UI

New page: /tasks/:id/batch-review
Display: grid view of all attachments (thumbnails)
For each attachment:

Thumbnail (PDF first page, image preview)
Status badge (Draft/Reviewed/Confirmed)
Field assignment count (e.g., "5/10 fields assigned")


Click thumbnail → opens Review Page (v8.6)

Milestone 8.13.7: Bulk Confirmation

On Batch Review page: "Confirm All Reviewed" button
Enabled only if all baselines in "Reviewed" state
Confirmation modal:

"This will confirm 12 baselines. Continue?"
Show summary: total fields assigned, empty fields
[Cancel] [Confirm All]


Action: loop through baselines, confirm each (atomic transaction)


Capability D: Error Handling & Retry
Milestone 8.13.8: Failed OCR Handling

If OCR job fails (API timeout, invalid file, etc.):

Mark processing_status='failed'
Store error message in attachment_ocr_outputs.error_details
Display error in UI (red icon, tooltip with error message)
Button: "Retry OCR" (re-queues job)



Milestone 8.13.9: Partial Batch Completion

If batch processing partially fails (some succeed, some fail):

Show summary: "45 succeeded, 5 failed"
Allow user to proceed with successful ones
Option: "Retry Failed" (re-process only failed files)
Option: "Delete Failed" (remove failed attachments)

Integration Notes
v8.8 → v8.9 Integration:

v8.9 uses correction data from v8.8 (baseline_field_assignments)
No schema changes to v8.8 tables
ML model improvements transparent to users

v8.9 → v8.10 Integration:

v8.8 replaces monolingual Sentence-BERT with multilingual version
v8.7 fine-tuning pipeline works with multilingual model (no changes)

v8.8 → v8.9 Integration:

v8.9 processes multiple documents using same v8.6 baseline workflow
Language detection (v8.8) applied per document in batch

Dependencies:

v8.6 REQUIRES: v8.1 (confirmation workflow), v8.5 (Field Builder)
v8.7 REQUIRES: v8.6 (correction dataset)
v8.8 REQUIRES: v8.6 (field matching), v8.7 (multilingual embeddings)
v8.9 REQUIRES: v8.6 (baseline review), v8.8 (language detection per file)
---

## v9 � Temporal Workflow Runtime Engine (Backend + Workers) 📋 (Planned)

What this is
- Temporal-backed workflow interpreter (single orchestrator workflow) that executes registry-defined nodes deterministically
- Activity workers for governed side effects (DB updates, assignments, status changes)
- Trigger detection service that starts orchestrator workflows when business events match
- Runtime state projection + audit tables sourced from Temporal events for UI consumption
- Approval signal state machine (backend ? Temporal) for long-running human steps

What this is not
- No DB-resident execution engine or GraphExecutionService
- No user scripting/expressions; only registry-defined nodes
- No direct UI ? Temporal calls; Temporal Web is ops-only

Design Intent
Durable, auditable execution with minimal Temporal surface area. Workflow graphs stay data; execution is performed by a generic interpreter workflow + activities.

Architecture / Milestones
- **9.1 Node Registry v1**: canonical list of node types, config schemas (Zod), activity bindings, output schemas.
- **9.2 Trigger Ingestion**: domain event listeners map triggers ? workflowVersionId + payload; start orchestrator workflow `OrchestratorWorkflow(definitionVersionId, triggerPayload)`.
- **9.3 Orchestrator Workflow**: deterministic interpreter (Temporal workflow) that reads nodeGraph JSON, walks nodes, waits on timers/approvals, emits progress events.
- **9.4 Activity Workers**: idempotent activities for side effects (update records, assign users/roles, status changes); retries + backoff; no UI concepts exposed.
- **9.5 Runtime Projection**: `WorkflowStateProjector` consumes workflow queries/signals to write `workflow_instances` + `workflow_instance_events` for UI/state queries.
- **9.6 Approval Signals**: backend `POST /workflows/instances/:id/approvals` ? Temporal signal; orchestrator resumes waiting Approval node; records outcome.
- **9.7 Ops & Observability**: Temporal task queues dedicated per tenant; metrics/alerts on schedule-to-start and retries; Temporal Web reserved for operators only.
- **9.8 Migration & Cutover**: legacy linear/DAG execution codepaths removed; data kept as historical read-only; projections rebuilt from Temporal history where possible.

Dependencies
- **REQUIRES:** v5 (Temporal-backed foundations: definition/version store + projections)
- **REQUIRES:** v6 (Node Registry + publish semantics)
- **REQUIRES:** v7 (signals UI surfaces runtime state)

Modifications to Existing Code
- Remove/deprecate `GraphExecutionService` and feature flags for DB execution.
- Add `OrchestratorWorkflow` and activity workers in Temporal TypeScript worker package.
- Add `TriggerService` that maps domain events ? start workflow command.
- Extend projection tables with event type enums (node_started, node_completed, waiting_approval, signal_received, timer_scheduled, timer_fired, activity_failed, activity_retried).
- Update inbox/detail APIs to read from projections instead of workflow_step_executions.

Status
? Planned (replaces prior v9 DAG engine entirely).
## v10 — Visual Workflow Builder (Canvas Editor) 📋 (Planned)
What this is

Drag-and-drop workflow designer (React Flow based)
Canvas-based node editor with zoom/pan/minimap
Visual node property panels (forms for step configuration)
Conditional logic builder (visual if/then/else)
Auto-layout with manual positioning override
Template library (drag reusable elements)
Real-time validation with error highlighting
Visual dry-run simulation (show execution path)
Registry-defined node palette (node types come from Node Registry v1; no custom code)

What this is not

Not replacing v6 admin UI entirely (form-based editor kept as "advanced mode")
Not collaborative editing (single-user session initially, multi-user in v18)
Not real-time sync (changes saved on publish, not live)

Design Intent
Make workflow design accessible to non-technical users while maintaining governance rigor. Visual representation must match exact execution behavior (WYSIWYG).

Capability A: Visual Workflow Canvas
Admins can design workflows on a drag-and-drop canvas.
Milestone 10.1: React Flow Integration

Install reactflow library (graph canvas component)
Create new route: /workflows/:id/visual-edit (canvas editor)
Keep existing /workflows/:id/edit (form-based editor, "advanced mode")
Add toggle button: "Visual Mode / Advanced Mode"

Milestone 10.2: Node Palette (Drag-and-Drop)

Left sidebar: palette pulled from Node Registry v1 (task, decision, wait/delay, approval, assign role, update record, set variable, start/end)
Drag node from palette → drop on canvas → creates registry-backed node
Each node type has visual icon/shape (task = rectangle, decision = diamond, etc.)

Milestone 10.3: Canvas Navigation

Zoom controls (+/-, fit to view)
Pan canvas (drag background)
Minimap (top-right corner, shows full graph overview)
Grid snapping (optional, configurable)

Milestone 10.4: Edge Creation (Connect Nodes)

Click node output port → drag to target node input port → creates edge
Visual edge with arrow showing direction
Cannot create cycles (unless explicit loop node) — validation prevents invalid edges


Capability B: Node Configuration Panels
Admins can configure node properties through visual forms (not JSON editing).
Milestone 10.5: Node Property Panel (Side Panel)

Click node → opens property panel (right sidebar)
Form fields based on node type:

Task node: step type (approval/acknowledge), assignment, evidence requirements, timeout
Decision node: condition builder (visual rules, not raw JSON)
Loop node: loop variable selector, child nodes configuration


Save button → updates nodeConfig JSON in database

Milestone 10.6: Visual Condition Builder

For decision nodes and conditional edges
UI: "If [field] [operator] [value]" dropdowns
Operators: equals, not equals, greater than, less than, contains, in list
Compound conditions: AND/OR buttons to add multiple rules
Preview: show resulting JSON (for advanced users to verify)

Milestone 10.7: Assignment Configuration UI

Dropdown: assign to user, role, or dynamic (from workflow inputs)
User picker: typeahead search for users
Role picker: dropdown of available roles
Dynamic: input field for JSON path (e.g., inputs.assignedUser)


Capability C: Auto-Layout & Manual Positioning
Canvas can auto-arrange nodes or allow manual positioning.
Milestone 10.8: Auto-Layout (dagre Integration)

Install dagre library (graph layout algorithm)
Button: "Auto Layout" → calculates optimal node positions
Algorithm: hierarchical top-to-bottom layout
Stores positions in nodeGraph JSON (layout fields)

Milestone 10.9: Manual Positioning

Drag nodes to desired positions (updates positionX/Y in database)
Snap to grid (optional)
Align tools (align left, center, distribute evenly)


Capability D: Real-Time Validation
Canvas validates workflow as admin builds it, showing errors immediately.
Milestone 10.10: Graph Validation Service

DAG check: detect cycles (except explicit loop nodes)
Orphan node detection: nodes with no incoming/outgoing edges (except start/end)
Unreachable paths: nodes that can never be executed
Missing configuration: nodes with incomplete config (e.g., task node with no assignment)

Milestone 10.11: Validation UI Feedback

Invalid nodes highlighted in red
Error icon on node (hover shows error message)
Validation panel (bottom pane) lists all errors
Cannot publish workflow until all errors resolved


Capability E: Visual Dry-Run Simulation
Admins can simulate workflow execution on the canvas.
Milestone 10.12: Simulation Mode

Button: "Simulate Execution"
Input modal: enter sample workflow inputs (JSON or form)
Canvas highlights execution path (green nodes = visited, gray = skipped)
Simulation runs the same interpreter logic as v9 Temporal workflow (no DB traversal)
Shows which conditions evaluated to true/false

Milestone 10.13: Step-by-Step Playback

Simulation playback controls: play, pause, step forward, step back
Displays current node (pulsing outline)
Shows variable values at each step (e.g., "amount = $5000")


Capability F: Template Library
Admins can drag pre-configured node templates onto canvas.
Milestone 10.14: Template Palette

Section in left sidebar: "Templates"
Display node templates (from workflow_node_templates)
Drag template → drop on canvas → creates node with pre-filled configuration
Can edit after insertion (templates are starting points)

Milestone 10.15: Save Node as Template

Right-click node → "Save as Template"
Input template name
Saves nodeConfig to workflow_node_templates
Template appears in palette for reuse


Capability G: Graph Serialization & Versioning
Canvas changes are saved as new workflow versions (v6 versioning model unchanged).
Milestone 10.16: Save Draft (Auto-Save)

Auto-save draft every 30 seconds (debounced)
Saves nodes (with positions) and edges to database
Draft indicator: "Last saved 2 minutes ago"

Milestone 10.17: Publish Workflow Version

Button: "Publish"
Validates graph (must pass all validation checks)
Creates new workflow definition version (increments version number)
Deactivates previous active version
Redirects to workflow list with success message

Capability H: Backwards Compatibility with v6
Visual editor and form-based editor can coexist, workflows created in one can be edited in the other.
Milestone 10.18: Graph Serialization/Deserialization

Backend service: convert nodes/edges ↔ visual canvas format
Endpoint: GET /workflows/:id/graph (returns nodes/edges with positions)
Endpoint: POST /workflows/:id/graph (saves canvas state)

Milestone 10.19: Form Editor Compatibility

Workflows created in visual editor can be opened in form editor (v6)
Converts graph to linear step list for display (shows warning if branching/loops present)
Workflows created in form editor can be opened in visual editor
Displays sequential graph (nodes in a line)

Milestone 10.20: Version History Visual Diff

Compare two workflow versions side-by-side
Highlight added nodes (green), removed nodes (red), modified nodes (yellow)
Show edge changes (added/removed/modified conditions)


Status: ⏸️ Planned
Dependencies:

REQUIRES: v9 (Temporal runtime interpreter stable)
REQUIRES: v6 (workflow versioning system + Node Registry)
EXTENDS: v6 admin UI (adds visual editor route)

Modifications to Existing Code:

NEW UI ROUTE: /workflows/:id/visual-edit (canvas editor page)
NEW APIs: GET/POST /workflows/:id/graph (graph serialization endpoints)
NEW DEPENDENCIES: reactflow, dagre, @monaco-editor/react
EXTENDS: v6 workflow APIs (add graph layout computation)
NO SCHEMA CHANGES (layout stored in nodeGraph JSON within workflow definitions)

Backwards Compatibility:

Form-based editor (v6) remains functional for power users
Toggle between visual/form modes without data loss
No breaking changes to v6 APIs


## v11 — Dynamic Task Decomposition (Template Variables) 📋 (Planned)
What this is

Workflow nodes can define task templates with variables (${location}, ${quantity})
User inputs at workflow start populate template variables
System auto-generates child tasks based on input arrays (e.g., 3 locations → 3 tasks)
Generated tasks linked via parent/child relationships (v4)
Preview execution plan before workflow starts (shows all tasks to be created)

What this is not

Not background automation (user triggers workflow explicitly)
Not AI-generated tasks (templates are deterministic)
Not modifying tasks after creation (tasks are immutable once generated)

Design Intent
Enable one-to-many workflows (single contract → multiple shipments) while maintaining explicit user control and full auditability.

Capability A: Task Template Configuration
Workflow nodes can define templates for dynamic task generation.
Milestone 11.1: Task Template Data Model

EXTEND workflowNodes table: add taskTemplateConfig (JSON field, nullable)
Schema structure:

json  {
    "templateType": "dynamic",
    "titlePattern": "Ship to ${location}",
    "descriptionPattern": "Ship ${quantity} units to ${location}",
    "durationMinutes": 120,
    "stageId": "uuid-ref",
    "loopVariable": "locations",
    "parentTaskId": null
  }

Only applicable to task nodes within loop nodes

Milestone 11.2: Template Configuration UI (v10 Visual Editor)

Node property panel for task nodes inside loops
Checkbox: "Generate tasks dynamically"
When checked, show template configuration form:

Title pattern (text input with ${variable} syntax highlighting)
Description pattern (textarea with variable syntax)
Stage selector (dropdown)
Duration input (minutes)
Loop variable (dropdown of available workflow input variables)




Capability B: Workflow Input Schema
Workflows can define typed input schemas for validation and template variable substitution.
Milestone 11.3: Input Schema Definition

EXTEND workflowDefinitions table: add inputSchema (JSON field, nullable)
Schema structure (JSON Schema format):

json  {
    "type": "object",
    "properties": {
      "locations": {"type": "array", "items": {"type": "string"}},
      "customer_name": {"type": "string"},
      "quantity": {"type": "number"}
    },
    "required": ["locations", "quantity"]
  }
Milestone 11.4: Input Schema Editor UI (v6/v10)

Section in workflow editor: "Workflow Inputs"
Add input field: name, type (string, number, array, object), required checkbox
For array types: define item type
Validation rules: min/max, regex patterns (optional)

Milestone 11.5: Input Validation on Workflow Start

When user starts workflow, validate inputs against inputSchema
Return 400 error if validation fails (missing required fields, type mismatch)
Display clear error messages in UI


Capability C: Dynamic Task Generation
System generates child tasks from templates when workflow execution reaches loop nodes.
Milestone 11.6: Task Generation Service

NEW SERVICE: TaskGenerationService
Method: generateTasksFromTemplate(nodeConfig, executionInputs, executionId)

Parse taskTemplateConfig from node
Get array from executionInputs[loopVariable]
For each item in array:

Substitute variables in title/description patterns
Create task via existing v4 task API
Link to parent task via parentId (if configured)


Return array of created task IDs



Milestone 11.7: Variable Substitution Engine

Install handlebars library (or use custom regex-based substitution)
Support syntax: ${variableName}, ${array[0]}, ${object.property}
Handle missing variables gracefully (don't crash, log warning, use empty string)

Milestone 11.8: Loop Node Task Generation Integration

MODIFY v9 orchestrator interpreter loop handler
When entering loop node with taskTemplateConfig:

Call TaskGenerationService.generateTasksFromTemplate()
Store generated task IDs in executionState JSON
Create node execution records for each iteration (linked to generated tasks)



Milestone 11.9: Audit Trail for Generated Tasks

Audit log entry: "System created 3 tasks from workflow node 'Shipment Planning'"
Include: workflow execution ID, node ID, input variable used, task IDs created
Link tasks to workflow execution (add workflowExecutionId field to tasks table - optional)


Capability D: Execution Plan Preview
Users can preview all tasks that will be generated before starting workflow.
Milestone 11.10: Execution Preview Service

NEW SERVICE: ExecutionPreviewService
Method: previewExecution(workflowId, inputs): PreviewResult
Simulate execution without creating real tasks/records:

Traverse graph (v9 execution logic)
When encountering task template nodes, simulate task generation
Return preview data: list of tasks (title, description, stage), total count, estimated duration



Milestone 11.11: Preview UI (Workflow Start Modal)

When user clicks "Start Workflow", show input form (from input schema)
Button: "Preview Execution"
Preview displays:

"This workflow will create X tasks:"
List of tasks (grouped by loop iteration if applicable)
Total estimated duration


Confirmation: "Proceed with workflow start?" [Cancel] [Confirm]

Milestone 11.12: Preview Accuracy Verification

Test: preview matches actual execution (same tasks created)
Test: preview updates when inputs change (reactive)
Test: preview handles complex scenarios (nested loops, conditional branching)


Capability E: Integration Testing
Verify dynamic task decomposition works end-to-end.
Milestone 11.13: Template Variable Substitution Testing

Test: variables in title/description replaced correctly
Test: array indexing works (${locations[0]})
Test: object property access works (${customer.name})
Test: missing variables handled gracefully (no crash)

Milestone 11.14: Parent-Child Linking Verification

Test: generated tasks linked to parent via parentId (v4 constraints enforced)
Test: cannot delete parent task while children exist
Test: parent status validation (cannot complete parent until children complete)

Milestone 11.15: Bulk Generation Performance Testing

Test: generate 100+ tasks (loop with large array)
Verify: no database timeout, reasonable execution time (<5 seconds)
Verify: transaction handling (all tasks created or none)


Status: ⏸️ Planned
Dependencies:

REQUIRES: v9 (graph execution engine with loop nodes)
REQUIRES: v4 (parent/child task relationships)
EXTENDS: v9 workflow nodes (add taskTemplateConfig)
EXTENDS: v4 task creation (bulk generation capability)
NO MODIFICATIONS to existing v4 constraints

Modifications to Existing Code:

EXTEND: workflowNodes table (add taskTemplateConfig JSON field)
EXTEND: workflowDefinitions table (add inputSchema JSON field)
EXTEND: workflowExecutions.inputs validation (schema validation logic)
NEW SERVICE: TaskGenerationService (wraps v4 task API for bulk creation)
NEW SERVICE: ExecutionPreviewService (simulation without mutation)
MODIFY: v9 Temporal orchestrator loop handler (call task generation activity)
OPTIONAL: Extend todos table with workflowExecutionId (for linking tasks to workflows)
v
Backwards Compatibility:

Workflows without taskTemplateConfig work unchanged (loops execute normally)
Existing loop nodes (v9) continue to function (just don't generate tasks)
v4 task CRUD APIs unchanged (just called in bulk)


## v12 � Reality View: Relationship & Obligation Graph (Read-Only + Optional Event Capture) 📋 (Planned)
What this is

12A: Read-only visual graph of real-world entities, obligations, and relationships (computed from events + dependencies)
12B: Optional append-only Reality Event capture (if enabled) to log corrective/confirmation events with validation
Explanation of blocking conditions, dependencies, and current status
Traceability back to evidence, workflows, and source records

Design Intent
Humans should be able to see reality before correction; optional event capture remains append-only (no destructive edits) and v13 handles governed mutations.
Capability A: Multi-Type Dependency Model
System tracks dependencies between tasks, workflows, and evidence with explicit types.
Milestone 12.1: Dependencies Data Model

NEW TABLE: dependencies (id, sourceType, sourceId, targetType, targetId, dependencyType, createdBy, createdAt, metadata)
Source/Target types: 'task', 'workflow_node', 'workflow_execution', 'evidence'
Dependency types: 'blocks', 'requires_evidence', 'requires_approval', 'parent_child'
createdBy: 'system' (auto-generated) or 'user' (manually defined)
metadata: JSON (additional context, e.g., {reason: "Requires invoice approval"})

Milestone 12.2: System-Generated Dependencies

Auto-create dependency when task generated from workflow (task → workflow_execution)
Auto-create dependency from v4 parent/child (task → task, type: parent_child)
Auto-create dependency from v8 evidence requirements (workflow_node → evidence, type: requires_evidence)
Trigger: on task creation, workflow execution, evidence upload

Milestone 12.3: Manual Dependency Creation API

POST /dependencies (user explicitly creates dependency)
Validation: prevent circular dependencies, ensure source/target exist
Audit log: record who created dependency, when, why (metadata.reason)

Capability A2: Reality Event Capture (Append-Only)
- Milestone 12.3b: POST /reality-events (types: confirmation, correction, reallocation); each type validated via schema; forbids deletes/overwrites.
- Milestone 12.3c: Events append to ledger graph; projection recalculates computed reality; UI shows who/why/when for each event.
- Milestone 12.3d: RBAC + strong validation; reason required; audit entry `reality_event.create` stored.

Capability B: Dependency Graph Service
Backend can compute dependency graphs and blocking chains.
Milestone 12.4: Dependency Graph Builder

NEW SERVICE: DependencyGraphService
Method: buildGraph(entityType, entityId): Graph

Query dependencies table for all related entities
Include v4 parent/child links (via todos.parentId)
Return graph structure: nodes (entities), edges (dependencies)



Milestone 12.5: Blocking Analysis Service

NEW SERVICE: BlockingAnalysisService
Method: findBlockingChain(entityType, entityId): BlockingChain

Traverse dependency graph backwards (find what blocks this entity)
Return chain: A blocks B blocks C blocks [target entity]
Include natural language explanation for each link



Milestone 12.6: Critical Path Service

NEW SERVICE: CriticalPathService
Method: findCriticalPath(workflowExecutionId): Path

Topological sort of dependency graph
Find longest path (most dependencies in sequence)
Return: array of entities in critical path order



Milestone 12.7: Bottleneck Detection Service

NEW SERVICE: BottleneckDetectionService
Method: findBottlenecks(): Bottlenecks

Group pending tasks/workflow steps by assignee
Identify overloaded users (>X pending items)
Return: list of users with workload counts




Capability C: Dependency Graph Visualization
Users can view interactive dependency graphs.
Milestone 12.8: Graph Visualization Component

Install cytoscape or reuse reactflow (from v10)
Component: <DependencyGraphViewer entities={...} />
Features: zoom, pan, search, filter by entity type
Node types: different shapes/colors for tasks, workflows, evidence

Milestone 12.9: Graph Layout Algorithms

Auto-layout: hierarchical (top-to-bottom), force-directed, circular
User can switch layouts via dropdown
Manual node positioning (drag nodes, save positions)

Milestone 12.10: "Why Blocked?" Feature

Click entity in graph → "Why is this blocked?" button
Displays blocking chain in modal:

"Task X is blocked because:"
"→ Workflow step Y requires evidence Z (confidence 60% < 80%)"
"→ Evidence Z is missing (not uploaded)"


Each item in chain is clickable link to entity detail

Milestone 12.11: Graph Filtering & Search

Filter by entity type (show only tasks, only workflows, etc.)
Filter by status (pending, completed, blocked)
Search by name (fuzzy search on entity titles)
Highlight search results in graph


Capability D: Timeline / Gantt Chart View
Users can visualize dependencies over time.
Milestone 12.12: Gantt Chart Component

Install gantt-task-react library
Component: <GanttTimeline tasks={...} dependencies={...} />
Display tasks and workflow steps on timeline (x-axis = time, y-axis = entity)
Show dependencies as arrows between bars

Milestone 12.13: Critical Path Highlighting

Overlay critical path on Gantt chart (highlight in red/bold)
Show slack time for non-critical tasks (buffer before delay impacts completion)
Tooltip: "This task is on the critical path—delays will impact final completion"

Milestone 12.14: Timeline Interaction

Click bar → opens entity detail (task, workflow step)
Drag bar → NOT ALLOWED (read-only, mutation in v13)
Zoom timeline (day, week, month views)


Capability E: Bottleneck Dashboard
Users can see workload distribution and identify overloaded assignees.
Milestone 12.15: Workload Heatmap

Display users with pending task/workflow counts
Color-coded: green (<5 pending), yellow (5-10), red (>10)
Click user → shows list of pending items assigned to them

Milestone 12.16: Workload Trends

Chart: pending items over time (last 7 days, 30 days)
Identify: increasing workload (trend upward), stable, decreasing
Alert: if user's workload >2x average (suggest rebalancing)


Status: ⏸️ Planned
Dependencies:

REQUIRES: v4 (parent/child task relationships)
REQUIRES: v9 (Temporal runtime projections for workflow nodes/approvals)
OPTIONAL: v11 (dynamic task decomposition creates richer dependencies)
OPTIONAL: v8 (evidence requirements create evidence dependencies)
OPTIONAL: v12B (append-only reality events, if enabled)

Modifications to Existing Code:

NEW TABLE: dependencies (tracks all dependency types)
OPTIONAL TABLE: reality_events (append-only ledger for 12B capture)
NEW SERVICES: DependencyGraphService, BlockingAnalysisService, CriticalPathService, BottleneckDetectionService
OPTIONAL SERVICES (12B): RealityEventValidationService, RealityEventIngestService
NEW UI COMPONENTS: Graph viewer, Gantt chart, bottleneck dashboard; optional event capture form
NEW DEPENDENCIES: cytoscape or reactflow, gantt-task-react
NO DESTRUCTIVE CHANGES: reality is computed; event capture is append-only

Backwards Compatibility:

All existing data readable (no schema changes to v4/v9 tables)
Dependency table is additive (doesn't affect existing features)
System-generated dependencies created via triggers (transparent to users)


## v13 — Graph-Governed Editing (Explicit Mutation) 📋 (Planned)
What this is

Explicit, audited corrections initiated from graph inspectors
Edits are append-only events or governed updates to authoritative tables (no deletes)
Strong validation and confirmation requirements
No automation, no implicit side effects; runtime changes go through Temporal signals when applicable

Design Intent
Introduce correction power only after reality is visible and understandable (v12).

Capability A: Task Editing from Graph View
Users can edit task properties directly from dependency graph.
Milestone 13.1: Graph Node Context Menu

Right-click node in graph (v12) → context menu appears
Options: "Edit Task", "View Details", "Log Correction Event", "Add Dependency"
Click "Edit Task" → opens edit form (inline or modal)

Milestone 13.2: Inline Task Edit Form

Form fields: title, description, due date, assignee, stage, status
Validation: same rules as v1 task edit (required fields, valid dates)
Additional validation for graph edits:

Check for circular dependencies before saving
Show impact preview: "This will affect 3 dependent tasks"
Require confirmation with reason (optional text input)



Milestone 13.3: Edit Source Context

EXTEND task CRUD APIs: add editSource parameter ('form' | 'graph' | 'api')
When editSource = 'graph':

Log source in audit trail ("Edited from dependency graph")
Run additional validation (dependency impact check)
Show confirmation modal before saving




Capability B: Dependency Management
Users can create, modify, or remove dependencies.
Milestone 13.4: Add Dependency UI

From graph context menu: "Add Dependency to..."
Modal: Select target entity (typeahead search: tasks, workflow steps)
Select dependency type: blocks, requires_evidence, requires_approval
Optional: add reason/metadata
Validation: prevent circular dependencies

Milestone 13.5: Dependency Validation

Before creating dependency:

Check for cycles (A → B → C → A is invalid)
Check if dependency already exists (prevent duplicates)
Validate source/target exist and are correct types


Return 400 error with explanation if validation fails

Milestone 13.6: Obsolete Dependency (append-only)

Click dependency edge in graph → "Mark Dependency Obsolete" (records correction event)
Confirmation modal: "Log correction to obsolete this dependency? This will unblock [target entity]"
Audit log: record who marked obsolete, when, reason (optional input)


Capability C: Workflow Execution Override
Admins can manually override workflow execution state (with approval).
Milestone 13.7: Manual Step Completion Override

From workflow execution detail (v7), admin can click "Override Step"
Requires admin role (not available to regular users)
Input: reason for override (required, audit logged)
Action: mark step as completed (or skipped) despite not meeting normal criteria

Milestone 13.8: Override Audit Trail

Audit log entry: "Admin [user] overrode step [stepName], reason: [reason]"
Display override indicator in execution detail (yellow warning icon)
Link to audit log entry for full details


Capability D: Impact Preview & Validation
System shows impact of edits before applying them.
Milestone 13.9: Impact Analysis Service

NEW SERVICE: ImpactAnalysisService
Method: analyzeImpact(entityType, entityId, proposedChanges): ImpactReport

Query dependency graph (v12)
Find all dependent entities
Calculate impact: how many tasks/workflows affected
Return: list of affected entities with change descriptions



Milestone 13.10: Impact Preview Modal

Before saving edit, show modal:

"This change will affect:"
List of dependent entities (clickable links)
Severity indicator (low/medium/high based on number affected)


Buttons: [Cancel] [Confirm Changes]

Milestone 13.11: Destructive Action Warnings

If edit/delete would orphan entities (break dependencies):

Show error: "Cannot delete task—3 other tasks depend on it"
Suggest: "Delete dependent tasks first, or remove dependencies"


Prevent action unless dependencies resolved


Status: ⏸️ Planned
Dependencies:

REQUIRES: v12 (reality graph visualization)
MODIFIES: Existing CRUD APIs (add editSource context, validation)
NO NEW TABLES (uses existing authoritative tables)

Modifications to Existing Code:

EXTEND: Task CRUD APIs (add editSource parameter, impact analysis)
EXTEND: Dependency APIs (create, delete with validation)
NEW: Admin override endpoint (workflow step completion)
NEW SERVICE: ImpactAnalysisService (dependency impact calculation)
EXTEND: Audit log (record edit source, override reasons)

Backwards Compatibility:

Existing CRUD APIs work unchanged (new params optional)
Graph edits use same validation as form edits
Audit trail format unchanged (extended with new fields)


## v14 — Drafts & Simulation (What-If Reasoning) 📋 (Planned)
What this is

Draft graphs fully detached from authoritative data
Simulation of outcomes (cashflow, dependencies, impact)
Visual comparison between draft and authoritative reality
Explicit commit converts draft → authoritative records

Design Intent
Enable thinking before acting without contaminating reality.

Capability A: Draft Workflow Creation
Users can create draft copies of workflow executions for experimentation.
Milestone 14.1: Draft Data Model

NEW TABLE: workflowDrafts (id, basedOnWorkflowId, basedOnExecutionId, userId, draftState, createdAt, updatedAt)
draftState: JSON (contains modified nodes, edges, inputs)
Structure: {nodes: [...], edges: [...], inputs: {...}, modifications: [...]}

Milestone 14.2: Create Draft from Execution

From workflow execution detail (v7), button: "Create Draft"
Clones execution state → creates draft record
Draft is user-specific (only creator can see/edit)
Draft name: "[Workflow Name] - Draft - [Date]"

Milestone 14.3: Draft Workspace UI

Page: /workflows/drafts/:draftId
Displays draft graph (reuse v10 visual editor component)
Editable: can modify nodes, edges, inputs
Banner: "Draft Mode - Changes not saved to production"


Capability B: Draft Modification & Simulation
Users can modify drafts and simulate outcomes.
Milestone 14.4: Draft Editing (In-Memory)

Modify nodes/edges in draft workspace (same UI as v10 visual editor)
Changes saved to draftState JSON (not to workflow definitions)
Can revert changes (reset to original)

Milestone 14.5: Simulation Service

NEW SERVICE: DraftSimulationService
Method: simulateExecution(draftId): SimulationResult

Load draft state (nodes, edges, inputs)
Run v9 graph execution engine in simulation mode (no DB writes)
If draft has task templates (v11), simulate task generation
Return: predicted task list, timeline, dependencies, completion date



Milestone 14.6: Simulation Results Display

Button: "Simulate Execution"
Results panel:

"This draft will create X tasks"
Estimated duration: Y days
Critical path: [list of steps]
Risk factors: [warnings, e.g., "Step Z has no assignee"]




Capability C: Draft vs Reality Comparison
Users can compare draft against current reality side-by-side.
Milestone 14.7: Comparison Service

NEW SERVICE: DraftComparisonService
Method: compare(draftId, executionId): ComparisonResult

Load draft state and current execution state
Diff nodes (added, removed, modified)
Diff edges (added, removed, modified conditions)
Diff inputs (changed values)
Calculate impact: tasks added/removed, timeline shift, cost delta



Milestone 14.8: Side-by-Side Comparison UI

Split view: Draft (left), Current Reality (right)
Color-coded diffs:

Green: added nodes/edges
Red: removed nodes/edges
Yellow: modified nodes/edges


Table: list of changes with descriptions

Milestone 14.9: Impact Analysis Display

Summary panel:

Tasks added: +4
Tasks removed: -2
Net tasks: +2
Timeline shift: +3 days (delayed)
Cost delta: +$500


Click item → shows details (which tasks, why delayed)


Capability D: Draft Commit (Apply Changes)
Users can apply draft changes to create new workflow versions or amendments.
Milestone 14.10: Commit Draft as New Workflow Version

Button: "Apply Draft as New Version"
Creates new workflow definition version (v6 versioning)
Copies draft nodes/edges to workflow definition
Deactivates old version, activates new version
Redirects to workflow list with success message

Milestone 14.11: Commit Draft as Amendment

Button: "Apply Draft as Amendment" (only if draft based on execution)
Creates amendment record (v15 - will be integrated when v15 built)
Triggers amendment approval workflow (if configured)
Does NOT immediately apply (waits for approval)

Milestone 14.12: Draft History & Versioning

Users can save multiple draft versions (auto-save every 30s)
Draft history: list of saved snapshots with timestamps
Can revert to earlier draft version
Can delete drafts (soft delete, keep for audit)


Status: ⏸️ Planned
Dependencies:

REQUIRES: v9 (graph execution engine for simulation)
REQUIRES: v11 (task generation for preview)
NO MODIFICATIONS to authoritative tables (drafts stored separately)

Modifications to Existing Code:

NEW TABLE: workflowDrafts (stores draft state JSON)
NEW SERVICES: DraftSimulationService, DraftComparisonService
NEW UI: Draft workspace page, comparison view
EXTENDS: v6 versioning (commit draft → new version)
INTEGRATION POINT: v15 amendments (commit draft → amendment)

Backwards Compatibility:

No changes to existing workflow or task tables
Drafts are completely isolated (separate table)
Simulation has no side effects (read-only operation)


## v15 — In-Flight Workflow Amendments (Change Orders) 📋 (Planned)
What this is

Request amendment to running workflow execution
Visual editor shows current state + proposed changes (uses v14 draft infrastructure)
Preview impact (tasks cancelled, tasks added, data changes)
Multi-stakeholder approval workflow (nested approval)
Atomic application (all changes or none)
Full audit trail (before/after snapshots)

Design Intent
Enable mid-flight corrections while maintaining audit integrity and requiring explicit approval.

Capability A: Amendment Request Creation
Users can propose amendments to running workflow executions.
Milestone 15.1: Amendment Data Model

NEW TABLE: workflowAmendments (id, workflowExecutionId, requestedBy, requestedAt, status, amendmentType, beforeSnapshot, afterSnapshot, impactAnalysis, approvalWorkflowId, appliedAt, appliedBy, rejectionReason)
status: 'pending' | 'approved' | 'rejected' | 'applied'
amendmentType: 'add_step' | 'remove_step' | 'modify_inputs' | 'cancel_tasks'
beforeSnapshot: JSON (full execution state before amendment)
afterSnapshot: JSON (proposed execution state after amendment)
impactAnalysis: JSON (tasks affected, cost delta, timeline shift)

Milestone 15.2: Request Amendment UI

From workflow execution detail (v7), button: "Request Amendment"
Opens amendment workspace (reuses v14 draft infrastructure)
User modifies execution state (add/remove nodes, change inputs)
Button: "Submit Amendment Request"

Milestone 15.3: Amendment Simulation (Reuse v14)

When creating amendment, automatically run simulation (v14 DraftSimulationService)
Store simulation results in impactAnalysis JSON
Display impact preview to user before submission


Capability B: Amendment Approval Workflow
Amendments require approval from stakeholders before application.
Milestone 15.4: Nested Approval Workflow Creation

When amendment submitted, create new workflow execution for approval
Use predefined "Amendment Approval" workflow (configured in v6)
Assign to stakeholders based on amendment type:

Input changes → Finance approval
Task cancellations → Warehouse approval
Add/remove steps → Admin approval


Store approval workflow ID in approvalWorkflowId

Milestone 15.5: Amendment Approval UI

Approvers see amendment in their inbox (v7 inbox)
Approval step shows:

Original execution state
Proposed changes (visual diff)
Impact analysis (tasks affected, timeline, cost)


Actions: [Approve] [Reject] [Request Changes]

Milestone 15.6: Approval Tracking

Track approval chain: who approved, when, comments
If any stakeholder rejects → amendment status = 'rejected'
If all approve → amendment status = 'approved' (ready to apply)

---

v15 — In-Flight Workflow Amendments (Change Orders) (Planned)
What this is

Request amendment to running workflow execution
Visual editor shows current state + proposed changes (uses v14 draft infrastructure)
Preview impact (tasks cancelled, tasks added, data changes)
Multi-stakeholder approval workflow (nested approval)
Atomic application (all changes or none)
Full audit trail (before/after snapshots)

Design Intent
Enable mid-flight corrections while maintaining audit integrity and requiring explicit approval.
Dependencies

REQUIRES: v14 (draft & simulation infrastructure)
REQUIRES: v11 (task generation for add/remove tasks)
REQUIRES: v9 (Temporal runtime interpreter + signal plumbing)
REQUIRES: v8 (OCR utilization tracking for redo eligibility)
MODIFIES: v4 task status enum (add cancelled_by_amendment)
MODIFIES: v9 workflow executions (add amendmentHistory)

Modifications to Existing Code
NEW Data Model:

workflowAmendments table (NEW)

Fields: id, workflowExecutionId, requestedBy, status, amendmentType, beforeSnapshot, afterSnapshot, impactAnalysis, approvalWorkflowId, appliedAt


todos.status enum - EXTEND:

ADD: 'cancelled_by_amendment' status
Existing statuses: pending, in_progress, completed, cancelled
Tasks with this status: visible in UI, linked to amendment record


workflowExecutions table - EXTEND:

ADD: amendmentHistory (JSON array)
Stores: amendment ID, timestamp, who applied, what changed



NEW Services:

AmendmentSimulationService (uses v14 draft infrastructure)

Create draft from current execution state
Apply proposed changes
Compute impact diff


AmendmentApprovalService

Create nested approval workflow (uses v9 Temporal runtime interpreter + activities)
Assign to stakeholders
Track approval chain


AmendmentApplicationService

Apply amendment in database transaction
Cancel tasks (mark as cancelled_by_amendment)
Generate new tasks (via v11 TaskGenerationService)
Update execution inputs
Check OCR utilization: If amendment affects evidence (attachments/OCR), verify OCR redo eligibility (v8)
Append to amendmentHistory
Rollback on failure (all-or-nothing)



OCR Utilization Integration (NEW):
Amendment Impact on OCR:

If amendment modifies workflow inputs that were sourced from OCR data:

System checks: utilizationType of related OCR results
If Category A/B utilized → ❌ Block amendment with message "Cannot amend: OCR data used to create authoritative record"
If Category C utilized → ⚠️ Warn user "OCR data was exported. Amendment may create inconsistency. Archive original OCR?"
If non-utilized → ✅ Allow amendment freely



Amendment Marks OCR as Utilized:

When amendment is applied (status='applied'):

If amendment uses OCR data → mark OCR as utilizationType='workflow_committed' (Category B)
Prevents future OCR redo (hard utilization)



Example Scenario:

User confirms OCR extraction (invoice amount: $1,000)
User starts workflow execution with input { amount: 1000 } (sourced from OCR)
User creates invoice record from OCR → OCR marked Category A utilized
User requests amendment to change amount to $1,200
System checks OCR utilization → blocks amendment with message:

"Cannot amend workflow input 'amount': source OCR data (invoice.pdf) was used to create invoice #INV-001 (authoritative record). OCR redo not allowed."


User must:

Option 1: Create new invoice with correct amount (don't amend workflow)
Option 2: Cancel workflow entirely, redo OCR, restart workflow



Governance Alignment

Amendment request doesn't mutate (creates pending record)
Approval required from multiple stakeholders
Application is atomic (DB transaction)
Original execution state preserved (append-only history)
Amendment creates new records (doesn't delete old tasks)
"Undo amendment" creates new amendment (forward-moving)
OCR utilization rules respected (can't amend if source OCR data created authoritative record)

Backwards Compatibility

Existing tasks with old status values work unchanged
Amendment history optional (null for old executions)
Cancelled tasks still visible (not deleted)
Existing OCR results without utilization tracking treated as "unknown" (amendment allowed with warning)

Amendment + OCR Constraint Summary:

Amendments cannot modify workflow data if the source OCR extraction was used to create authoritative records (Category A) or committed in prior workflow approvals (Category B). Soft-utilization (Category C) triggers warnings but doesn't block amendments.

## v16 — Undo & Correction Semantics 📋 (Planned)

What this is
- Undo restores system validity, not historical state
- Corrections are explicit, forward-moving, and auditable
- No silent rollback or time travel

Design Intent
Provide safety guarantees after correction power exists (v13, v15).

---

### Capability A: Undo Operations (Forward-Moving)
Users can undo previous actions via compensating transactions.

Milestone 16.1: Undo Action Types
- Define which actions can be undone:
  - ✅ Task edits (create reverse edit)
  - ✅ Dependency changes (recreate removed dependency)
  - ✅ Amendments (create reversal amendment - already in v15)
  - ❌ Workflow executions (cannot undo completed actions)
  - ❌ Evidence uploads (cannot un-upload, can mark as invalid)
  - ❌ Physical actions (shipments, payments) - compensate instead

Milestone 16.2: Undo Service
- NEW SERVICE: UndoService
- Method: undoAction(auditLogId): UndoResult
  - Load audit log entry (contains before/after state)
  - Determine action type (task edit, dependency change, etc.)
  - Create compensating action (reverse the change)
  - Execute compensating action (via existing APIs)
  - Link undo to original action (audit trail)

Milestone 16.3: Undo UI
- From audit log view, button: "Undo" (next to each entry)
- Not all actions can be undone (button disabled if not undoable)
- Confirmation modal: "This will reverse [action]. Continue?"
- On undo: create new audit entry (linked to original)

---

### Capability B: Compensation for Irreversible Actions
Some actions cannot be undone, only compensated.

Milestone 16.4: Compensation Action Types
- Identify irreversible actions:
  - Completed shipments → issue return authorization
  - Sent payments → issue refund/credit note
  - Sent emails → send correction email (cannot unsend)
  - Completed approvals → create reversal approval workflow

Milestone 16.5: Compensation Service
- NEW SERVICE: CompensationService
- Method: compensate(actionType, actionId): CompensationOptions
  - Return available compensation actions for given action type
  - Example: completed shipment → [Issue Return, Issue Credit Note]

Milestone 16.6: Compensation UI
- For irreversible actions, button: "Compensate" (instead of "Undo")
- Modal shows compensation options:
  - "This action cannot be undone. Choose compensation:"
  - [Option 1: Issue Return] [Option 2: Issue Credit Note]
- Selecting option creates new workflow/task for compensation

---

### Capability C: Undo Permissions & Approval
Not all users can undo actions; some undos require approval.
Milestone 16.7: Undo Permission Rules
- Users can undo their own recent actions (within 24 hours)
- Admins can undo any action (with reason required)
- Critical actions (e.g., undo amendment) require additional approval

Milestone 16.8: Approval-Required Undo
- For critical undos, create approval workflow (reuse v9 approval system)
- Assign to appropriate approver (based on action type)
- Undo only executed after approval granted
- If rejected, undo request marked as denied (audit logged)

Milestone 16.9: Undo Audit Trail
- Every undo creates audit entry:
  - "User [X] undid action [Y], reason: [Z]"
  - Link to original action (bidirectional)
  - Timestamp, actor, reason (required for admin undos)

---

### Capability D: Undo History & Validation
Track undo history and prevent cascading issues.

Milestone 16.10: Undo Chain Tracking
- EXTEND audit log: add undoneBy field (FK to audit log ID)
- Track undo chains: action → undo → undo of undo (full history)
- Display undo chain in audit log UI (tree view)

Milestone 16.11: Undo Validation
- Prevent undo if:
  - Original action already undone (cannot undo twice)
  - Dependent actions exist (e.g., cannot undo task creation if task has children)
  - System state changed incompatibly (e.g., workflow completed)
- Return validation error with explanation

Milestone 16.12: Cascading Undo Prevention
- When undoing action with dependencies, show warning:
  - "This action has 3 dependent actions. Undo them first?"
  - Option: [Cancel] [Undo All] (requires admin)
- If "Undo All" selected, create undo transaction (atomic)

---

Status: ⏸️ Planned

Dependencies:
- REQUIRES: v13 (graph-governed editing with audit trail)
- REQUIRES: v15 (amendment system)
- EXTENDS: Existing audit log system
- NO NEW TABLES (extends audit log structure)

Modifications to Existing Code:
- EXTEND: Audit log table (add undoneBy FK, undoReason field)
- NEW SERVICE: UndoService, CompensationService
- NEW UI: Undo buttons in audit log, compensation modals
- MODIFY: CRUD APIs (support undo/compensation context)

Backwards Compatibility:
- Existing audit entries work unchanged (new fields nullable)
- Undo creates new entries (doesn't modify history)

---

## v17 — Assistive Planning & Intelligence (Advisory Only) 📋 (Planned)

What this is
- Advisory insights over authoritative and draft graphs
- Risk indicators, prioritization, and recommendations
- All outputs are derived, explainable, and non-executing
- Human remains the decision-maker

Design Intent
Intelligence is earned after governance, visibility, and correction are solid (v8-v15). Focus on augmenting human judgment, not replacing it.

---

### Capability A: Workflow Optimization Suggestions
System analyzes completed workflows and suggests improvements.

Milestone 17.1: Historical Data Collection
- Track workflow execution metrics:
  - Average completion time per step
  - Approval vs rejection rates
  - Time spent in each state (pending, in progress)
  - Bottleneck frequency (which steps delay most often)
- Store in analytics database (separate from operational DB)

Milestone 17.2: Optimization Analysis Service
- NEW SERVICE: WorkflowOptimizationService
- Method: analyzeWorkflow(workflowId): OptimizationReport
  - Analyze historical executions (last 50-100 instances)
  - Identify patterns: slow steps, high rejection rates, frequent bottlenecks
  - Generate suggestions: remove redundant steps, parallelize independent steps, adjust timeouts

Milestone 17.3: Optimization Suggestions UI
- In workflow editor (v6/v10), tab: "Optimization Insights"
- Display suggestions:
  - "Step X is a bottleneck (avg 48hrs delay) - consider adding more approvers"
  - "Steps Y and Z could run in parallel (no dependencies)"
  - "Step W has 80% rejection rate - review requirements"
- Each suggestion: [Apply] [Dismiss] buttons

---

### Capability B: Risk Scoring & Early Warnings
System predicts execution risks based on historical patterns.
Milestone 17.4: Risk Scoring Model
- Train simple model (logistic regression or rules-based) on historical data:
  - Input features: assignee workload, step complexity, input values
  - Output: probability of delay (0-100%)
- Store model in analytics database

Milestone 17.5: Risk Scoring Service
- NEW SERVICE: RiskScoringService
- Method: scoreExecution(executionId): RiskScore
  - Load execution state and inputs
  - Apply risk model
  - Return risk score + explanation (which factors contributed)

Milestone 17.6: Risk Indicators UI
- In execution detail (v7), display risk badge:
  - Green (0-30%): Low risk of delay
  - Yellow (30-70%): Moderate risk
  - Red (70-100%): High risk
- Click badge → shows risk breakdown:
  - "Assignee has 12 pending tasks (high workload risk)"
  - "Step has 60% historical rejection rate"

---

### Capability C: Priority Recommendations
System suggests which tasks/workflows to prioritize.

Milestone 17.7: Priority Scoring
- Calculate priority score for each task/workflow:
  - Critical path: higher priority
  - Due date proximity: higher priority
  - Blocking other work: higher priority
  - Historical delay risk: higher priority
- Combine factors into single priority score (0-100)

Milestone 17.8: Priority Recommendation Service
- NEW SERVICE: PriorityRecommendationService
- Method: recommendPriorities(userId): PriorityList
  - Get all pending items for user
  - Calculate priority scores
  - Sort by score (highest first)
  - Return ranked list with explanations

Milestone 17.9: Smart Inbox (Enhanced v7 Inbox)
- In user inbox (v7), add toggle: "Smart Sort" (default: chronological)
- When enabled, sorts by priority score instead of timestamp
- Display priority indicator (High/Medium/Low badge)
- Tooltip: "High priority because: on critical path, due tomorrow"

---

### Capability D: Resource Allocation Advice
System suggests rebalancing workload across assignees.

Milestone 17.10: Workload Analysis
- Track assignee workload metrics:
  - Current pending count
  - Average completion time
  - Acceptance rate (how often they approve vs reject)
- Compare to team average (identify overloaded vs underutilized)

Milestone 17.11: Rebalancing Suggestions
- NEW SERVICE: ResourceAllocationService
- Method: suggestRebalancing(): RebalancingSuggestions
  - Find overloaded assignees (>2x team average)
  - Find underutilized assignees (<0.5x team average)
  - Suggest transferring tasks from overloaded to underutilized
  - Consider skills/roles (don't suggest transferring CFO approval to junior staff)

Milestone 17.12: Rebalancing UI
- Admin dashboard: "Workload Rebalancing"
- Display suggestions:
  - "User A has 15 pending tasks (team avg: 5) - suggest reassigning 5 tasks to User B"
  - List of tasks recommended for reassignment
- Buttons: [Apply Suggestion] [Customize] [Dismiss]

---

### Capability E: Anomaly Detection
System flags unusual patterns that may indicate issues.

Milestone 17.13: Anomaly Detection Rules
- Define anomaly types:
  - Execution taking 3x longer than historical average
  - Unusual approval pattern (user who normally approves is rejecting)
  - Workflow stuck in same step for >X days
  - Sudden spike in new workflow starts

Milestone 17.14: Anomaly Detection Service
- NEW SERVICE: AnomalyDetectionService
- Method: detectAnomalies(): AnomalyList
  - Run anomaly detection rules on current state
  - Compare to historical baselines
  - Return list of detected anomalies with severity (low/medium/high)

Milestone 17.15: Anomaly Alerts UI
- Admin dashboard: "Anomaly Alerts" widget
- Display recent anomalies:
  - "Execution #123 stuck in approval for 10 days (avg: 2 days)"
  - "User X rejected 5 tasks today (avg: 1 rejection/week)"
- Click anomaly → shows detail view with context

---

Status: ⏸️ Planned

Dependencies:
- REQUIRES: Significant execution data (6+ months of production usage)
- REQUIRES: v12 (dependency graph for critical path analysis)
- NO MODIFICATIONS to authoritative data (read-only analytics)

Modifications to Existing Code:
- NEW DATABASE: Analytics database (separate from operational DB)
- NEW SERVICES: Optimization, risk scoring, priority, resource allocation, anomaly detection
- NEW UI COMPONENTS: Optimization insights tab, risk badges, smart inbox, rebalancing dashboard
- NO CHANGES to core workflow or task execution logic

Backwards Compatibility:
- All features are opt-in (users can ignore suggestions)
- No automatic execution (human always decides)

---

## v18 — Real-Time Collaboration (Multiplayer Mode) 📋 (Planned)

What this is
- Multiple users viewing workflow simultaneously see live updates
- Presence indicators ("Alice and Bob are viewing this")
- Live updates (see changes as they happen)
- Comment threads on specific nodes
- Notification toasts (remote actions)

Design Intent
Collaboration is a multiplier, not a foundation. Add after core orchestration is solid (v9-v15).

---

### Capability A: WebSocket Infrastructure
Real-time communication layer for live updates.

Milestone 18.1: WebSocket Gateway (Backend)
- Install Socket.IO for NestJS: @nestjs/websockets, @nestjs/platform-socket.io
- NEW: WorkflowGateway (WebSocket gateway class)
- Endpoints:
  - workflow:join - user joins workflow room
  - workflow:leave - user leaves room
  - workflow:update - broadcast change to all room members

Milestone 18.2: WebSocket Client (Frontend)
- Install socket.io-client library
- Create WebSocket service: WebSocketService
- Methods: connect(), disconnect(), joinRoom(workflowId), emit(event, data)
- Auto-reconnect on connection loss

Milestone 18.3: Connection Management
- Establish WebSocket connection on app load (authenticated users only)
- Maintain connection pool (one connection per user session)
- Handle reconnection after network disruption (exponential backoff)

---

### Capability B: Presence Tracking
Show who is currently viewing workflows/tasks.

Milestone 18.4: Presence Data Model
- In-memory store (Redis): presence:{resourceType}:{resourceId} = [userId1, userId2, ...]
- TTL: 5 minutes (auto-expire if user doesn't send heartbeat)
- Resource types: workflow, execution, task

Milestone 18.5: Presence Join/Leave
- On page load (workflow/execution/task detail), emit presence:join event
- Backend adds user to presence set
- Broadcast to room: "User X joined"
- On page unload, emit presence:leave event
- Backend removes user from presence set
- Broadcast: "User X left"

Milestone 18.6: Presence UI
- Display presence indicators at top of page:
  - "3 people viewing: Alice (you), Bob, Charlie"
  - Avatar icons with initials
  - Hover → shows full name and role
- Update in real-time as users join/leave

---

### Capability C: Live Update Broadcasting
Changes made by one user appear instantly for all viewers.

Milestone 18.7: Change Event Broadcasting
- MODIFY CRUD APIs: after successful mutation, emit WebSocket event
- Example: task updated → emit task:update event with taskId
- Example: workflow step approved → emit workflow:step_completed event
- All users in same room receive event

Milestone 18.8: Client-Side Event Handling
- Subscribe to events on page load
- On task:update event → re-fetch task data, update UI
- On workflow:step_completed → re-fetch execution detail, show toast
- Debounce fetches (don't spam server if many events in quick succession)

Milestone 18.9: Optimistic UI (Optional)
- When user makes change, update UI immediately (optimistic)
- Send request to backend
- If request fails, rollback UI change
- If request succeeds, already updated (no flicker)

---

### Capability D: Comment Threads
Users can comment on workflows, tasks, and specific nodes.
Milestone 18.10: Comments Data Model
- NEW TABLE: comments (id, resourceType, resourceId, parentCommentId, authorId, content, createdAt, updatedAt)
- resourceType: 'workflow', 'execution', 'task', 'workflow_node'
- parentCommentId: FK to comments (for threaded replies, null for top-level)

Milestone 18.11: Comments API
- POST /comments (create comment)
- GET /comments?resourceType=task&resourceId=123 (list comments)
- PATCH /comments/:id (edit comment - own comments only)
- DELETE /comments/:id (delete comment - own comments only)

Milestone 18.12: Comments UI
- Comments panel (right sidebar or bottom section)
- Display threaded comments (indent replies)
- Add comment: text input + "Post Comment" button
- Real-time: new comments appear instantly (via WebSocket)

Milestone 18.13: Comment Notifications
- When comment added, broadcast comment:new event
- Show toast notification: "Bob commented on [resource]"
- Click toast → scroll to comment
- Mark comment as read/unread (optional)

---

### Capability E: Activity Feed & Notifications
Users see real-time activity stream of changes.

Milestone 18.14: Activity Feed
- Display recent activity in sidebar:
  - "Alice approved Step X (2m ago)"
  - "Bob commented on Task Y (5m ago)"
  - "System created 3 tasks (10m ago)"
- Real-time updates via WebSocket
- Filter by activity type (approvals, comments, edits)

Milestone 18.15: Notification Toasts
- Show toast on important events:
  - Your task was reassigned
  - Workflow step assigned to you
  - Someone commented on your task
- Toast auto-dismiss after 5 seconds
- Click toast → navigate to resource

---

### Capability F: Redis Pub/Sub for Multi-Instance Scaling
Support multiple backend instances (horizontal scaling).

Milestone 18.16: Redis Adapter Integration
- Install @socket.io/redis-adapter
- Configure Socket.IO to use Redis pub/sub
- All WebSocket events published to Redis
- All backend instances subscribe to Redis
- Broadcast events reach all connected clients (across all instances)

Milestone 18.17: Multi-Instance Testing
- Deploy 2+ backend instances
- Connect clients to different instances
- Verify: event on instance A reaches clients on instance B
- Test failover: kill instance A, clients reconnect to instance B

---

Status: ⏸️ Planned

Dependencies:
- CAN BE ADDED INDEPENDENTLY (no blockers)
- WORKS BEST AFTER: v9/v10 (more events to broadcast)
- EXTENDS: Existing remark system (comments are separate but similar)

Modifications to Existing Code:
- NEW TABLE: comments (threaded comments on resources)
- NEW INFRASTRUCTURE: WebSocket gateway (Socket.IO), Redis (for scaling)
- MODIFY: CRUD APIs (emit WebSocket events after mutations)
- NEW UI COMPONENTS: Presence indicators, comments panel, activity feed, toasts

Backwards Compatibility:
- WebSocket is opt-in (fallback to polling if connection fails)
- Works without WebSocket (just loses real-time features)
- Comments stored in database (available even without WebSocket)

---

## v19 — External Channels & Integrations 📋 (Planned)

What this is
- External capture surfaces (Telegram, email, API, mobile)
- Capture-only by default (no automatic execution)
- Optional explicit handoff into governed workflows

Design Intent
Integrations are surfaces, not core capabilities. Capture inputs from external channels but maintain governance rigor.

---

### Capability A: Public API for Task/Workflow Creation
External systems can create tasks and start workflows via REST API.

Milestone 19.1: API Authentication
- Generate API keys for external clients
- NEW TABLE: apiKeys (id, clientName, keyHash, permissions, createdAt, lastUsedAt)
- Authentication: Bearer token in Authorization header
- Rate limiting: 1000 requests/hour per key

Milestone 19.2: Task Creation API (Public)
- Extend POST /tasks endpoint to accept API key auth (in addition to user auth)
- Validation: same rules as user-created tasks
- Audit log: record source (api_key) and client name

Milestone 19.3: Workflow Start API (Public)
- Extend POST /workflows/executions to accept API key auth
- Requires: workflowId, inputs (validated against workflow input schema)
- Returns: executionId (client can poll for status)

Milestone 19.4: API Documentation
- Generate OpenAPI spec (Swagger)
- Publish docs: /api/docs
- Include examples for common use cases

---

### Capability B: Email Integration (Inbound)
Emails sent to specific addresses create tasks automatically.

Milestone 19.5: Email Parser Service
- NEW SERVICE: EmailParserService
- Integrate email provider API (e.g., SendGrid Inbound Parse, AWS SES)
- Webhook endpoint: POST /webhooks/email (receives parsed email)
- Extract: subject (task title), body (task description), attachments

Milestone 19.6: Email-to-Task Mapping
- Configure email rules:
  - tasks@app.com → creates task in default stage
  - urgent@app.com → creates task in "Urgent" stage
  - project123@app.com → creates task linked to project
- Store rules in database: emailRules table

Milestone 19.7: Email Attachment Handling
- Save email attachments to storage (reuse v3 attachments system)
- Link attachments to created task
- Trigger OCR if attachment is PDF/image (optional, user-configured)

---

### Capability C: Telegram Bot Integration
Users can create tasks and check status via Telegram.

Milestone 19.8: Telegram Bot Setup
- Register bot with BotFather (Telegram)
- Install node-telegram-bot-api library
- NEW SERVICE: TelegramBotService
- Handle commands: /create, /status, /list

Milestone 19.9: User Linking
- Users link Telegram account to app account:
  - In app settings, click "Connect Telegram"
  - Bot sends unique token to user
  - User sends token to bot → accounts linked
- Store mapping: telegramUsers table (telegramId, userId)

Milestone 19.10: Task Creation via Telegram
- Command: /create [title] [description]
- Bot creates task via internal API (on behalf of user)
- Bot replies: "Task created: [taskId]"
- Command: /status [taskId] → bot replies with task status

---

### Capability D: Webhook Outbound (Event Notifications)
System sends webhooks to external URLs when events occur.

Milestone 19.11: Webhook Configuration
- NEW TABLE: webhooks (id, url, events, secretKey, isActive)
- Events: task.created, task.updated, workflow.started, workflow.completed
- UI: admin page for managing webhooks

Milestone 19.12: Webhook Delivery Service
- NEW SERVICE: WebhookDeliveryService
- On event trigger (task created, workflow completed, etc.):
  - Find active webhooks subscribed to event
  - Send POST request to webhook URL
  - Include HMAC signature for authentication (using secretKey)
  - Retry on failure (3 attempts with exponential backoff)
  - Log delivery status (success, failure, retry count)

Milestone 19.13: Webhook Logs
- Store delivery logs: webhookLogs table (id, webhookId, event, payload, statusCode, responseTime, attemptCount)
- UI: view webhook delivery history
- Filter by status (success, failure, pending retry)

---

### Capability E: Mobile App (Capture & Inbox)
Native mobile apps for iOS/Android (read-only + task creation).

Milestone 19.14: Mobile App - Task Creation
- Simple form: title, description, due date, stage
- Camera integration: take photo → attach to task
- Voice-to-text: dictate task description

Milestone 19.15: Mobile App - Inbox View
- Display user's pending tasks and workflow steps (reuse v7 inbox data)
- Push notifications: new task assigned, workflow step pending
- Quick actions: approve, reject, acknowledge (reuse v7 APIs)

Milestone 19.16: Mobile App - Offline Mode
- Queue actions when offline (create task, approve step)
- Sync when online (send queued actions to backend)
- Conflict resolution if backend state changed while offline

---

Status: ⏸️ Planned

Dependencies:
- EXTENDS: Existing task/workflow APIs (public API, webhooks)
- NO MODIFICATIONS to core systems (integrations are additive)

Modifications to Existing Code:
- NEW TABLES: apiKeys, emailRules, telegramUsers, webhooks, webhookLogs
- NEW SERVICES: EmailParserService, TelegramBotService, WebhookDeliveryService
- EXTEND: Task/workflow APIs (support API key authentication)
- NEW: Mobile apps (separate codebase, consume existing APIs)

Backwards Compatibility:
- All integrations are opt-in (can be disabled)
- Existing user/session auth unchanged
- API keys are separate auth mechanism (doesn't conflict)

---

## v20 — Multi-Tenancy & Collaboration Semantics 📋 (Planned)

What this is
- Organization/workspace isolation
- Shared workflow templates across organizations
- Per-org governance rules and customization
- No shared mutation authority (each org owns their data)

What this is not
- Not replacing single-tenant model (backward compatible)
- Not cross-org data access (strict isolation)
- Not shared workflow executions (each org's executions are private)

Design Intent
Enable multiple organizations to use the platform while maintaining strict data isolation and per-org governance customization.

---

### Capability A: Organization Data Isolation
All data is scoped to organizations with strict access control.

Milestone 20.1: Organization Data Model
- NEW TABLE: organizations (id, name, slug, createdAt, settings)
- settings: JSON (org-specific configuration, branding, feature flags)
- NEW TABLE: organizationMemberships (id, organizationId, userId, role, joinedAt)
- role: enum ('owner', 'admin', 'member', 'viewer')

Milestone 20.2: Tenant Scoping (All Tables)
- EXTEND ALL EXISTING TABLES: add organizationId (FK to organizations)
- Tables affected: todos, stages, remarks, attachments, ocrResults, workflowDefinitions, workflowExecutions, dependencies, etc.
- Index on organizationId for query performance
- Foreign key constraints: ON DELETE CASCADE (delete org → delete all data)

Milestone 20.3: Row-Level Security (Database)
- Implement PostgreSQL Row-Level Security (RLS) policies
- Policy: Users can only access rows where organizationId matches their membership
- Applies to all tables with organizationId column
- Prevents accidental cross-org data leaks at database level

Milestone 20.4: Organization Context Middleware
- Backend middleware: extract current organization from JWT token (or subdomain)
- Add organizationId to request context (available in all services)
- All queries automatically filter by organizationId
- Prevents manual filtering bugs (database RLS is backup)

---

### Capability B: Organization Management
Platform admins and org owners can manage organizations.

Milestone 20.5: Organization CRUD (Platform Admin)
- Platform admin UI: create, edit, delete organizations
- Create org: name, slug (subdomain), owner user
- Edit org: name, settings (branding, feature flags)
- Delete org: soft delete (mark inactive, don't drop data immediately)

Milestone 20.6: Organization Switching (User UI)
- If user belongs to multiple orgs, show org switcher in navbar
- Dropdown: list of orgs with user's role
- Click org → switches context (refreshes data for new org)
- Current org displayed in navbar (e.g., "Acme Corp")

Milestone 20.7: Subdomain-Based Routing (Optional)
- Support org-specific subdomains: acme.app.com, initech.app.com
- Extract org from subdomain → set org context
- If subdomain not found, redirect to org selector page
- Single-org mode: if user only belongs to one org, auto-select

---

### Capability C: Organization Member Management
Org admins can invite users, assign roles, and manage permissions.

Milestone 20.8: Member Invitation Flow
- Org admin can invite users via email
- Send invitation email with signup/login link
- On signup/login, user automatically added to org with specified role
- Invitation expiration: 7 days (configurable)

Milestone 20.9: Member Role Management
- Org admin can change member roles (owner, admin, member, viewer)
- Role hierarchy: owner > admin > member > viewer
- Permissions by role:
  - Owner: full access, can delete org, manage billing
  - Admin: manage members, workflows, settings (cannot delete org)
  - Member: create tasks/workflows, execute workflows
  - Viewer: read-only access

Milestone 20.10: Member Removal
- Org admin can remove members
- Removed user loses access to org data immediately
- If user has pending workflow assignments → reassign or leave pending (configurable)
- Audit log: record who removed whom, when

---

### Capability D: Shared Workflow Templates
Organizations can share workflow templates publicly or with specific orgs.

Milestone 20.11: Template Sharing Model
- EXTEND workflowDefinitions: add sharingMode enum ('private', 'public', 'specific_orgs')
- private: only visible to own org (default)
- public: visible to all orgs (template marketplace)
- specific_orgs: visible to specific orgs (whitelist)
- NEW TABLE: workflowSharingPermissions (id, workflowDefinitionId, sharedWithOrganizationId)

Milestone 20.12: Template Marketplace UI
- Page: /templates/marketplace (public templates from all orgs)
- Browse templates by category, search by name
- Template detail: description, author org, usage stats
- Button: "Copy to My Organization" → clones template to own org

Milestone 20.13: Template Import/Clone
- When importing template from marketplace:
  - Clone workflow definition (nodes, edges)
  - Set organizationId to current org
  - Remove sensitive data (assignments, org-specific config)
  - Mark as "Imported from [source org]" in description

---

### Capability E: Per-Org Governance Customization
Each organization can customize governance rules, stages, and settings.

Milestone 20.14: Org-Specific Stages
- Stages (v3) are now org-scoped (already have organizationId from 20.2)
- Each org defines own stages (different orgs can have different stage names/colors)
- Default stages: on org creation, clone "Standard Stages" template

Milestone 20.15: Org-Specific Settings
- Settings stored in organizations.settings JSON:
  - Branding: logo, primary color, name
  - Feature flags: enable/disable specific features per org
  - Defaults: default stage for new tasks, default assignee rules
  - Notifications: email/slack settings (org-level)

Milestone 20.16: Org Settings UI
- Page: /settings/organization (admin only)
- Tabs: General, Branding, Features, Stages, Integrations
- General: org name, subdomain
- Branding: upload logo, choose colors (applied to org's UI)
- Features: toggle feature flags (enable/disable v8-v20 features per org)

---

### Capability F: Billing & Subscription Management
Organizations can have different subscription tiers with feature access control.

Milestone 20.17: Subscription Data Model
- NEW TABLE: subscriptions (id, organizationId, plan, status, currentPeriodStart, currentPeriodEnd, stripeCustomerId, stripeSubscriptionId)
- plan: enum ('free', 'professional', 'enterprise')
- status: enum ('active', 'canceled', 'past_due', 'trialing')
- Link to Stripe subscription ID (for payment processing)

Milestone 20.18: Feature Access Control by Plan
- Define feature matrix:
  - Free: v1-v7 (tasks, workflows, basic features)
  - Professional: v1-v11 (adds visual builder, dynamic tasks)
  - Enterprise: v1-v20 (full feature set)
- Middleware: check org's subscription plan before allowing feature access
- If feature not available, show upgrade prompt

Milestone 20.19: Billing UI
- Page: /settings/billing (org owner only)
- Display: current plan, usage stats, next billing date
- Actions: upgrade, downgrade, cancel subscription
- Integrate Stripe Checkout for payment processing

---

### Capability G: Audit & Compliance (Multi-Tenant)
Audit logs and compliance features work across organizations.
Milestone 20.20: Org-Scoped Audit Logs
- All audit log entries include organizationId
- Org admins can view audit logs for their org only
- Platform admins can view audit logs across all orgs (for compliance)
- Audit log export: CSV download per org (GDPR compliance)

Milestone 20.21: Data Retention Policies
- Per-org data retention settings:
  - Completed tasks: delete after X days (configurable)
  - Workflow executions: archive after X days
  - Audit logs: retain for X years (compliance requirement)
- Background job: run nightly, purge data per retention policies

Milestone 20.22: Data Export (GDPR)
- Org owner can request full data export
- Generate ZIP: all tasks, workflows, executions, evidence, audit logs (JSON format)
- Include privacy notice, data schema documentation
- Deliver via email download link (expires in 7 days)

---

### Capability H: Migration & Rollout
Migrate existing single-tenant system to multi-tenant architecture.

Milestone 20.23: Default Organization Creation
- On system upgrade, create "Default Organization"
- Migrate all existing data to default org (set organizationId = default org ID)
- All existing users become members of default org
- System continues to work as single-tenant for existing users

Milestone 20.24: Opt-In Multi-Tenant Mode
- Feature flag: ENABLE_MULTI_TENANT (default: false)
- When enabled:
  - Show org switcher in UI (if user belongs to >1 org)
  - Enable org creation UI (for platform admins)
  - Enable org-specific subdomains (if configured)
- Gradual rollout: enable for pilot orgs first

Milestone 20.25: Backward Compatibility Testing
- Test: single-tenant users unaffected (see no org switcher, no behavior change)
- Test: multi-tenant users can switch orgs, see correct data
- Test: no cross-org data leaks (user A in org X cannot see org Y data)
- Test: RLS policies enforced (database-level isolation verified)

---

Status: ⏸️ Planned

Dependencies:
- REQUIRES: All previous versions (v1-v19) must be stable
- MODIFIES: Every single table in the database (add organizationId)
- MAJOR MIGRATION: All existing data must be assigned to default organization

Modifications to Existing Code:
- EXTEND: All tables with organizationId column
- NEW TABLES: organizations, organizationMemberships, subscriptions, workflowSharingPermissions
- NEW MIDDLEWARE: Organization context extraction (from JWT or subdomain)
- DATABASE: PostgreSQL Row-Level Security (RLS) policies
- MODIFY: All service methods (automatically filter by organizationId)
- NEW UI: Org switcher, org management, member management, billing

Backwards Compatibility:
- Single-tenant mode preserved (default org for existing users)
- Feature flag controls multi-tenant features (opt-in)
- Existing users see no changes until admin enables multi-tenant mode

Risk:
- VERY HIGH: Adding organizationId to every table is massive migration
- HIGH: Row-Level Security bugs could leak data across orgs
- MEDIUM: Performance impact (every query filters by organizationId)

Risk Mitigation:
- Extensive testing: automated tests for cross-org isolation
- Gradual rollout: pilot with test orgs before full launch
- Database backup before migration (rollback plan)
- RLS policies as backup (defense-in-depth strategy)

---


---

## Superseded Versions

The following version specifications have been superseded and are retained here for audit trail only.
Do not reference these for implementation decisions.

---

## v8 — Evidence Review & Derived Data Verification (Visual) ❌ (Superseded by v8.1)

**Status:** Superseded / Partially Deferred
**Actual Implementation:** See **v8.1** below.

**What this is (Vision)**
- Visual, side-by-side inspection of source documents and extracted OCR data
- Complete OCR retrieval & confirmation workflow (draft → confirm → utilize)
- Utilization tracking and redo eligibility enforcement
- **[DEFERRED]** Field-to-source linkage via highlights / bounding boxes
- **[DEFERRED]** Per-field confidence indicators and unresolved-field tracking
- Explicit user-corrected extraction revisions with full audit trail
- Option-C archive mechanism for soft-utilization redo scenarios

**Modifications from Original Plan**
The core logic (Review, Confirm, Utilize, Redo, Archive) was implemented in **v8.1** using existing v3.5 infrastructure to accelerate delivery. The advanced visual features (bounding boxes, per-field confidence) are **DEFERRED** to future versions (e.g., v8.6) if needed.

**What this is not**
- No authoritative data mutation (OCR data is baseline for record creation, not the record itself)
- No automatic correction or learning
- No workflow coupling initially (workflow integration deferred to post-v9)

**Dependencies**
- **REQUIRES:** v3 (OCR system)
- **REQUIRES:** v3 (Attachments system)
- **NO MODIFICATIONS** to v5/v6/v7 workflow system

---


Modifications to Existing Code
v3 OCR Service - EXTENDS:

OCR Retrieve (Draft Creation):

User clicks "Retrieve OCR" on attachment
System calls OCR engine, stores result in ocrResults with status='draft'
confirmedData is null (draft suggestions not yet confirmed)
Draft is visible only in OCR review UI (not used in tables, exports, calculations)


Confirm Submit:

User reviews draft suggestions in editor
User may amend values freely (edit, add, remove fields)
User clicks "Confirm Submit"
System saves edited values to confirmedData field
Set status='confirmed', confirmedAt=now(), confirmedBy=currentUser
Confirmed data becomes read-only (displayed but not editable)


Utilization Detection:

System tracks when confirmed OCR data is used:

Category A: Record creation API called with OCR data as source → set utilizationType='record_created'
Category B: Workflow approval using OCR data → set utilizationType='workflow_committed' (future v7 integration)
Category C: Export/download triggered → set utilizationType='data_exported'


First utilization sets utilizedAt timestamp (cannot be changed)


Redo Eligibility Check:

Before allowing "Redo OCR" action:

If utilizationType='record_created' → ❌ Block with message "Cannot redo: authoritative record created"
If utilizationType='workflow_committed' → ❌ Block with message "Cannot redo: workflow approval committed"
If utilizationType='data_exported' and status!='archived' → ❌ Block with message "Cannot redo: data exported. Use 'Archive & Redo' option."
If utilizationType='none' → ✅ Allow redo




Option-C Archive & Redo:

User clicks "Archive & Redo" (only available for Category C)
System sets status='archived' on current OCR result
Archived result becomes invisible to:

OCR review UI (doesn't show in "current extraction")
Validation logic (doesn't check against archived data)
Export functions (excluded from "current" selection)


Archived result remains in database for audit trail
System creates new draft OCR result (allows fresh retrieval)



NEW Frontend Components:

OCR Review Page:

Left pane: PDF/image viewer with OCR overlay
Right pane: Extracted fields editor (editable in draft, read-only after confirm)
Field-level confidence scores (color-coded: green >80%, yellow 60-80%, red <60%)
Highlight on hover (click field → highlight source in document)


Confirm Submit Button:

Visible only when status='draft'
Confirmation modal: "Confirm these extracted values? This action cannot be undone."
After confirm → button changes to "Confirmed ✓" (disabled)


Utilization Status Indicator:

Shows current utilization state:

"Not yet used" (utilizationType='none')
"⚠️ Record created from this extraction" (Category A)
"⚠️ Used in workflow approval" (Category B)
"⚠️ Data exported" (Category C)




Redo Controls:

"Redo OCR" button (visible only if redo eligible)
"Archive & Redo" button (visible only for Category C + not archived)
Disabled state with tooltip explaining why redo blocked



NEW Backend Services:

UtilizationTrackingService:

markUtilized(ocrResultId, type: 'record_created' | 'workflow_committed' | 'data_exported')
Called by:

Record creation APIs (Category A)
Workflow approval handler (Category B, future)
Export endpoints (Category C)


Idempotent (first call wins, subsequent calls ignored)


RedoEligibilityService:

checkRedoEligible(ocrResultId): { allowed: boolean, reason?: string }
Enforces redo rules based on utilization type
Returns user-friendly block reason if not allowed


OCRArchiveService:

archiveAndCreateDraft(ocrResultId): newOcrResultId
Sets current result to status='archived'
Creates new draft OCR result linked to same attachment
Audit log: "Option-C archive applied, new draft created"



User Flows
Flow 1: First-Time OCR (Happy Path)

User uploads invoice PDF → attachment created
User clicks "Retrieve OCR" → draft created, suggestions shown
User reviews, edits "Total Amount" from $1,234 → $1,200
User clicks "Confirm Submit" → confirmed data saved (read-only)
User creates expense record using confirmed data → marked Category A utilized
User later views OCR → sees "Confirmed ✓" with "Cannot redo: record created" message

Flow 2: Export & Redo (Category C)

User confirms OCR extraction → confirmed data saved
User exports to CSV → marked Category C utilized
User realizes extraction was wrong, clicks "Redo" → blocked with message "Data exported, use Archive & Redo"
User clicks "Archive & Redo" → current extraction archived, new draft created
User retrieves OCR again → new suggestions shown
User confirms new extraction → new confirmed data saved (old one invisible)

Flow 3: Non-Utilization Redo (Always Allowed)

User confirms OCR extraction
User views extraction in UI (just looking, no export)
User uses extraction to prefill form (but doesn't submit form)
User realizes mistake, clicks "Redo" → allowed (no hard utilization yet)
System creates new draft, user retrieves OCR again
User confirms new extraction → replaces previous confirmed data

Governance Alignment

Evidence review is user-initiated (explicit "Retrieve OCR" action)
Confirmation is explicit (must click "Confirm Submit")
Confirmed data is immutable (read-only display)
Redo rules prevent data inconsistency (can't redo after record created)
Archive is explicit user action (not automatic)
All state transitions audited (draft → confirmed → utilized → archived)
Non-utilization actions don't block redo (viewing, preview, internal calc)

Backwards Compatibility

Existing ocrResults records get status='confirmed' by default (migration)
Existing records have utilizationType='none' (unknown utilization state)
Old OCR results without confirmed data treated as legacy (can be redone with warning)

What Reads Confirmed OCR Data

Tables displaying extracted fields (filter to status='confirmed' AND status!='archived')
Export functions (CSV, Excel, PDF) - only export confirmed, non-archived
SUM/SUMIF calculations - only sum over confirmed, non-archived
Form prefill - read from confirmed data (if exists)
Record creation APIs - accept confirmed data as input source

What Does NOT Read OCR Data

Draft OCR suggestions (never used outside OCR review page)
Archived extractions (invisible to all read operations)
Tasks, workflows, calendar (OCR is independent)

One-Line Rule

OCR suggests → user confirms → saved data becomes immutable baseline; redo is only possible before real decisions are made, or after explicit archive if the data has left the system.


---

## Canonical Invariants (Stable)

- Explicit > implicit
- Auditability over convenience
- Derived data is never authoritative
- Undo restores validity, not history
- Operational actions are corrected, not undone
- User approval required at every critical decision point
- Graph topology is deterministic (defined by admin, not generated)
- Workflow execution is auditable (every transition logged)
- Evidence is inspectable and correctable (no black-box AI)
- Amendments are forward-moving (append-only history)

---

## v8.6.7 - Universal Field Validation System (2026-02-06)

### Feature Summary
Comprehensive field validation system with auto-normalization, enhanced error visibility, hybrid date input, and support for 10 field types. Values are automatically normalized when possible (silky-smooth UX), and invalid values trigger explicit confirmation modals with visual feedback.

### Field Types Supported (10 total)

**Original 5 Types (Enhanced):**
1. **varchar** - Text fields with character limit validation
2. **int** - Integer fields (auto-removes commas: `1,234` → `1234`)
3. **decimal** - Decimal/monetary fields (auto-removes $, commas: `$1,234.56` → `1234.56`)
4. **date** - Date fields (auto-normalizes to YYYY-MM-DD from 6+ common formats)
5. **currency** - ISO 4217 currency codes (auto-uppercases: `usd` → `USD`)

**New 5 Types (Added):**
6. **email** - Email addresses (auto-lowercases: `User@EXAMPLE.com` → `user@example.com`)
7. **phone** - Phone numbers (strips formatting: `+1 (555) 123-4567` → `15551234567`)
8. **url** - URLs (auto-adds protocol, lowercases hostname: `Example.COM` → `https://example.com`)
9. **percentage** - Percentage values (removes %, formats to 2 decimals: `85%` → `85.00`)
10. **boolean** - Boolean values (normalizes yes/no/y/n/1/0/on/off → `true`/`false`)

### Auto-Normalization Behavior

**Concept**: When a value is **valid but wrong format**, the system auto-normalizes silently (no modal interruption).

**Examples:**
- Date input `31-07-2023 16:09` → auto-normalized to `2023-07-29` ✅ No modal
- Decimal input `$849.00` → auto-normalized to `849.00` ✅ No modal
- Email input `John@Example.COM` → auto-normalized to `john@example.com` ✅ No modal
- URL input `example.com` → auto-normalized to `https://example.com` ✅ No modal
- Boolean input `Yes` → auto-normalized to `true` ✅ No modal

**Invalid values** (cannot be parsed) trigger validation modal:
- Date input `abc` → ❌ Modal: "Invalid date format. Expected YYYY-MM-DD."
- Email input `notanemail` → ❌ Modal: "Invalid email format."

### Date Field Enhancement (Hybrid Input)

**Problem**: Native date picker (`type="date"`) doesn't accept OCR formats like `29-07-2023 14:13`

**Solution**: Hybrid text + date picker
- Primary input: `type="text"` with placeholder "YYYY-MM-DD"
- Accepts any date format from OCR (DD-MM-YYYY, MM/DD/YYYY, YYYYMMDD, etc.)
- Calendar button (📅) overlay provides native date picker for convenience
- Auto-normalizes to ISO 8601 (YYYY-MM-DD) on save

**Supported Date Formats:**
- `DD-MM-YYYY` with/without time: `29-07-2023`, `29-07-2023 14:13`, `29-07-202314:13`
- `YYYY-MM-DD` with time: `2023-07-29 14:13` → `2023-07-29`
- `DD/MM/YYYY` with slashes: `29/07/2023` → `2023-07-29`
- `YYYY/MM/DD` with slashes: `2023/07/29` → `2023-07-29`
- `YY-MM-DD` or `DD-MM-YY` (2-digit year): `23-07-29` → `2023-07-29`
- `YYYYMMDD` (no separators): `20230729` → `2023-07-29`

### Enhanced Error Visibility

**Before**: Invalid fields looked normal with small red text error message

**After**: Multi-layered visual feedback for invalid values
- ⚠️ **Red card background** - Entire field card turns light red (#fef2f2)
- ⚠️ **Red border** - 2px red border instead of gray (#fecaca)
- ⚠️ **Warning icon** - ⚠️ appears next to field label
- ⚠️ **Red label** - Field name turns red
- ⚠️ **Status badge** - Shows "Validation error" in red (not misleading "Assigned")
- ❌ **Error box** - Prominent red error message with ❌ icon
- 🔴 **Red shadow** - Card gets red glow for extra emphasis

**Example**: Currency field with invalid value `abc`
```
⚠️ Currency                    CURRENCY
┌─────────────────────────────────────┐ ← Red border
│ [abc              ]                 │ ← Light red background
│ Validation error  Linked to segment│ ← Red status
│ ┌───────────────────────────────┐  │
│ │ ❌ Currency code must be...   │  │ ← Red error box
│ └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Validation Modal (Fixed)

**Problem**: Validation errors were showing as toast notifications instead of modal

**Fix**: Improved error detection in frontend to properly parse NestJS error responses

**Modal Content:**
- Field label and user's entered value
- Validation error message
- Suggested correction (when available)
- Three actions:
  - **Cancel** - Dismiss and manually correct
  - **Use Suggestion** - Apply auto-corrected value (if available)
  - **Save As-Is** - Override validation and save invalid value (explicit confirmation)

### Backend Implementation

**Validator Service** (`field-assignment-validator.service.ts`):
- Central validation logic for all 10 field types
- Returns `{ valid: boolean, error?: string, suggestedCorrection?: string }`
- `valid: true` with `suggestedCorrection` → auto-normalize
- `valid: false` → show validation modal

**Assignment Service** (`baseline-assignments.service.ts`):
- Auto-applies `suggestedCorrection` when `valid: true`
- Stores normalized value in `assignedValue` column
- Stores validation metadata in `validationValid`, `validationError`, `validationSuggestion` columns
- Throws `BadRequestException` with `requiresConfirmation: true` when `valid: false` and user hasn't confirmed

**Database Schema** (no changes required):
- `baseline_field_assignments` table already has validation columns from v8.6.10
- Works with any field created in Field Library (universal support)

### Frontend Implementation

**Field Assignment Panel** (`FieldAssignmentPanel.tsx`):
- Input attributes map: defines `type`, `inputMode`, `placeholder` for each field type
- Mobile-friendly: correct keyboard for each type (email keyboard for email, tel for phone, etc.)
- Error styling: red card, warning icon, red label, error box
- Date field: hybrid text input + calendar button overlay
- Drag-and-drop: optimistic updates, shows value immediately

**Review Page** (`review/page.tsx`):
- Error detection: checks for `e.body.validation` and `e.body.requiresConfirmation`
- Validation modal: shows when truly invalid values are entered
- Handlers: confirmation, use suggestion, cancel

### User Experience Flow

**Valid but wrong format** (silky-smooth):
1. User drags `31-07-2023 16:09` into date field
2. Value appears immediately in field
3. Backend auto-normalizes to `2023-07-29`
4. Field refreshes with normalized value
5. ✅ Green "Assigned" status

**Invalid value** (explicit confirmation):
1. User types `abc` into date field
2. Value appears immediately in field
3. Backend detects invalid format
4. ⚠️ Validation modal appears with error message
5. User must: Use suggestion (if any), Save as-is, or Cancel

### Future-Proof Design

**Adding new field types** requires only 3 steps:
1. Add type to `FieldCharacterType` enum in `fields.ts`
2. Add validation method in `field-assignment-validator.service.ts`
3. Add input attributes in `FieldAssignmentPanel.tsx`

**All existing features work automatically:**
- ✅ Drag-and-drop from extracted text
- ✅ Auto-normalization
- ✅ Error visibility
- ✅ Validation modal
- ✅ Mobile-friendly keyboards
- ✅ Audit trail

### Technical Details

**Files Modified:**
- Backend: `baseline-assignments.service.ts`, `field-assignment-validator.service.ts`
- Frontend: `fields.ts`, `FieldAssignmentPanel.tsx`, `review/page.tsx`
- Documentation: `executionnotes.md`, `features.md`

**Zero Breaking Changes:**
- Existing field types work as before (with improved auto-normalization)
- Database schema unchanged
- API contracts unchanged
- Backward compatible with all existing baselines

**Performance:**
- No additional database queries
- Validation runs in memory
- Optimistic UI updates for snappy feel

### Compliance

**Aligns with v8.6 Principles:**
- ✅ Backend authoritative (validation runs server-side)
- ✅ Auditability-first (stores validation results in database)
- ✅ No background automation (user triggers every action)
- ✅ Explicit confirmation (modal for invalid values)
- ✅ Minimal localized changes (no new dependencies)

---

