# PLAN — v7 Execution Contract (Workflow Participation — Minimal User Operations)

CLAUDE / CODEX:
Read sections 1–5 only.  
Execute **Next Actions** sequentially.  
One concern per task.  
Stop immediately when all tasks are marked ✅ DONE.

This plan governs **v7 Workflow Participation (Minimal User Operations) ONLY**.  
No work beyond v7 is permitted under this plan.

v1–v6 are **complete and locked** and must not be modified unless explicitly stated.

---

## 1. Project Snapshot (Stable)

**Stack**

Frontend: Next.js (App Router, React, TypeScript)  
Backend: NestJS + Drizzle ORM  
Database: PostgreSQL 16  
Auth: JWT (httpOnly cookies)  
Infrastructure: Dockerized (Web → API → DB → OCR Worker)

---

## 2. v7 Scope Lock & Principles

### Purpose (v7)

Establish the **minimum operational surface** that allows users to:
- see workflow work assigned to them
- take explicit, auditable actions
- inspect execution history

This phase deliberately avoids UX expansion, automation, or intelligence.

---

### Scope Lock (v7)

**In Scope**
- User inbox of pending workflow steps
- Read-only workflow execution detail view
- Explicit step actions:
  - approve
  - reject
  - acknowledge
- Mandatory remarks for all step actions
- Full execution trace visibility (read-only)

**Explicitly Out of Scope**
- Workflow authoring or editing
- Workflow versioning or activation
- Automation or background progression
- Timers, SLAs, reminders, notifications
- Task mutation coupling
- Graph views (v8+)
- Undo / correction semantics (v11+)
- Intelligence or advisory features
- Collaboration semantics
- External intake (integrations)

---

### Core Design Rules (Non-Negotiable)

- No workflow step advances without an explicit user action.
- UI must not imply background execution or automation.
- Mandatory remarks are enforced **server-side**.
- Derived UI is informational only; backend records are authoritative.
- Every operational action must be auditable.

**Known Limitation (v7):**
Execution detail endpoint (`GET /workflows/executions/:executionId/detail`) is accessible to all authenticated users. Access control scoped to assigned users, triggerers, or resource owners is deferred to future enhancement.

---

### Definition of Done (All Tasks)

- User participation flow verified manually by user
- No regressions to v5/v6 workflow behavior
- No background automation introduced
- Permission enforcement verified end-to-end
- Mandatory remark enforcement verified server-side
- Audit trail verified for all v7 actions
- Changes are minimal, localized, reversible
- plan.md updated at start and end of work
- executionnotes.md appended (append-only)
- Verification: Manual (owned by user)

---

## 3. Current State (v7 Entry Point)

- v1–v6 complete and locked
- Workflow definitions and executions exist
- Backend supports step actions and execution records
- Admin UI exists for workflow management
- ❌ No user inbox UI
- ❌ No execution trace UI
- ❌ No user-facing participation pages

---

## 4. Next Actions (Execution Queue)

MODE: Workflow Participation — Minimal User Operations (v7 only)  
Sequential execution. One concern per task.

---

### **11.1 Backend Contract Confirmation (Read-Only Audit)**

**Status:** ✅ DONE

**Objective**
Confirm and document existing backend capabilities required for v7.

**Actions**
- Identify endpoints for:
  - listing pending workflow steps for current user
  - retrieving workflow execution + step history
  - performing step actions (approve / reject / acknowledge)
- Confirm:
  - permission enforcement
  - mandatory remark enforcement
  - audit logging behavior

**Rules**
- Read-only analysis
- No code changes
- If gaps exist, document them clearly for 11.2

---

### **11.2 Minimal Backend Additions (Only If Gaps Exist)**

**Status:** ✅ DONE

**Objective**
Add the **minimum** backend surface required to support v7 UI.

**Completed**
- ✅ "My pending steps" endpoint: `GET /workflows/my-pending-steps`
- ✅ Execution detail endpoint (read-only): `GET /workflows/executions/:executionId/detail`
- ✅ Step assignment enforcement: server-side authorization check in `executeStepAction()`
- ✅ No schema changes
- ✅ No new dependencies
- ✅ Follows existing auth, validation, and audit patterns

**Summary**
- Added `getMyPendingSteps()` and `getExecutionDetail()` service methods
- Added two user-facing controller endpoints (JwtAuthGuard only, no AdminGuard)
- Added assignment enforcement: only assigned user may act on steps (ForbiddenException if violated)
- All changes localized to workflows service and controller
- Mandatory remark enforcement and audit logging unchanged
- See [executionnotes.md](executionnotes.md) for implementation details

---

### **11.3 User Inbox — Pending Workflow Steps**

**Status:** ✅ DONE

**Objective**
Provide a user-facing inbox listing pending workflow steps.

**UI Requirements**
- List of pending items assigned to current user
- Each item shows:
  - workflow / execution identifier
  - step type
  - assignment timestamp
- Each item links to execution detail page

**Rules**
- No background polling required
- Manual refresh acceptable
- No auto-navigation or implicit actions

---

### **11.4 Workflow Execution Detail (Read-Only Trace)**

**Status:** ✅ DONE

**Objective**
Provide a read-only execution detail page.

**UI Requirements**
- Execution metadata (workflow name, status)
- Ordered step history showing:
  - step type
  - action taken
  - actor
  - remark
  - timestamp
- Clear indication of current pending step (if any)

**Rules**
- Informational only
- No mutation from this section

---

### **11.5 Workflow Step Action Panel**

**Status:** ✅ DONE

**Objective**
Allow the assigned user to perform an explicit step action.

**UI Requirements**
- Action buttons appropriate to step type
- Mandatory remark input
- Explicit confirmation before submit
- Clear success / error feedback

**Rules**
- No submission without remark
- No optimistic UI progression
- Backend confirmation required before UI state updates

---

### **11.6 Audit & Permission Verification (v7 Coverage)**

**Status:** ✅ DONE

**Summary**
- Added header status messaging, automation reminders, and accessible loading/error affordances in `apps/web/app/workflows/inbox/page.tsx` and `apps/web/app/workflows/executions/[executionId]/page.tsx` to reinforce the no-automation promise without expanding scope.

**Objective**
Verify correctness and safety of v7 operations.

**Checklist**
- Only assigned users can act on steps
- Mandatory remark enforced server-side
- Audit entries exist for:
  - step actions
- Execution trace matches audit and execution records
- No admin-only endpoints exposed to user UI

**Rules**
- No RBAC redesign
- Document findings in executionnotes.md

---

### **11.7 Minimal UX Hardening (Non-Feature)**

**Status:** ✅ DONE

**Objective**
Prevent user confusion without expanding scope.

**In Scope**
- Loading states
- Disabled submit during mutation
- Clear error messages
- Clear “no automation” affordances

**Rules**
- No redesign
- No new UI frameworks
- No scope expansion

---

## 5. Guardrails (Inherited)

### Runtime Preconditions
- Docker services running
- Database migrations applied
- If missing → **STOP**

### Forbidden
- ❌ Background automation or schedulers
- ❌ Implicit step progression
- ❌ Workflow authoring changes
- ❌ Graph views or editing
- ❌ Undo / correction logic
- ❌ Intelligence features
- ❌ External integrations

### Required Patterns
- ✅ Explicit user intent
- ✅ Server-side enforcement
- ✅ Mandatory remarks
- ✅ Audit-first design
- ✅ Page-level orchestration

---

## STOP CONDITION (v7)

Stop immediately when:
- Tasks **11.1–11.7** are all marked ✅ DONE
- No undocumented blockers remain

Do NOT proceed to:
- graph views (v8)
- graph editing (v9)
- drafts / simulation (v10)
- undo semantics (v11)
- intelligence (v12)
- integrations (v13)
- collaboration (v14)

without a **new plan.md**.

---

Last Updated: 2026-02-01
Status: v7 Workflow Participation — tasks 11.1–11.7 complete
