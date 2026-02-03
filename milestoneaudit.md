## v1 � Core Task Management (Complete)

**What this is**
- CRUD for personal tasks with title/description/status/category/pin/duration
- Remarks, audit logging, and basic auth-protected task views

**What this is not**
- No calendar scheduling UI or drag/drop views
- No attachments, OCR, or workflows

**Design Intent**
Task as the single authoritative unit of work.

**Dependencies**
- **NO DEPENDENCIES** (foundational)

**What Was Built**

**Database Schema:**
- `users`: id, email, passwordHash, mustChangePassword, role, isAdmin, failedLoginAttempts, lockUntil, createdAt
- `todos`: id, userId, title, description, done, createdAt, updatedAt, category, isPinned, durationMin, startAt, unscheduledAt, stageKey, parentId (used later), start/duration nullable
- `remarks`: id, todoId, userId, content, createdAt, stageKeyAtCreation
- `audit_logs`: id, userId, actorType, action, module, resourceType, resourceId, details, ipAddress, userAgent, createdAt

**Backend Services:**
- `apps/api/src/todos/todos.service.ts`: task CRUD, search, bulk updates, stage changes, audit deltas
- `apps/api/src/remarks/remarks.service.ts`: add/list/delete remarks tied to a todo
- `apps/api/src/audit/audit.service.ts`: records audit entries for all task/remark mutations

**API Endpoints:**
- `POST /todos`, `GET /todos`, `GET /todos/:id`, `PATCH /todos/:id`, `DELETE /todos/:id`
- `POST /todos/bulk/done|category|delete`
- `GET /remarks/todo/:todoId`, `POST /remarks/todo/:todoId`, `DELETE /remarks/:id`

**Frontend Components:**
- `apps/web/app/page.tsx`: authenticated task list with filters, bulk actions, create/update/delete/pin/duration edits
- `apps/web/app/task/[id]/page.tsx`: task detail with remarks, stage changes, history, audit timeline

**Governance Alignment**
- **Explicit Intent:** All mutations flow through guarded REST endpoints with CSRF + JWT; UI requires explicit clicks/confirmations
- **Auditability:** `audit_logs` captures action/module/resource plus before/after deltas; timestamps on todos/remarks

**Status**
Complete

## v2 � Calendar View (Complete)

**What this is**
- Calendar-based scheduling, drag/drop between unscheduled list and calendar
- Resizing events to change duration; conflict detection and unschedule support

**What this is not**
- No workflow ties or parent/child constraints beyond schedule exclusion rules

**Design Intent**
Provide a visual time allocation view derived from existing tasks.

**Dependencies**
- **REQUIRES:** v1

**What Was Built**

**Database Schema:**
- `todos`: startAt, durationMin, unscheduledAt indexes (`todos_user_start_at_idx`) used for calendar queries
- `user_settings` and `system_settings`: working hours/days, duration bounds for scheduling UI hints

**Backend Services:**
- `apps/api/src/todos/todos.service.ts`: schedule/unschedule with overlap checks, recentlyUnscheduled, list filters by scheduled windows

**API Endpoints:**
- `PATCH /todos/:id/schedule` (schedule/unschedule with conflict detection)
- `GET /todos?scheduledAfter&scheduledBefore` (windowed fetch)
- `GET /todos/recently-unscheduled`

**Frontend Components:**
- `apps/web/app/calendar/page.tsx`: drag/drop calendar, resize handles, unscheduled panel, schedule modal, create-on-slot
- Shared: `ScheduleModal`, `DragContext`, `DraggableTask`, `DroppableZone`, `useScheduledEvents`

**Governance Alignment**
- **Explicit Intent:** Scheduling initiated by explicit drag/drop or modal actions; conflict responses surfaced to user
- **Auditability:** Schedule/unschedule actions logged via audit service with before/after startAt/durationMin

**Status** Complete

## v3 � Document Intelligence (OCR + Attachments) (Complete)

**What this is**
- File attachments on tasks with duplicate-name protection and 20MB limit
- OCR worker integration to extract text and apply to remarks or descriptions

**What this is not**
- No full-text search across OCR outputs; no multi-file workflows

**Design Intent**
Capture supporting documents and convert them into actionable text inside tasks.

**Dependencies**
- **REQUIRES:** v1, v2

**What Was Built**

**Database Schema:**
- `attachments`: id, todoId, userId, filename, storedFilename, mimeType, size, createdAt, stageKeyAtCreation
- `attachment_ocr_outputs`: id, attachmentId, extractedText, metadata, status, createdAt

**Backend Services:**
- `apps/api/src/attachments/attachments.service.ts`: upload/download/delete, duplicate filename guard, stage capture
- `apps/api/src/ocr/ocr.service.ts`: call external worker, store derived output, enforce ownership

**API Endpoints:**
- `GET /attachments/todo/:todoId`, `POST /attachments/todo/:todoId`, `GET /attachments/:id/download`, `DELETE /attachments/:id`
- `GET /attachments/:id/ocr`, `POST /attachments/:id/ocr` (trigger worker), `POST /attachments/:id/ocr/apply` (append to remark/description)

**Frontend Components:**
- `apps/web/app/task/[id]/page.tsx`: attachment uploader with drag state, OCR trigger, OCR results viewer, apply-to-remark/description actions

**Governance Alignment**
- **Explicit Intent:** Uploads and OCR requests initiated per attachment; applying OCR requires explicit target and remark length checks
- **Auditability:** attachment.upload/delete and OCR_REQUESTED/SUCCEEDED/FAILED plus remark/description deltas recorded via audit service

**Status** Complete

## v4 � Parent/Child Task Relationships (Complete)

**What this is**
- Parent-child links with max depth 2, deletion/scheduling safeguards
- Visibility of parents/children and explicit associate/disassociate actions

**What this is not**
- No cross-user linking or recursive hierarchies beyond one level

**Design Intent**
Enable decomposition of work while preventing conflicting lifecycle states.

**Dependencies**
- **REQUIRES:** v1, v2, v3

**What Was Built**

**Database Schema:**
- `todos.parentId` with `todos_parent_id_idx`; parent tasks blocked from scheduling; child count enrichment

**Backend Services:**
- `apps/api/src/todos/todos.service.ts`: parent validation, close/open rules, associate/disassociate helpers, child count enrichment

**API Endpoints:**
- `GET /todos/:id/children`, `GET /todos/:id/parent`
- `POST /todos/:id/associate`, `POST /todos/:id/disassociate`

**Frontend Components:**
- `apps/web/app/task/[id]/page.tsx`: parent/child panels, �Set Parent� & �Remove Parent� modals with required remarks, eligible parent lookup
- `apps/web/app/calendar/page.tsx`: filters out parent tasks from scheduling; unschedule zone respects child restrictions

**Governance Alignment**
- **Explicit Intent:** Association/disassociation require explicit remark input; scheduling blocked for parents at service layer
- **Auditability:** associate/disassociate and parent-blocked schedule attempts logged with before/after parentId and remarks

**Status**
? Complete

## v5 � Workflow Foundations (Backend Only) (Complete)

**What this is**
- Data model and APIs for workflow definitions, steps, executions, and step executions
- Explicit start and step-action endpoints with remark capture

**What this is not**
- No end-user UI; no automation/progression logic beyond recorded actions

**Design Intent**
Persist workflow structure and execution history to enable governed processes.

**Dependencies**
- **REQUIRES:** v1�v4

**What Was Built**

**Database Schema:**
- `workflow_definitions`: id, name, description, version, isActive, workflowGroupId, timestamps
- `workflow_steps`: id, workflowDefinitionId, stepOrder, stepType, name, description, assignedTo, conditions
- `workflow_executions`: id, workflowDefinitionId, resourceType, resourceId, triggeredBy, status, startedAt, completedAt, inputs, outputs, errorDetails, correlationId
- `workflow_step_executions`: id, workflowExecutionId, workflowStepId, actorId, decision, remark, status, startedAt, completedAt

**Backend Services:**
- `apps/api/src/workflows/workflows.service.ts`: create/update workflow definitions and steps, startWorkflow, executeStepAction with remark requirement, getExecution

**API Endpoints:**
- `GET /workflows`, `GET /workflows/:id` (admin)
- `POST /workflows` (create), `PUT /workflows/:id` (update)
- `POST /workflows/:id/execute` (start execution)
- `POST /workflows/executions/:executionId/steps/:stepId/action` (approve/reject/acknowledge with remark)

**Frontend Components:**
- None (backend-only foundation)

**Governance Alignment**
- **Explicit Intent:** Workflow starts and step actions require explicit API calls with DTO validation and mandatory remarks
- **Auditability:** AuditService logs workflow.create/update/start/step_action with before/after snapshots

**Status**
? Complete

## v6 � Workflow Management (Admin UI) (Complete)

**What this is**
- Admin workflow authoring, versioning, activation, and element template library
- Draft editing with validation preview and dry-run explanation

**What this is not**
- No end-user participation; no automated progression

**Design Intent**
Provide governed tooling for admins to define and version workflows and reusable elements.

**Dependencies**
- **REQUIRES:** v1�v5

**What Was Built**

**Database Schema:**
- `workflow_definitions`: versioning + isActive + workflowGroupId for grouped versions
- `workflow_element_templates`: id, templateVersion, templateGroupId, elementType, displayLabel, stepType, defaultConfig, editableFields, validationConstraints, isDeprecated, createdBy

**Backend Services:**
- `apps/api/src/workflows/workflows.service.ts`: createVersion/activate/deactivate/list versions; element template CRUD/versioning/deprecate; listWorkflows

**API Endpoints:**
- `POST /workflows/versions`, `POST /workflows/:id/activate`, `POST /workflows/:id/deactivate`, `GET /workflows/:id/versions`
- `GET /workflows/elements/templates`, `GET /workflows/elements/templates/:id`, `POST /workflows/elements/templates`, `POST /workflows/elements/templates/:id/version`, `PUT /workflows/elements/templates/:id`, `POST /workflows/elements/templates/:id/deprecate`, `GET /workflows/elements/templates/:id/versions`

**Frontend Components:**
- `apps/web/app/workflows/page.tsx`: admin list grouped by workflowGroupId with active badges
- `apps/web/app/workflows/new/page.tsx`: create draft workflow with step builder
- `apps/web/app/workflows/[id]/page.tsx`: workflow detail, validation preview, version history, activate/deactivate, clone version
- `apps/web/app/workflows/[id]/edit/page.tsx`: draft editor (blocked if active)
- `apps/web/app/workflows/elements/page.tsx`: element template library with newest version per group and creation modal

**Governance Alignment**
- **Explicit Intent:** Admin-only guards on all workflow and template endpoints; active version must be explicitly set; editing blocked when active
- **Auditability:** workflow.create/update/create_version/activate/deactivate and element_template create/update/deprecate logged with before/after snapshots

**Status**
? Complete

## v7 � Workflow Participation (User Operations) (Complete)

**What this is**
- User inbox of pending workflow steps assigned to them
- Execution detail trace with step history and action panel for approve/reject/acknowledge (remark required)

**What this is not**
- No automation or background progression; access control remains coarse (not scoped to resource owners yet)

**Design Intent**
Enable end users to take explicit, auditable workflow actions and inspect execution history.

**Dependencies**
- **REQUIRES:** v5, v6

**What Was Built**

**Database Schema:**
- Reuses `workflow_executions` and `workflow_step_executions`; no new tables (assignment enforced via `workflow_steps.assignedTo`)

**Backend Services:**
- `apps/api/src/workflows/workflows.service.ts`: getMyPendingSteps, getExecutionDetail, assignment check in executeStepAction

**API Endpoints:**
- `GET /workflows/my-pending-steps` (user inbox)
- `GET /workflows/executions/:executionId/detail` (read-only trace)
- `POST /workflows/executions/:executionId/steps/:stepId/action` (remark required; assignment enforced)

**Frontend Components:**
- `apps/web/app/workflows/inbox/page.tsx`: user inbox with refresh, pending count, links to execution
- `apps/web/app/workflows/executions/[executionId]/page.tsx`: execution metadata + ordered step history, action panel with remark + confirm flow

**Governance Alignment**
- **Explicit Intent:** Actions gated by remark input and confirmation; assignment enforcement prevents unauthorized step actions
- **Auditability:** Step actions logged with before/after execution status; UI surfaces �no automation� messaging and read-only trace

**Status**
? Complete
