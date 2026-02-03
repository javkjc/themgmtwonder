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

## v1 — Core Task Management (Complete)

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

## v2 — Calendar View (Complete)

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

## v3 — Task State & Document Intelligence Foundations (Complete)

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


## v3.5 — OCR Retrieval & Confirmation Flow (In Progress)

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
🚧 In Progress (currently at task 3 in plan.md)
--- 
## v4 — Structural Task Relationships (Parent / Child) (Complete)

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

## v5 — Workflow Foundations (Backend Only) (Complete)

**What this is**
- Data model and APIs for workflow definitions, steps, executions, and step executions
- Explicit workflow start and step-action endpoints with remark capture
- Inert workflow definitions (no automation or auto-progression)

**What this is not**
- No end-user UI (that's v7)
- No automation or automatic progression logic beyond recorded actions
- No visual flow builder (that's v10)

**Design Intent**
Persist workflow structure and execution history to enable governed processes.

**Dependencies**
- **REQUIRES:** v1 (Core Task Management - for audit system)
- **REQUIRES:** v2 (Calendar View)
- **REQUIRES:** v3 (Document Intelligence)
- **REQUIRES:** v4 (Parent/Child relationships)

**What Was Built**

**Database Schema:**
- `workflow_definitions`: id, name, description, version, isActive, workflowGroupId, createdAt, updatedAt
- `workflow_steps`: id, workflowDefinitionId, stepOrder, stepType, name, description, assignedTo, conditions, createdAt
- `workflow_executions`: id, workflowDefinitionId, resourceType, resourceId, triggeredBy, status, startedAt, completedAt, inputs, outputs, errorDetails, correlationId
- `workflow_step_executions`: id, workflowExecutionId, workflowStepId, actorId, decision, remark, status, startedAt, completedAt

**Backend Services:**
- `apps/api/src/workflows/workflows.service.ts`:
  - Create/update workflow definitions and steps
  - `startWorkflow()`: Initiate workflow execution
  - `executeStepAction()`: Approve/reject/acknowledge step with mandatory remark
  - `getExecution()`: Retrieve execution details with step history

**API Endpoints:**
- `GET /workflows`: List workflow definitions
- `GET /workflows/:id`: Get workflow definition (admin only)
- `POST /workflows`: Create workflow definition
- `PUT /workflows/:id`: Update workflow definition
- `POST /workflows/:id/execute`: Start workflow execution
- `POST /workflows/executions/:executionId/steps/:stepId/action`: Execute step action (approve/reject/acknowledge with remark)

**Frontend Components:**
- None (backend-only foundation)

**Governance Alignment**
- **Explicit Intent:** Workflow starts and step actions require explicit API calls with DTO validation and mandatory remarks
- **Auditability:** AuditService logs `workflow.create`, `workflow.update`, `workflow.start`, `workflow.step_action` with before/after snapshots

**Status**
✅ Complete

---

## v6 — Workflow Management (Admin UI) (Complete)

**What this is**
- Admin workflow authoring, versioning, activation/deactivation
- Element template library for reusable workflow components
- Draft editing with validation preview and dry-run explanation
- Workflow grouping and version management

**What this is not**
- No end-user participation UI (that's v7)
- No automated workflow progression
- No visual flow builder with drag-and-drop (that's v10)

**Design Intent**
Provide governed tooling for admins to define and version workflows and reusable elements. Definition-first, non-executing flow builder.

**Dependencies**
- **REQUIRES:** v1 (Core Task Management)
- **REQUIRES:** v2 (Calendar View)
- **REQUIRES:** v3 (Document Intelligence)
- **REQUIRES:** v4 (Parent/Child relationships)
- **REQUIRES:** v5 (Workflow Foundations)

**What Was Built**

**Database Schema:**
- `workflow_definitions`: 
  - Uses existing table from v5
  - Leverages: versioning, isActive, workflowGroupId for grouped versions
- `workflow_element_templates`: id, templateVersion, templateGroupId, elementType, displayLabel, stepType, defaultConfig, editableFields, validationConstraints, isDeprecated, createdBy, createdAt, updatedAt

**Backend Services:**
- `apps/api/src/workflows/workflows.service.ts`:
  - EXTENDED: `createVersion()`, `activate()`, `deactivate()`, `listVersions()`
  - NEW: Element template CRUD operations
  - NEW: Template versioning and deprecation
  - NEW: `listWorkflows()` with grouping support

**API Endpoints:**
- `POST /workflows/versions`: Create new workflow version
- `POST /workflows/:id/activate`: Activate workflow version
- `POST /workflows/:id/deactivate`: Deactivate workflow version
- `GET /workflows/:id/versions`: List all versions of workflow
- `GET /workflows/elements/templates`: List element templates
- `GET /workflows/elements/templates/:id`: Get template detail
- `POST /workflows/elements/templates`: Create new template
- `POST /workflows/elements/templates/:id/version`: Create template version
- `PUT /workflows/elements/templates/:id`: Update template
- `POST /workflows/elements/templates/:id/deprecate`: Deprecate template
- `GET /workflows/elements/templates/:id/versions`: List template versions

**Frontend Components:**
- `apps/web/app/workflows/page.tsx`: Admin workflow list grouped by workflowGroupId with active version badges
- `apps/web/app/workflows/new/page.tsx`: Create draft workflow with step builder
- `apps/web/app/workflows/[id]/page.tsx`: Workflow detail, validation preview, version history, activate/deactivate controls, clone version
- `apps/web/app/workflows/[id]/edit/page.tsx`: Draft editor (blocked if workflow is active)
- `apps/web/app/workflows/elements/page.tsx`: Element template library showing newest version per group with creation modal

**Governance Alignment**
- **Explicit Intent:** Admin-only guards on all workflow and template endpoints; active version must be explicitly set; editing blocked when workflow is active
- **Auditability:** `workflow.create`, `workflow.update`, `workflow.create_version`, `workflow.activate`, `workflow.deactivate` and `element_template.create`, `element_template.update`, `element_template.deprecate` logged with before/after snapshots

**Status**
✅ Complete

---

## v7 — Workflow Participation (Minimal User Operations) (Complete)

**What this is**
- User inbox for pending workflow steps assigned to them
- Execution detail trace with step history
- Action panel for approve/reject/acknowledge (remark required)
- Full execution trace visibility with audit integrity

**What this is not**
- No automation or background progression (user actions required)
- Access control not yet scoped to resource owners (known limitation documented)
- No visual flow editor for users

**Design Intent**
This version is intentionally **thin**. It establishes the **minimum operational floor** required for downstream reasoning and governance layers.

**Dependencies**
- **REQUIRES:** v5 (Workflow Foundations)
- **REQUIRES:** v6 (Workflow Management - for active workflow definitions)

**What Was Built**

**Database Schema:**
- Reuses `workflow_executions` and `workflow_step_executions` from v5
- No new tables created
- Assignment enforcement via `workflow_steps.assignedTo` field

**Backend Services:**
- `apps/api/src/workflows/workflows.service.ts`:
  - NEW: `getMyPendingSteps()`: Fetch steps assigned to current user
  - NEW: `getExecutionDetail()`: Retrieve execution with full step history
  - EXTENDED: `executeStepAction()`: Assignment check added (validates user is assigned to step)

**API Endpoints:**
- `GET /workflows/my-pending-steps`: User inbox of pending steps
- `GET /workflows/executions/:executionId/detail`: Read-only execution trace
- `POST /workflows/executions/:executionId/steps/:stepId/action`: Execute step action (remark required, assignment enforced)

**Frontend Components:**
- `apps/web/app/workflows/inbox/page.tsx`: User inbox with refresh button, pending count badge, links to execution details
- `apps/web/app/workflows/executions/[executionId]/page.tsx`: 
  - Execution metadata display
  - Ordered step history with status indicators
  - Action panel with remark input and confirmation flow

**Governance Alignment**
- **Explicit Intent:** Step actions gated by mandatory remark input and explicit confirmation; assignment enforcement prevents unauthorized step actions
- **Auditability:** Step actions logged with before/after execution status; UI surfaces "no automation" messaging and read-only execution trace

**Known Limitations:**
- Execution detail access not yet scoped to assigned users or resource owners (documented in v7 governance review for future enhancement)

**Status**
✅ Complete

---

## v8 — Evidence Review & Derived Data Verification (Visual) (Planned)
What this is

Visual, side-by-side inspection of source documents and extracted OCR data
Complete OCR retrieval & confirmation workflow (draft → confirm → utilize)
Utilization tracking and redo eligibility enforcement
Field-to-source linkage via highlights / bounding boxes
Per-field confidence indicators and unresolved-field tracking
Explicit user-corrected extraction revisions with full audit trail
Option-C archive mechanism for soft-utilization redo scenarios

What this is not

No authoritative data mutation (OCR data is baseline for record creation, not the record itself)
No automatic correction or learning
No workflow coupling initially (workflow integration deferred to post-v9)

Design Intent
Derived data must be inspectable, explainable, and correctable by humans
before it is used to explain reality, simulate outcomes, or advise decisions.
OCR suggests → user confirms → saved data becomes immutable baseline; redo is only possible before real decisions are made, or after explicit archive if the data has left the system.
Dependencies

REQUIRES: v3 (OCR system with ocrResults table and state model)
REQUIRES: v3 (Attachments system)
EXTENDS: v3 OCR data model (status, utilization tracking already added in v3)
NO MODIFICATIONS to v5/v6/v7 workflow system (standalone feature initially)

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

## v8.1 - Additional features
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

## v8.5 — Field Builder (Structured Extraction Authoring) (Planned)
What this is

A governed Field Builder inside the Extracted Data Review page that lets a user convert raw extracted text into structured fields (key/value pairs) using explicit, auditable actions. It supports “no fields extracted” situations by allowing the user to build fields manually from the extracted text.

What this is not

No automatic background extraction or auto-field creation

No learning, no model fine-tuning

No authoritative record creation (still derived data)

No silent overwrite of existing fields (all edits are explicit + audited)

No table/line-item intelligence unless explicitly enabled as a separate sub-feature

Design intent

When parsing yields zero or low-quality fields, the user still needs a way to turn evidence into usable structured data while preserving:

explicit intent,

auditability,

backend authority,

and the draft → confirm → utilize lifecycle.

Core UX: How Field Builder works on the Review Page
Layout additions (Review Page)

Existing: Viewer (PDF/image) + Extracted Fields list
Add: “Field Builder” panel that can be toggled

Sections:

Raw Extracted Text (read-only)

Field Builder (authoring tools)

Extracted Fields (current working set)

Primary user flow

User opens Review Page.

If fields exist: user can refine/add fields.

If fields are empty: user uses Field Builder to create fields from extracted text.

User confirms extraction (existing confirm semantics).

After utilization: editing remains blocked (existing C1 rule).

Field Builder capabilities
Capability A — Add Field (Manual)

User can create a new field:

Field name (required)

Field value (required)

Optional field type (text/number/date/currency) — UI validation only unless backend supports types

Mandatory correction/add reason (reuse C2 reason requirement)

Rules

Creating a new field is treated as a “correction-style mutation” (requires reason).

No auto-save; explicit “Add Field” click.

Capability B — Create Field from Text Selection

User selects text in “Raw Extracted Text” and clicks:

“Use Selection as Value”
Then enters a field name (or chooses from suggestions list).

Optional enhancement:

“Use Selection as Label” (if user highlights a label like “Total”)

“Use Selection as Value” (if user highlights a number like “$123.45”)

Rules

Selection does not mutate anything until the user confirms “Create Field”.

Field creation requires a reason.

Capability C — Suggested Field Templates (Non-authoritative)

Provide quick-add templates (pure UI convenience):

Common invoice/receipt fields: Vendor, Date, Total, Tax, Subtotal, Currency, Invoice No.

Common document fields: Reference No, Subject, Amount, Notes

Rules

Templates only pre-fill field names; they do not infer values.

Capability D — Field Normalization Helpers (UI-only)

Small assistive actions that never auto-commit:

Trim whitespace

Normalize currency format (e.g., remove commas) — only when user clicks “Normalize”

Date parse preview (show “interprets as YYYY-MM-DD”) — but store as text unless backend supports typed values

Rules

Helpers require explicit click, and if they change the stored value, they require a reason.

Data model + governance alignment
Authoritative principle

Field Builder does not create a new OCR output record.
It only modifies the draft working extraction fields that will later be confirmed.

Status-based behavior

draft: Field Builder enabled

confirmed: Field Builder read-only; can view raw text + fields

archived: view-only

Utilization-based lockout

If utilizationType is present (C1):

Hide/disable Field Builder inputs

Show badge “Read-only (data in use)” with tooltip reason

Audit + evidence

Every Field Builder mutation must produce:

field name

before/after (or “created”)

reason (mandatory)

timestamp + actor

Review Page behaviors for “No fields extracted”

When parsedFields.length === 0:

Show: “No fields extracted.”

Show helper: “Why no fields were extracted?” (pure UX)

Keep raw extracted text visible

Promote Field Builder CTA: “Create fields from extracted text”

API/implementation notes (non-binding)

This module can be implemented in two ways:

Option 1 (Preferred): Reuse existing correction mechanism

Treat “add field” as a correction entry where fieldKey is new

Backend validates reason (already enforced by C2)

Keeps audit trail consistent

Option 2: Add dedicated endpoint (only if needed)

POST /attachments/:id/extraction/fields to append a draft field

Still requires reason

Still blocks when utilized/confirmed as per governance

Out of scope (explicit)

Automatic key/value detection from raw text without user action

Table/line-item extraction (can be a separate v8.6 module if needed)

OCR engine changes

Background parsing retries

**Task 8.5.1 — Review Page UI: Field Builder panel + empty-state behaviors**

* Add a toggleable **Field Builder** panel to the existing Review Page layout.
* Ensure the page contains 3 clear sections:

  * **Raw Extracted Text (read-only)**
  * **Field Builder (authoring tools)**
  * **Extracted Fields (current working set)**
* Implement “No fields extracted” behaviors:

  * Show message: “No fields extracted.”
  * Keep raw extracted text visible.
  * Promote CTA: “Create fields from extracted text.”
  * Include helper link: “Why no fields were extracted?” (UX-only, no backend behavior).

---

**Task 8.5.2 — Governance gates: status + utilization lockout enforcement (UI + server)**

* Enforce status-based enablement:

  * `draft`: Field Builder enabled
  * `confirmed`: Field Builder read-only (view raw text + fields)
  * `archived`: view-only
* Enforce utilization-based lockout (`utilizationType` present, C1):

  * Disable/hide Field Builder inputs and mutation actions.
  * Show badge: “Read-only (data in use)” with tooltip explaining lock reason.
* Backend must reject any mutation when:

  * extraction is `confirmed` or `archived`
  * or `utilizationType` is present
* UI must reflect lock state accurately (no “looks editable but fails on submit”).

---

**Task 8.5.3 — Capability A: Add Field (Manual) with mandatory reason + audit evidence**

* Implement manual field creation:

  * Field name (required)
  * Field value (required)
  * Optional field type selector: `text | number | date | currency` (UI validation only)
  * Mandatory **reason** (reuse C2 correction/add reason requirement)
  * Explicit submit: **“Add Field”** (no auto-save)
* Behavior rules:

  * Treat add field as a correction-style mutation requiring reason.
  * Mutation produces audit evidence: created fieldKey, value, reason, timestamp, actor.
* Ensure “created” is represented in before/after semantics consistently (before = null/empty).

---

**Task 8.5.4 — Capability B: Create Field from text selection (selection → preview → create)**

* Allow text selection in **Raw Extracted Text** and support actions:

  * “Use Selection as Value” → prompts for field name (manual or from suggestion list)
  * Optional enhancement: “Use Selection as Label” / “Use Selection as Value”
* Rules:

  * Selection does not mutate anything until user clicks **“Create Field”**
  * Field creation requires a **reason**
* UX requirements:

  * Clear preview of the selected text to be used as label/value.
  * Cancel path must discard the selection-based draft (no changes).

---

**Task 8.5.5 — Capability C: Suggested Field Templates (UI convenience only)**

* Provide quick-add templates (non-authoritative UI helpers) such as:

  * Vendor, Date, Total, Tax, Subtotal, Currency, Invoice No
  * Reference No, Subject, Amount, Notes
* Rules:

  * Templates only pre-fill **field names** (no value inference).
  * Choosing a template does not mutate fields until user confirms creation.
  * Final creation still requires a **reason** and produces audit evidence.
* Ensure templates remain optional and do not block manual entry.

---

**Task 8.5.6 — Capability D: Normalization helpers (UI-only, explicit apply, reason if persisted)**

* Implement helper actions that never auto-commit:

  * Trim whitespace (preview/apply)
  * Currency normalization (e.g., remove commas) on explicit click
  * Date parse preview (“interprets as YYYY-MM-DD”) without changing stored value unless user applies
* Rules:

  * Helpers must be explicit (button click) and show preview before applying.
  * If a helper changes the stored field value, the action requires a **reason** and generates audit evidence (before/after).
* Confirm helpers do not create typed backend values unless backend explicitly supports it (store as text by default).


## v9 — Graph-Based Workflow Execution Engine (Backend Foundation) (Planned)

**What this is**
- Migration from linear workflow steps to directed acyclic graph (DAG) model
- Workflow definitions as nodes (steps) + edges (transitions)
- Conditional branching logic (if/then/else routing based on execution inputs)
- Loop execution (for-each iteration with tracking)
- Parallel execution (fork/join gateway pattern)
- Graph validation (DAG checks, orphan node detection)

**What this is not**
- No visual editor yet (Phase 1 is backend-only, visual builder in v10)
- No automatic execution (user actions still required at task nodes)
- No AI-powered suggestions

**Design Intent**
Foundation for visual flow orchestration. Enables complex workflows with branching logic while maintaining explicit user approval at each step.

---

### **Capability A: Graph-Based Workflow Definition**
Workflows can be defined as directed graphs (nodes + edges) instead of linear sequences.

**Milestone 9.1: Graph Data Model (Database Schema)**
- NEW TABLE: `workflowNodes` (id, workflowDefinitionId, nodeType, nodeConfig, positionX, positionY, createdAt)
  - `nodeType`: enum (task, decision, loop, parallel_gateway, join_gateway, start, end)
  - `nodeConfig`: JSON (type-specific config: stepType, evidenceRequirements, loopVariable, conditions, etc.)
  - `positionX/Y`: for future visual editor (optional, can be null)
- NEW TABLE: `workflowEdges` (id, workflowDefinitionId, sourceNodeId, targetNodeId, conditionConfig, label, createdAt)
  - `sourceNodeId`: FK to workflowNodes (outgoing edge from this node)
  - `targetNodeId`: FK to workflowNodes (incoming edge to this node)
  - `conditionConfig`: JSON (condition rules for conditional edges, null for unconditional)
  - `label`: text (human-readable condition description, e.g., "If amount > $10k")

**Milestone 9.2: Graph Data Model Migration Script**
- Write migration script (with dry-run mode) to convert existing `workflowSteps` → `workflowNodes` + `workflowEdges`
- For each workflow definition:
  - Create nodes from steps (1:1 mapping, `nodeType = 'task'`)
  - Create sequential edges (step 1 → step 2 → step 3)
  - Preserve step configuration in `nodeConfig` JSON
- Test migration on staging clone (verify no data loss)

Milestone 9.3: Production Migration Execution

Deploy migration script to production (after staging validation)
Run migration during low-traffic window (backup database first)
Keep workflowSteps table in parallel (6-month grace period, don't drop yet)
Verify migrated data: all workflows converted correctly, no broken references


Capability B: Sequential Graph Execution
Workflows execute as graph traversal (sequential only, no branching/loops/parallel yet).
Milestone 9.4: Graph Execution Service (Linear Mode)

NEW SERVICE: GraphExecutionService
Implement node-to-node transition logic:

Load current node from workflowExecutions.currentNodeId
On node completion → find outgoing edges → select next node
Update currentNodeId to next node
Create pending workflowNodeExecution for next node


Feature flag: USE_GRAPH_EXECUTION=false (disabled by default, runs in parallel with old engine)

Milestone 9.5: Execution State Tracking

EXTEND workflowExecutions table: add currentNodeId (FK to workflowNodes, tracks graph position)
EXTEND workflowExecutions table: add executionState (JSON, tracks per-node status/timestamps/attempts)
Structure: {nodeStates: {nodeId: {status: "completed", startedAt: "...", completedAt: "...", attempts: 1}}}

Milestone 9.6: Node Execution Records

RENAME workflowStepExecutions → workflowNodeExecutions (table rename migration)
MODIFY schema: replace workflowStepId with nodeId (FK to workflowNodes)
ADD: iteration field (for loop tracking, default 0)
ADD: retryAttempt field (for retry logic, default 0)

Milestone 9.7: Parallel Execution Validation

Run graph execution engine alongside old linear engine (same workflow executions, both engines process)
Compare outputs for 1-2 weeks in staging
Log discrepancies for investigation
If outputs match consistently → proceed to feature flag activation


Capability C: v7 User Participation Migration
v7 user-facing APIs work with graph model (backend changes only, no UI changes).
Milestone 9.8: Update v7 APIs (Backend)

MODIFY GET /workflows/my-pending-steps: query workflowNodeExecutions instead of workflowStepExecutions
MODIFY GET /workflows/executions/:id/detail: return node executions instead of step executions
MODIFY POST /workflows/executions/:id/steps/:stepId/action: accept nodeId parameter (support both stepId and nodeId during transition)

Milestone 9.9: v7 UI Compatibility Verification

Test v7 user inbox: still displays pending items correctly (no visual changes)
Test v7 execution detail: still displays step history correctly (terminology may change "step" → "node" in UI text)
Test v7 step actions: approve/reject still works with new backend
No code changes to v7 frontend (backend abstraction handles migration)


Capability D: Conditional Branching Logic
Workflows can route to different paths based on execution input conditions.
Milestone 9.10: Condition Evaluator Service

NEW SERVICE: ConditionEvaluatorService
Integrate json-rules-engine library (or similar)
Support operators: ==, !=, >, <, >=, <=, in, not_in, contains, regex
Support compound conditions: AND, OR, NOT
Method: evaluate(conditionConfig, executionInputs, nodeState): boolean

Milestone 9.11: Decision Node Handler

Add decision node type handler to GraphExecutionService
On entering decision node:

Load outgoing edges (each edge may have conditionConfig)
Evaluate conditions using ConditionEvaluatorService
Select first edge where condition evaluates to true
If no conditions match, select default edge (if exists), else fail execution
Transition to target node


Audit log: record which condition matched, which path taken

Milestone 9.12: Conditional Branching Testing

Test: if/then/else routing (amount > $10k → CFO approval, else → manager approval)
Test: multiple conditions (AND, OR logic)
Test: default path when no conditions match
Test: execution fails gracefully if no valid path (no infinite loops)


Capability E: Loop Execution
Workflows can iterate over arrays (for-each loops with iteration tracking).
Milestone 9.13: Loop Node Handler

Add loop node type handler to GraphExecutionService
On entering loop node:

Read loopVariable from nodeConfig (e.g., "locations")
Get array from executionInputs[loopVariable] (e.g., ["NYC", "LA", "SF"])
For each item in array:

Set iteration counter (1, 2, 3...)
Execute child nodes (nodes within loop body, defined by edge topology)
Create separate workflowNodeExecution per iteration (with iteration field)


After all iterations complete → transition to next node after loop



Milestone 9.14: Loop Iteration Tracking

Store iteration state in executionState JSON (current iteration, total iterations)
Display iteration count in execution detail UI ("Iteration 2 of 3")
Audit log: record iteration start/end for each loop

Milestone 9.15: Loop Testing

Test: for-each loop over 3 items (NYC, LA, SF)
Test: nested loops (loop within loop)
Test: empty array (loop body skipped, no error)
Test: loop with conditional branching inside loop body


Capability F: Parallel Execution
Workflows can execute multiple paths simultaneously with join synchronization.
Milestone 9.16: Parallel Gateway Handler

Add parallel_gateway node type handler to GraphExecutionService
On entering parallel gateway:

Fork execution to all outgoing edges simultaneously
Create separate workflowNodeExecution for each parallel branch
Track branch states independently in executionState JSON



Milestone 9.17: Join Gateway Handler

Add join_gateway node type handler to GraphExecutionService
On entering join gateway:

Wait for all incoming edges to complete (check executionState for all branches)
If any branch still pending → remain at join gateway (do not proceed)
When all branches complete → transition to next node after join


Handle branch failures: if any branch fails, mark join as failed (configurable behavior)

Milestone 9.18: Parallel Execution Testing

Test: fork 2 paths (legal review, finance review), join after both complete
Test: fork 3+ paths
Test: one branch fails → join marked as failed
Test: parallel execution doesn't cause race conditions (concurrent database writes)


Capability G: Production Validation & Rollout
Ensure graph execution engine is stable before full rollout.
Milestone 9.19: Feature Flag Activation (Staging)

Enable USE_GRAPH_EXECUTION=true in staging environment
Monitor for errors, performance issues
Run automated test suite (all graph execution scenarios)
Manual QA: execute workflows in staging, verify correctness

Milestone 9.20: Production Rollout

Enable USE_GRAPH_EXECUTION=true in production (gradual rollout: 10% → 50% → 100%)
Monitor error logs, execution times, database performance
Rollback plan: flip feature flag to false if critical issues detected
After 2-4 weeks of stable operation → consider linear engine deprecated

Milestone 9.21: Deprecation Notice

Mark workflowSteps table as deprecated (add comment in schema)
Add warning logs when old APIs accessed (log: "Legacy workflow step API used, migrate to nodes")
Schedule table drop for 6 months later (after all workflows migrated and validated)


Status: ⏸️ Planned
Dependencies:

REQUIRES: v5 (Workflow foundations - inert definitions)
REQUIRES: v6 (Workflow management - versioning system)
REQUIRES: v7 (Workflow participation - user approval actions)
MODIFIES: v5/v6/v7 workflow system extensively (see milestones above)
MIGRATION REQUIRED: Existing workflowSteps → workflowNodes + workflowEdges

Modifications to Existing Code:

NEW TABLES: workflowNodes, workflowEdges
RENAME TABLE: workflowStepExecutions → workflowNodeExecutions
EXTEND TABLE: workflowExecutions (add currentNodeId, executionState)
NEW SERVICE: GraphExecutionService (replaces linear execution logic)
NEW SERVICE: ConditionEvaluatorService (evaluates branching logic)
MODIFY: v6 workflow APIs (CRUD operations now work with nodes/edges)
MODIFY: v7 user APIs (work with nodes instead of steps, no UI changes)
DEPRECATED: workflowSteps table (kept for 6 months, then dropped)

Backwards Compatibility:

Existing workflow definitions migrated to sequential graphs (no behavior change)
Existing executions complete using old linear model (in-flight executions unaffected)
New executions use graph model after feature flag enabled
v7 user inbox UI unchanged (backend abstraction handles migration)

Risk Mitigation:

Feature flag allows gradual rollout
Migration script has dry-run mode (preview changes before applying)
Keep both tables in parallel (6-month safety net for rollback)
Extensive unit tests for graph execution edge cases (100+ test scenarios)
Parallel execution validation (run both engines, compare outputs)


## v10 — Visual Workflow Builder (Canvas Editor) (Planned)
What this is

Drag-and-drop workflow designer (React Flow based)
Canvas-based node editor with zoom/pan/minimap
Visual node property panels (forms for step configuration)
Conditional logic builder (visual if/then/else)
Auto-layout with manual positioning override
Template library (drag reusable elements)
Real-time validation with error highlighting
Visual dry-run simulation (show execution path)

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

Left sidebar: palette of node types (task, decision, loop, parallel gateway, join gateway)
Drag node from palette → drop on canvas → creates new node
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
Stores positions in workflowNodes.positionX/Y

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
Shows which conditions evaluated to true/false

Milestone 10.13: Step-by-Step Playback

Simulation playback controls: play, pause, step forward, step back
Displays current node (pulsing outline)
Shows variable values at each step (e.g., "amount = $5000")


Capability F: Template Library
Admins can drag pre-configured node templates onto canvas.
Milestone 10.14: Template Palette

Section in left sidebar: "Templates"
Display v6 step templates (from workflowStepTemplates table)
Drag template → drop on canvas → creates node with pre-filled configuration
Can edit after insertion (templates are starting points)

Milestone 10.15: Save Node as Template

Right-click node → "Save as Template"
Input template name
Saves nodeConfig to workflowStepTemplates table
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

REQUIRES: v9 (graph execution engine must be stable)
REQUIRES: v6 (workflow versioning system)
EXTENDS: v6 admin UI (adds visual editor route)
NO MODIFICATIONS to v9 execution engine

Modifications to Existing Code:

NEW UI ROUTE: /workflows/:id/visual-edit (canvas editor page)
NEW APIs: GET/POST /workflows/:id/graph (graph serialization endpoints)
NEW DEPENDENCIES: reactflow, dagre, @monaco-editor/react
EXTENDS: v6 workflow APIs (add graph layout computation)
NO SCHEMA CHANGES (uses existing workflowNodes.positionX/Y fields from v9)

Backwards Compatibility:

Form-based editor (v6) remains functional for power users
Toggle between visual/form modes without data loss
No breaking changes to v6 APIs


## v11 — Dynamic Task Decomposition (Template Variables) (Planned)
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

MODIFY GraphExecutionService loop handler (from v9)
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
MODIFY: v9 GraphExecutionService loop handler (call task generation)
OPTIONAL: Extend todos table with workflowExecutionId (for linking tasks to workflows)

Backwards Compatibility:

Workflows without taskTemplateConfig work unchanged (loops execute normally)
Existing loop nodes (v9) continue to function (just don't generate tasks)
v4 task CRUD APIs unchanged (just called in bulk)


## v12 — Reality View: Relationship & Obligation Graph (Read-Only) (Planned)
What this is

Derived visual graph of real-world entities, obligations, and relationships
Explanation of blocking conditions, dependencies, and current status
Traceability back to evidence, workflows, and source records
Zero execution or mutation authority

Design Intent
Humans should be able to see reality before they are given correction power (v13).

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
REQUIRES: v9 (workflow execution with graph model)
OPTIONAL: v11 (dynamic task decomposition creates richer dependencies)
OPTIONAL: v8 (evidence requirements create evidence dependencies)
NO MODIFICATIONS to existing systems (pure read-only visualization)

Modifications to Existing Code:

NEW TABLE: dependencies (tracks all dependency types)
NEW SERVICES: DependencyGraphService, BlockingAnalysisService, CriticalPathService, BottleneckDetectionService
NEW UI COMPONENTS: Graph viewer, Gantt chart, bottleneck dashboard
NEW DEPENDENCIES: cytoscape or reactflow, gantt-task-react
NO CHANGES to task or workflow execution logic (read-only feature)

Backwards Compatibility:

All existing data readable (no schema changes to v4/v9 tables)
Dependency table is additive (doesn't affect existing features)
System-generated dependencies created via triggers (transparent to users)


## v13 — Graph-Governed Editing (Explicit Mutation) (Planned)
What this is

Explicit, audited edits initiated from graph inspectors
Writes to existing authoritative domain tables only
Strong validation and confirmation requirements
No automation, no implicit side effects

Design Intent
Introduce correction power only after reality is visible and understandable (v12).

Capability A: Task Editing from Graph View
Users can edit task properties directly from dependency graph.
Milestone 13.1: Graph Node Context Menu

Right-click node in graph (v12) → context menu appears
Options: "Edit Task", "View Details", "Delete", "Add Dependency"
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

Milestone 13.6: Remove Dependency

Click dependency edge in graph → "Delete Dependency" option
Confirmation modal: "Are you sure? This will unblock [target entity]"
Audit log: record who deleted, when, reason (optional input)


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


## v14 — Drafts & Simulation (What-If Reasoning) (Planned)
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


## v15 — In-Flight Workflow Amendments (Change Orders) (Planned)
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
REQUIRES: v9 (graph execution to support topology changes)
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

Create nested approval workflow (uses v9 workflow system)
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

## v16 — Undo & Correction Semantics (Planned)

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

## v17 — Assistive Planning & Intelligence (Advisory Only) (Planned)

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

## v18 — Real-Time Collaboration (Multiplayer Mode) (Planned)

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

## v19 — External Channels & Integrations (Planned)

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

## v20 — Multi-Tenancy & Collaboration Semantics (Planned)

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