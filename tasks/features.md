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

## v8.5 — Field Builder (Structured Extraction Authoring)

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

## v8.6 — Field-Based Extraction Assignment & Baseline 🚧 (In Progress)
Based on your existing document and ML architecture decisions, here's the complete v8.6 specification with milestones:

**Status:** 🚧 Partially Complete  
**What's Done:** Milestones 8.6.1-8.6.6 (Field Library CRUD, Admin UI, Baseline Data Model, State Machine)  
**What's Pending:** Milestones 8.6.7+ (Extracted Text Pool, Field Assignment, ML Suggestions, Review Page Layout)
Dependencies:

REQUIRES: v8.1 (OCR retrieval & confirmation workflow)
REQUIRES: v8.5 (Field Builder infrastructure)
EXTENDS: v3 OCR system (adds field library + baseline model)
ML INTEGRATION: Uses FastAPI microservice (PaddleOCR + Sentence-BERT)


Capability A — Field Library (Admin-Managed)
Milestone 8.6.1: Field Library Data Model

NEW TABLE: field_library (id, field_key, label, character_type, character_limit, version, status, created_by, created_at, updated_at)

field_key: VARCHAR(255) UNIQUE — Stable identifier (e.g., invoice_number, total_amount)
label: VARCHAR(255) — User-facing display name (e.g., "Invoice Number")
character_type: ENUM('varchar', 'int', 'decimal', 'date', 'currency')
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
int: parseable as integer
decimal: parseable as decimal (2 decimal places)
date: parseable as ISO 8601 date
currency: matches currency format (e.g., $1,234.56 or 1234.56)


If validation fails: return inline guidance (e.g., "Expected number, got text")
Suggest correction: attempt to parse/normalize (e.g., "$1,234" → "1234.00")

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




Capability E — System-Suggested Assignment (ML-Assisted)
Milestone 8.6.13: ML Suggestion Service (FastAPI Microservice)

NEW ENDPOINT (FastAPI): POST /ml/suggest-assignments

Input: { extracted_text_segments: [...], field_keys: [...] }
Process:

Generate embeddings for extracted text (Sentence-BERT)
Generate embeddings for field_keys (Sentence-BERT)
Compute cosine similarity (text → field matching)
For each field, select highest confidence text segment
Apply character type filtering (e.g., field expects int → filter non-numeric)
Return suggestions with confidence scores


Output: { suggestions: [{ field_key, text_segment_id, value, confidence }] }



Milestone 8.6.14: Suggestion Application (NestJS Backend)

NEW SERVICE: SuggestionApplicationService
Method: applySuggestions(baselineId, attachmentId)

Call FastAPI /ml/suggest-assignments with extracted text + active fields
For each suggestion with confidence ≥ 50%:

Create draft assignment in baseline_field_assignments
Set source_segment_id (links to extracted text)
Mark as system-generated (assigned_by = system user)


Store confidence scores in metadata (for display)



Milestone 8.6.15: Suggestion Display (Review Page)

Field Assignment Panel shows system suggestions:

Fields with suggestions: pre-filled with suggested value
Confidence indicator: color-coded badge (High ≥80%, Medium 50-79%, Low <50%)
User can:

Accept: click field, see value, click "Confirm" (saves assignment)
Modify: edit value before confirming (marks as corrected, requires reason)
Clear: remove suggestion (requires reason)


Once user edits field: suggestion is discarded (assigned_by changes to user)




Capability F — User Assignment & Editing
Milestone 8.6.16: Drag-and-Drop Assignment

Implement drag-drop from Extracted Text Pool → Field Assignment Panel
On drop:

Extract text content from segment
Validate against field character_type
If valid: fill field, show success indicator
If invalid: show error tooltip with suggested correction
Require confirmation (modal): "Assign [text] to [field]?" [Cancel] [Confirm]



Milestone 8.6.17: Manual Editing with Validation

User edits field value directly (text input/number input/date picker)
On blur:

Call FieldAssignmentValidator.validate(field_key, value)
If invalid: show inline error message below field
Suggest correction in tooltip (if available)


User decides final value (can override validation warnings, but must acknowledge)

Milestone 8.6.18: Correction Reason Requirement

If user edits pre-filled suggestion or existing assignment:

Show modal: "Why are you correcting this value?"
Text area: correction reason (required, min 10 chars)
[Cancel] [Save Correction]


Correction reason stored in correction_reason field
Audit log: record before/after + reason


Capability G — Review Page Layout & Interaction
Milestone 8.6.19: Three-Panel Layout

Review Page structure:

Left Panel (40% width): Document Preview (PDF/image viewer, no preview for XLSX)
Middle Panel (30% width): Extracted Text Pool (read-only list)
Right Panel (30% width): Field Assignment Panel (interactive form)


Responsive: on mobile, collapse to tabs (Document / Text / Fields)

Milestone 8.6.20: Persistent Panel (Non-Modal)

Field Assignment Panel is always visible (not a modal)
User can scroll through fields while viewing document
Back button in navbar: returns to Task detail page

Milestone 8.6.21: Document Preview Handling

PDF/Image: Show preview with pdf.js (existing from v3)
XLSX: No preview, show message "Excel files have no preview. Download to view."
DOC/DOCX: Explicitly excluded, show error "Word documents not supported"


Capability H — Review → Confirm Lifecycle
Milestone 8.6.22: Reviewed State

Button: "Mark as Reviewed" (only visible when status='draft')
Action: Sets baseline status='reviewed'
Still editable (user can continue assigning fields)
Not usable by system (queries filter to status='confirmed' only)

Milestone 8.6.23: Confirmed State

Button: "Confirm Baseline" (only visible when status='reviewed')
Confirmation modal:

"This will lock the baseline. You will not be able to edit field assignments."
Show summary: "X fields assigned, Y fields empty"
[Cancel] [Confirm]


Action:

Set status='confirmed', confirmed_at=now(), confirmed_by=currentUser
Archive previous baseline (if exists): set status='archived'
Lock editing (UI disables all inputs, shows "Read-Only" badges)



Milestone 8.6.24: Confirmation Occurs on Review Page Only

Confirmation button only on Review Page (not on Task detail)
After confirmation: redirect to Task detail with success toast
Task detail shows baseline status: "Confirmed on [date] by [user]"


Capability I — Utilization Locking
Milestone 8.6.25: Utilization Detection Service

EXTEND existing UtilizationTrackingService (from v8.1):

Method: markUtilized(baselineId, type: 'record_created' | 'workflow_committed' | 'data_exported')
Called by:

Record creation APIs (Category A)
Workflow approval handlers (Category B, future)
Export endpoints (Category C)


Sets: utilized_at (first call wins), utilization_type



Milestone 8.6.26: Utilization Lockout (UI + Backend)

If baseline has utilization_type set:

UI: Disable all editing inputs, show "Read-Only (data in use)" badge
Tooltip: Explain why locked ("Authoritative record created" / "Data exported" / "Workflow approved")
Backend: Reject edit/delete requests with 403 error


Viewing does NOT count as usage (reading baseline data doesn't lock it)

Milestone 8.6.27: Utilization Indicator (Task Detail)

On Task detail page, show baseline utilization status:

"Not yet used" (utilization_type=null)
"⚠️ Record created from this data" (Category A)
"⚠️ Used in workflow approval" (Category B)
"⚠️ Data exported" (Category C)


Click indicator → shows detail (which record, when, by whom)


Capability J — Supported File Types
Milestone 8.6.28: File Type Validation

Supported for extraction:

PDF (with preview)
PNG, JPG, JPEG (with preview)
XLSX (no preview, extraction only)


Explicitly excluded:

DOC, DOCX (show error: "Word documents not supported. Please convert to PDF.")


Validation on upload (v3 attachments service):

Check MIME type
Reject unsupported types with clear error message




## v8.7 — ML Model Training & Fine-Tuning 📋 (Planned)
What this is

Collect user corrections from v8.6 to build training dataset
Fine-tune Sentence-BERT on domain-specific field matching
Improve suggestion accuracy over time (active learning loop)
A/B test model versions to measure improvement

What this is not

Not automatic model updates (admin triggers retraining)
Not real-time learning (batch training, e.g., weekly)
Not mandatory (v8.6 works with pre-trained models)


Capability A: Correction Dataset Collection
Milestone 8.7.1: Correction Data Schema

Use existing baseline_field_assignments table
Filter records where corrected_from IS NOT NULL (user corrected suggestion)
Export format:

json  {
    "text_segment": "INV-12345",
    "suggested_field": "invoice_number",
    "user_assigned_field": "invoice_number",
    "confidence": 0.75,
    "accepted": true
  }
Milestone 8.7.2: Training Data Export API

GET /admin/ml/training-data (admin only)
Query parameters: ?start_date, ?end_date, ?min_corrections=10
Returns: JSON array of correction records
Include: text, suggested field, actual field, confidence, accepted/rejected

Milestone 8.7.3: Training Data Quality Filters

Exclude low-quality corrections:

Corrections with reason="typo" (not model error)
Single-user corrections (might be user-specific preference)
Corrections from first 30 days (users still learning system)


Include high-quality signals:

Corrections made by multiple users (consensus)
Corrections on high-confidence suggestions (model was confident but wrong)




Capability B: Model Fine-Tuning Pipeline
Milestone 8.7.4: Fine-Tuning Script (Python)

NEW: /ml-service/training/finetune.py
Process:

Load correction dataset (from API export)
Split train/val/test (80/10/10)
Fine-tune Sentence-BERT on field matching task
Evaluate: accuracy, precision, recall on test set
Save fine-tuned model to /ml-service/models/minilm-finetuned-v{date}.onnx


Hyperparameters: learning rate, epochs, batch size (configurable)

Milestone 8.7.5: Model Versioning

NEW TABLE: ml_model_versions (id, model_name, version, file_path, metrics, trained_at, is_active)

model_name: 'sentence-bert-field-matching'
version: 'v2024-02-01' (date-based)
file_path: '/ml-service/models/minilm-finetuned-v2024-02-01.onnx'
metrics: JSON (accuracy, precision, recall from evaluation)
is_active: BOOLEAN (only one active version at a time)



Milestone 8.7.6: Model Deployment (Hot Swap)

FastAPI endpoint: POST /ml/models/activate

Input: { version }
Action: Load new model into memory, mark as active in DB
Atomic: old model remains loaded until new model ready
Rollback: if new model fails health check, keep old model active




Capability C: A/B Testing & Performance Tracking
Milestone 8.7.7: Suggestion Acceptance Tracking

EXTEND baseline_field_assignments: add suggestion_accepted BOOLEAN

TRUE: user accepted suggestion without modification
FALSE: user modified or cleared suggestion
NULL: manually entered (no suggestion provided)


Track per model version (link to ml_model_versions.id)

Milestone 8.7.8: A/B Testing Framework

Feature flag: ML_MODEL_AB_TEST=true
When enabled:

50% of requests use model A (current active)
50% of requests use model B (new candidate)


Track acceptance rate per model version
After 1000 suggestions per model: compare metrics

Milestone 8.7.9: Model Performance Dashboard (Admin)

Page: /admin/ml/performance
Display:

Current active model: version, accuracy, acceptance rate
Historical models: list with metrics over time
Trend chart: acceptance rate by week (last 12 weeks)
Recommendation: "Model v2024-02-01 has 5% higher acceptance rate. Activate?"




Capability D: Continuous Improvement Loop
Milestone 8.7.10: Scheduled Retraining (Weekly Batch)

Cron job: Every Sunday at 2 AM
Steps:

Export correction dataset (last 7 days)
If corrections < 100: skip (insufficient data)
Run fine-tuning script
Evaluate new model
If accuracy > current model + 2%: mark as candidate for A/B test
Notify admin: "New model ready for testing"



Milestone 8.7.11: Admin Retraining Trigger (Manual)

Admin can trigger retraining manually:

Button: "Retrain Model" (on ML performance dashboard)
Input: date range for corrections, minimum correction count
Run asynchronously (background job)
Notify admin when complete




## v8.8 — Multi-Language OCR Support 📋 (Planned)
What this is

Support OCR for non-English documents (Spanish, French, German, Chinese, etc.)
Language detection (automatic or manual selection)
Language-specific field matching (embeddings in target language)
Per-org default language settings

What this is not

Not automatic translation (OCR outputs in original language)
Not cross-language field matching (Spanish text → English fields)


Capability A: Language Detection
Milestone 8.8.1: Language Detection Service

Integrate language detection library (langdetect or fasttext)
NEW SERVICE: LanguageDetectionService
Method: detectLanguage(text): LanguageCode

Input: sample text (first 500 chars from OCR output)
Output: ISO 639-1 language code (e.g., 'en', 'es', 'fr', 'zh')
Confidence score (0-100%)



Milestone 8.8.2: Language Field in Data Model

EXTEND extracted_text_segments: add detected_language VARCHAR(5)
EXTEND extraction_baselines: add primary_language VARCHAR(5)
Store detected language for each text segment
Baseline primary language = most common language in segments

Milestone 8.8.3: Language Detection UI

On OCR retrieval: automatically detect language
Display detected language in Review Page header
Badge: "Language: Spanish (98% confidence)"
If confidence <80%: show warning + manual language selector


Capability B: Multi-Language OCR Engine
Milestone 8.8.4: PaddleOCR Multi-Language Support

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

Milestone 8.8.5: Language-Specific Model Loading

Lazy load language models (don't preload all 80 languages)
Cache loaded models in memory (30 min TTL)
If language not cached: download model (one-time), then load


Capability C: Language-Specific Field Matching
Milestone 8.8.6: Multi-Language Embeddings

Use multilingual Sentence-BERT model: paraphrase-multilingual-MiniLM-L12-v2
Supports 50+ languages in same vector space
Replace monolingual model in FastAPI service
No code changes needed (API stays same)

Milestone 8.8.7: Language-Aware Field Suggestions

When suggesting field assignments:

Embed text segments in original language
Embed field labels (translate if needed, or use multilingual embeddings)
Match in shared vector space


Example: Spanish text "Número de factura" matches field "invoice_number"


Capability D: Organization Language Settings
Milestone 8.8.8: Org Default Language

EXTEND organizations.settings: add default_language VARCHAR(5)
Admin can set default language in org settings
Used as fallback if language detection fails
Applied to new attachments automatically

Milestone 8.8.9: User Language Preference

EXTEND users table: add preferred_language VARCHAR(5)
User can set in profile settings
Affects UI language (labels, messages)
Does not affect OCR language (OCR uses detected language)


## v8.9 — Batch Extraction & Processing 📋 (Planned)
What this is

Upload multiple documents at once
Batch OCR processing (queue-based, parallel)
Bulk baseline confirmation (review all, confirm all)
Progress tracking (X of Y documents processed)

What this is not

Not automatic confirmation (user must review each baseline)
Not bulk field assignment (each document assigned independently)


Capability A: Bulk Upload
Milestone 8.9.1: Multi-File Upload UI

On Task detail page: "Upload Multiple Files" button
File picker: allow selecting multiple files (Ctrl+Click or Drag-drop)
Display upload queue: list of files with progress bars
Validation: check file types, max size (20MB each), max count (50 files)

Milestone 8.9.2: Bulk Upload API

POST /attachments/bulk/upload

Input: FormData with multiple files, task_id
Process: save each file, create attachment records
Return: array of attachment IDs


Backend: handle concurrent uploads (use async/await, rate limit per user)


Capability B: Batch OCR Processing
Milestone 8.9.3: OCR Job Queue

Install BullMQ (Redis-based job queue)
NEW QUEUE: ocr-processing-queue
Job structure: { attachmentId, userId, priority }
Worker: processes jobs concurrently (5 workers, configurable)

Milestone 8.9.4: Queue Job Lifecycle

On bulk upload: create OCR job for each attachment
Job states: pending → processing → completed → failed
Store job state in attachment_ocr_outputs.processing_status
Track retries: max 3 attempts, exponential backoff

Milestone 8.9.5: Progress Tracking UI

On Task detail: "Batch Processing" widget
Display: "Processing 12 of 50 documents"
Progress bar (% complete)
List of files: status icon (pending/processing/done/failed)
Auto-refresh every 5 seconds (polling or WebSocket)


Capability C: Bulk Baseline Review
Milestone 8.9.6: Batch Review UI

New page: /tasks/:id/batch-review
Display: grid view of all attachments (thumbnails)
For each attachment:

Thumbnail (PDF first page, image preview)
Status badge (Draft/Reviewed/Confirmed)
Field assignment count (e.g., "5/10 fields assigned")


Click thumbnail → opens Review Page (v8.6)

Milestone 8.9.7: Bulk Confirmation

On Batch Review page: "Confirm All Reviewed" button
Enabled only if all baselines in "Reviewed" state
Confirmation modal:

"This will confirm 12 baselines. Continue?"
Show summary: total fields assigned, empty fields
[Cancel] [Confirm All]


Action: loop through baselines, confirm each (atomic transaction)


Capability D: Error Handling & Retry
Milestone 8.9.8: Failed OCR Handling

If OCR job fails (API timeout, invalid file, etc.):

Mark processing_status='failed'
Store error message in attachment_ocr_outputs.error_details
Display error in UI (red icon, tooltip with error message)
Button: "Retry OCR" (re-queues job)



Milestone 8.9.9: Partial Batch Completion

If batch processing partially fails (some succeed, some fail):

Show summary: "45 succeeded, 5 failed"
Allow user to proceed with successful ones
Option: "Retry Failed" (re-process only failed files)
Option: "Delete Failed" (remove failed attachments)

Integration Notes
v8.6 → v8.7 Integration:

v8.7 uses correction data from v8.6 (baseline_field_assignments)
No schema changes to v8.6 tables
ML model improvements transparent to users

v8.7 → v8.8 Integration:

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
s