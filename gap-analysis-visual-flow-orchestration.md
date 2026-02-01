# Gap Analysis: Current State (v1-v7) → Visual Flow Orchestration

**Document Version:** 1.0
**Date:** 2026-02-01
**Baseline:** v1-v7 Complete (workflow management + user participation operational)

---

## Executive Summary

The current v1-v7 implementation provides a **solid foundation** for visual flow orchestration, with 60-70% of the backend architecture already in place. The workflow definition and execution models are well-designed, immutable, and audit-first. However, the **gap to visual flow orchestration is LARGE** — approximately 12-18 months of dedicated engineering work to reach competitive parity with tools like Pipefy or Kissflow.

**Key Findings:**
- ✅ **Strong foundation:** Workflow versioning, execution audit trail, step-based approval flows are production-ready
- ⚠️ **Major gaps:** No visual flow builder, no dynamic task decomposition, no conditional branching engine, no in-flight amendments, no real-time collaboration infrastructure
- 🚧 **Architectural challenges:** Current model is linear step-based; target requires graph-based flow engine with branching, loops, and parallel execution
- 💡 **Recommendation:** Incremental path exists, but requires 3-4 major phases (v8-v11 planned features may need reordering to align with market value)

---

## Feature-by-Feature Gap Analysis

### 1. Visual Flow Builder (Drag-and-Drop Editor)

**Current State (v6):**
- Form-based workflow editor in [apps/web/app/workflows/[id]/edit/page.tsx](apps/web/app/workflows/[id]/edit/page.tsx)
- Step builder with add/remove/reorder buttons
- Text inputs for step properties (name, type, description, JSON assignment/conditions)
- Real-time validation panel (right pane shows errors + dry-run preview)
- Draft-first editing (must deactivate workflow before editing)

**Target State:**
- Canvas-based visual editor (React Flow, Mermaid Live Editor style)
- Drag-and-drop nodes (steps, decisions, loops, parallel gates)
- Visual connectors with conditional logic labels
- Node property panels with form builders (fields, evidence requirements, approvals)
- Template library drag-in (reusable step templates)
- Zoom, pan, mini-map navigation
- Auto-layout and manual positioning
- Undo/redo stack
- Visual diff for version comparison

**Gap Analysis:**

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **UI Paradigm** | Form-based list editor | Canvas-based graph editor | Complete rebuild required |
| **Step Definition** | JSON text inputs | Visual node property panels | Moderate (reuse validation logic) |
| **Flow Structure** | Ordered list (1..N) | Directed graph (nodes + edges) | Major architectural change |
| **Conditional Logic** | JSON string in `conditions` field | Visual branch nodes with rule builder | High (no execution engine exists) |
| **Reusable Elements** | Element templates exist (v6.10.6) | Drag-drop from library | Moderate (backend exists, UI needed) |
| **Visual Preview** | Text-based dry-run | Live graph simulation | High (requires graph render + simulation) |

**Complexity:** **VERY HIGH**

**Build Approach:**
- **Cannot extend v6 editor** — paradigm shift from form to canvas requires complete rewrite
- Recommended library: **React Flow** (battle-tested, 40k+ GitHub stars, supports custom nodes, edges, validation)
- Backend workflow definition schema needs **major extension**:
  - Add `nodes` table (id, type, position x/y, config JSON)
  - Add `edges` table (id, sourceNodeId, targetNodeId, conditionConfig JSON)
  - Deprecate `workflowSteps.stepOrder` (replaced by graph topology)
  - Migration path: convert linear steps → graph nodes (1:1 mapping, sequential edges)

**Estimated Effort:** **4-6 months** (1 senior frontend engineer + 1 backend engineer)

**Dependencies:**
- Must complete **graph-based execution engine** (Feature #6 below) BEFORE visual builder is useful
- Must complete **conditional branching** (Feature #6) BEFORE complex flows are possible

**Risk:**
- **High:** Visual flow builders are complex; UX must be intuitive or users will reject it
- **Medium:** Performance issues with large flows (100+ nodes) need optimization upfront
- **Low:** React Flow is mature, but custom node types require careful design

---

### 2. Dynamic Task Decomposition (Template Variables → Auto-Generated Tasks)

**Current State (v4):**
- Parent/child task relationships exist ([apps/api/src/db/schema.ts:26](apps/api/src/db/schema.ts#L26) - `parentId` field)
- Hard constraints: cannot delete parent with children, cannot set status=completed if children incomplete
- **Static only:** Parent/child links are manually created, no automation
- No task templates or dynamic generation logic exists

**Target State:**
- Workflow step can define task template with variables: `${location}`, `${quantity}`, `${customer_name}`
- User inputs data at workflow start: "3 locations: NYC, LA, SF"
- System auto-generates 3 child tasks: "Ship to NYC", "Ship to LA", "Ship to SF"
- Tasks inherit properties from template (duration, stage, description pattern)
- Dynamic fields populate from workflow execution inputs

**Gap Analysis:**

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **Task Templates** | None | Template syntax with variables | Complete greenfield |
| **Variable Substitution** | None | Expression evaluator for `${var}` | New subsystem required |
| **Bulk Task Creation** | None | Loop over inputs, create N tasks | New service method |
| **Execution Inputs** | `inputs` JSON field exists but unused | Structured input schema with types | Moderate (schema design + validation) |
| **Parent/Child Linking** | Manual only | Auto-link generated tasks to parent | Low (API exists, just invoke it) |
| **Audit Trail** | None for automation | Log "System generated 3 tasks from template X" | Low (extend audit log) |

**Complexity:** **HIGH**

**Build Approach:**
- **Extend v4 parent/child system** (backend ready, just add automation layer)
- New data model additions:
  - `workflowNodes` needs `taskTemplateConfig` field (JSON):
    ```json
    {
      "templateType": "dynamic",
      "titlePattern": "Ship to ${location}",
      "descriptionPattern": "Ship ${quantity} units to ${location}",
      "durationMinutes": 120,
      "stageId": "abc-123",
      "loopVariable": "locations",  // maps to execution.inputs.locations[]
      "parentTaskId": null  // optional: link to parent task
    }
    ```
  - Workflow execution inputs schema (typed inputs, not free JSON):
    ```json
    {
      "locations": ["NYC", "LA", "SF"],
      "customer_name": "Acme Corp",
      "quantity": 100
    }
    ```
- New service: `TaskGenerationService`
  - `generateTasksFromTemplate(nodeConfig, executionInputs, executionId)`
  - Variable substitution using simple template engine (e.g., `handlebars` or custom regex)
  - Bulk insert tasks via `db.insert(todos).values([...])`
  - Create parent/child links via existing todos.parentId field
  - Append audit log: "System created 3 tasks from workflow step 'Shipment Tasks'"

**Estimated Effort:** **2-3 months** (1 backend engineer)

**Dependencies:**
- Requires **graph-based execution engine** to know when to trigger task generation (on step entry)
- Requires **typed input schema** for workflow definitions (extend v6 editor)

**Risk:**
- **Medium:** Variable substitution bugs could create malformed tasks (needs thorough validation + preview)
- **Low:** Parent/child constraints already enforced, just need to invoke them programmatically

---

### 3. Evidence-Based Workflow Gates

**Current State (v3 + v7):**
- **v3 OCR:** User-triggered OCR on attachments, raw text stored immutably, no validation gates
- **v7 Workflow Steps:** User approves/rejects/acknowledges steps with mandatory remark
- **No coupling:** Workflows and OCR are completely independent systems
- Attachments exist per task, OCR extractions stored in `ocrResults` table

**Target State:**
- Workflow step defines evidence requirements:
  - "Must upload invoice PDF"
  - "Must extract `total_amount` field with confidence >= 80%"
  - "Must upload digital signature image"
- Step cannot be marked "complete" until evidence validated
- Visual evidence inspector: side-by-side document + extracted data + confidence scores
- Manual override: admin/manager can approve despite low confidence (audit logged)

**Gap Analysis:**

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **Evidence Config** | None | Step-level evidence requirements schema | Moderate (define JSON schema) |
| **Validation Engine** | None | Check attachments + OCR results vs requirements | High (new validation service) |
| **OCR Confidence** | Stored in ocrResults.rawOcrOutput (JSON) | Exposed as structured field-level data | Moderate (parse existing JSON) |
| **Step Gating Logic** | None (approve/reject is manual) | Cannot approve until evidence valid | Moderate (add precondition check) |
| **Manual Override** | N/A | Admin approval with reason logged | Low (add "override" decision type) |
| **Visual Inspector** | None | Side-by-side UI (planned v8) | High (major frontend feature) |

**Complexity:** **HIGH**

**Build Approach:**
- **Extend v3 OCR + v7 workflow participation**
- Data model additions:
  - `workflowNodes.evidenceRequirements` (JSON):
    ```json
    {
      "requiredAttachments": [
        {
          "label": "Invoice PDF",
          "fileType": "pdf",
          "minCount": 1,
          "maxCount": 1,
          "ocrRequired": true,
          "extractedFields": [
            {
              "fieldName": "total_amount",
              "minConfidence": 0.8,
              "required": true
            },
            {
              "fieldName": "invoice_date",
              "minConfidence": 0.7,
              "required": false
            }
          ]
        }
      ],
      "allowManualOverride": true,
      "overrideRequiresRole": "manager"
    }
    ```
  - `workflowStepExecutions.evidenceValidationResults` (JSON):
    ```json
    {
      "validatedAt": "2026-02-01T10:30:00Z",
      "isValid": false,
      "errors": [
        "Missing attachment: Invoice PDF",
        "Field 'total_amount' confidence 62% below threshold 80%"
      ],
      "overrideApplied": false
    }
    ```
- New service: `EvidenceValidationService`
  - `validateEvidence(executionId, stepId): ValidationResult`
  - Queries attachments for resourceType='workflowExecution', resourceId=executionId
  - Checks OCR results for each attachment
  - Compares confidence scores vs requirements
  - Returns pass/fail + detailed errors
- Modify `executeStepAction` in workflows.service.ts:
  - Before allowing "approve" decision, call `validateEvidence()`
  - If validation fails and no override, reject action with 400 error + validation errors
  - If override allowed, require `overrideReason` in StepActionDto
  - Log override to audit trail

**Estimated Effort:** **3-4 months** (1 backend engineer + 1 frontend engineer for v8 inspector UI)

**Dependencies:**
- **v8 Evidence Review UI** (planned) should come BEFORE this to allow users to see what's missing
- Requires **v3 OCR** to be triggered (already user-driven, but may need workflow integration)

**Risk:**
- **Medium:** OCR confidence thresholds are finicky; users may be frustrated by rejections
- **Low:** Evidence validation is read-only, doesn't mutate data (safe to implement)

---

### 4. In-Flight Workflow Amendments (Change Orders)

**Current State:**
- **No amendment capability** — workflows execute linearly, no edits possible once started
- Workflow definitions are versioned but immutable (create new version, don't edit existing)
- Execution records are append-only (no updates, no deletions)

**Target State:**
- User viewing execution can click "Request Amendment"
- Visual editor shows current flow state + proposed changes
- Changes can include:
  - Add/remove steps
  - Change payment terms, quantities, dates
  - Add/remove locations (which auto-adds/cancels tasks via dynamic decomposition)
- Preview impact: "This will cancel 2 tasks, create 4 new tasks, adjust $100 payment"
- Amendment requires approval from multiple stakeholders (amendment approval workflow)
- Once approved, amendment is applied **atomically** (all changes or none)
- Full audit trail: before/after snapshots, who requested, who approved, timestamp

**Gap Analysis:**

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **Amendment Model** | None | New entity: `workflowAmendments` | Complete greenfield |
| **Draft Amendments** | None | Amendment as draft graph (planned v11) | Very High (v11 feature) |
| **Impact Analysis** | None | Simulate amendment effects before commit | Very High (requires simulation engine) |
| **Multi-Stakeholder Approval** | Basic step approval exists | Nested approval workflow for amendments | High (workflow recursion complexity) |
| **Atomic Application** | None | Transaction-based amendment commit | Moderate (DB transactions exist) |
| **Before/After Snapshots** | None | Snapshot execution state pre/post amendment | Moderate (serialize execution state) |
| **Task Cancellation** | Cannot cancel tasks | Mark tasks as "cancelled_by_amendment" | Low (add status enum) |

**Complexity:** **VERY HIGH**

**Build Approach:**
- **Requires v11 Draft & Simulation infrastructure** (planned but not implemented)
- **This is the most complex feature** — defer to Phase 3 minimum
- Data model additions:
  - `workflowAmendments` table:
    ```typescript
    {
      id: uuid,
      workflowExecutionId: uuid,  // FK to execution being amended
      requestedBy: uuid,  // FK to users
      requestedAt: timestamp,
      status: 'pending' | 'approved' | 'rejected' | 'applied',
      amendmentType: 'add_step' | 'remove_step' | 'modify_inputs' | 'cancel_tasks',
      beforeSnapshot: JSON,  // full execution state before
      afterSnapshot: JSON,   // proposed execution state after
      impactAnalysis: JSON,  // {tasksAdded: 4, tasksCancelled: 2, costDelta: -100}
      approvalWorkflowId: uuid,  // FK to nested approval workflow
      appliedAt: timestamp | null,
      appliedBy: uuid | null,
      rejectionReason: text | null
    }
    ```
  - Extend `todos` status enum: add `'cancelled_by_amendment'`
  - Extend `workflowExecutions` table: add `amendmentHistory` JSON array (audit log)
- New services:
  - `AmendmentSimulationService` - compute impact without mutating
  - `AmendmentApprovalService` - create nested approval workflow
  - `AmendmentApplicationService` - apply amendment in transaction
- Amendment application flow:
  1. User requests amendment → creates draft `workflowAmendment` record (status=pending)
  2. System simulates impact → populates `impactAnalysis` JSON
  3. System creates nested approval workflow → assigns to stakeholders
  4. Stakeholders approve/reject → amendment status updated
  5. If approved, system applies amendment in DB transaction:
     - Update `workflowExecution.inputs` (if modified)
     - Cancel tasks via `UPDATE todos SET status='cancelled_by_amendment'`
     - Generate new tasks via `TaskGenerationService`
     - Append amendment record to `workflowExecution.amendmentHistory`
     - Mark amendment as applied
  6. If transaction fails, rollback (all-or-nothing guarantee)

**Estimated Effort:** **6-9 months** (2 engineers — extremely complex feature)

**Dependencies:**
- **v11 Draft & Simulation** (planned) must be implemented first
- **Dynamic Task Decomposition** (Feature #2) must exist for add/remove tasks
- **Graph-based execution engine** (Feature #6) must support dynamic topology changes

**Risk:**
- **VERY HIGH:** This is the most complex feature; high chance of bugs, edge cases, and UX confusion
- **HIGH:** Nested approval workflows (workflow-within-workflow) are architecturally challenging
- **MEDIUM:** Rollback guarantees are hard to test; requires extensive QA

**Recommendation:** **DEFER to Phase 3 or later** — this is a "killer feature" but too risky for Phase 1

---

### 5. Dependency Visualization & Bottleneck Analysis

**Current State:**
- **No dependency visualization** — tasks and workflows are independent
- Parent/child relationships exist but no graph visualization
- No "why is this blocked?" explanations
- No timeline view or critical path analysis

**Target State:**
- Dependency graph showing:
  - Task A blocks Task B
  - Workflow step C requires evidence from Task D
  - Payment E depends on approval F
- "Why is this blocked?" button → shows blocking chain with explanations
- Timeline view with Gantt chart (tasks + workflows + dependencies)
- Highlight critical path (longest dependency chain)
- Bottleneck detection: "Step X has 10 tasks waiting, assigned to 1 person"

**Gap Analysis:**

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **Dependency Model** | Parent/child only (todos.parentId) | Multi-type dependencies (task→task, task→workflow, workflow→task) | High (new dependency table) |
| **Graph Visualization** | None | Interactive graph (D3.js, Cytoscape.js, React Flow) | High (major frontend feature) |
| **Blocking Explanations** | None | Natural language "why blocked" generator | Moderate (query + text generation) |
| **Timeline View** | Calendar exists (v1-v2) but no Gantt | Gantt chart with dependencies | High (specialized charting library) |
| **Critical Path** | None | Graph traversal algorithm + highlighting | Moderate (algorithm + UI) |
| **Bottleneck Detection** | None | Workload analysis by assignee | Moderate (aggregation query + UI) |

**Complexity:** **HIGH**

**Build Approach:**
- **Extend v9 Reality View (planned)** — this is the "relationship graph" feature
- Data model additions:
  - `dependencies` table:
    ```typescript
    {
      id: uuid,
      sourceType: 'task' | 'workflow_step' | 'workflow_execution',
      sourceId: uuid,
      targetType: 'task' | 'workflow_step' | 'workflow_execution',
      targetId: uuid,
      dependencyType: 'blocks' | 'requires_evidence' | 'requires_approval' | 'parent_child',
      createdBy: 'system' | 'user',  // system-generated vs manual
      createdAt: timestamp,
      metadata: JSON  // {reason: "Requires invoice approval before payment"}
    }
    ```
  - Indexes: (sourceType, sourceId), (targetType, targetId)
- New services:
  - `DependencyGraphService` - build graph from dependencies table + parent/child links
  - `BlockingAnalysisService` - find blocking chain for a given task/workflow
  - `CriticalPathService` - topological sort + longest path algorithm
  - `BottleneckDetectionService` - group by assignee, count pending tasks
- Frontend:
  - Graph visualization: **React Flow** (reuse from visual flow builder)
  - Timeline: **react-gantt-chart** or **dhtmlxGantt**
  - "Why blocked?" modal: simple list of blocking items with links

**Estimated Effort:** **4-5 months** (1 backend engineer + 1 frontend engineer)

**Dependencies:**
- **v9 Reality View** (planned) is the natural home for this feature
- **Dynamic Task Decomposition** (Feature #2) should exist to create meaningful dependencies
- **Evidence-based gates** (Feature #3) create additional dependency types

**Risk:**
- **Medium:** Graph visualization performance with 1000+ nodes/edges requires optimization
- **Low:** Dependency model is read-only (no mutation), safe to implement

---

### 6. Graph-Based Execution Engine (Conditional Branching, Loops, Parallel Execution)

**Current State (v5-v7):**
- **Linear step execution** — workflow steps are ordered 1..N (workflowSteps.stepOrder)
- **No branching logic** — conditions field exists but not evaluated
- **Stop-on-error** — single rejection fails entire workflow
- **Sequential only** — no parallel step execution
- **No loops** — cannot repeat steps or retry failed steps

**Target State:**
- Directed acyclic graph (DAG) execution engine
- Conditional branching:
  - "If invoice_amount > $10,000, route to CFO approval; else route to manager approval"
  - Condition syntax: JSON rules engine (e.g., `{ "field": "invoice_amount", "operator": ">", "value": 10000 }`)
- Loops:
  - "For each location in locations[], execute 'Shipment Step'"
  - Loop iteration tracking (iteration 1 of 3, iteration 2 of 3, ...)
- Parallel execution:
  - "Run 'Legal Review' and 'Finance Review' in parallel, wait for both to complete"
  - Parallel gateway (fork) → multiple paths → join gateway (barrier)
- Error handling:
  - Retry logic: "On failure, retry up to 3 times with 1-hour delay"
  - Escalation: "If step not completed in 24 hours, escalate to manager"
- Execution state machine: pending → running → completed | failed | timed_out | escalated

**Gap Analysis:**

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **Execution Model** | Linear list (stepOrder 1..N) | DAG (nodes + edges) | **MAJOR ARCHITECTURAL CHANGE** |
| **Condition Evaluation** | conditions field exists but unused | JSON rules engine | High (greenfield) |
| **Branching** | None | If/else routing based on conditions | High (new execution logic) |
| **Loops** | None | For-each iteration tracking | High (new execution logic) |
| **Parallel Execution** | None | Fork/join gateway pattern | High (concurrency logic) |
| **Retry Logic** | None | Retry counter + delay scheduler | Moderate (background job queue) |
| **Escalation** | None | Timeout detection + reassignment | Moderate (scheduled task) |
| **State Machine** | Simple status enum | Complex execution state per node | Moderate (extend status field) |

**Complexity:** **VERY HIGH** (This is the **most critical gap** — without this, no advanced flows are possible)

**Build Approach:**
- **COMPLETE OVERHAUL of workflow execution system**
- This is the **foundation** for visual flow orchestration — must be prioritized early
- Data model migration:
  - Deprecate `workflowSteps` table → replace with `workflowNodes` and `workflowEdges`:
    ```typescript
    // workflowNodes
    {
      id: uuid,
      workflowDefinitionId: uuid,
      nodeType: 'task' | 'decision' | 'loop' | 'parallel_gateway' | 'join_gateway' | 'start' | 'end',
      nodeConfig: JSON,  // type-specific config (stepType, evidenceRequirements, loopVariable, etc.)
      positionX: number,  // for visual editor
      positionY: number,
      createdAt: timestamp
    }

    // workflowEdges
    {
      id: uuid,
      workflowDefinitionId: uuid,
      sourceNodeId: uuid,  // FK to workflowNodes
      targetNodeId: uuid,  // FK to workflowNodes
      conditionConfig: JSON | null,  // {field: "amount", operator: ">", value: 10000}
      label: text | null,  // "If amount > $10k"
      createdAt: timestamp
    }
    ```
  - Extend `workflowExecutions`:
    ```typescript
    {
      // ... existing fields ...
      currentNodeId: uuid | null,  // FK to workflowNodes (current position in graph)
      executionState: JSON,  // {nodeStates: {nodeId: {status, startedAt, completedAt, attempts}}}
    }
    ```
  - Extend `workflowStepExecutions` → rename to `workflowNodeExecutions`:
    ```typescript
    {
      // ... existing fields (actorId, decision, remark, status, timestamps) ...
      nodeId: uuid,  // FK to workflowNodes (replaces workflowStepId)
      iteration: number,  // for loops (iteration 1, 2, 3, ...)
      retryAttempt: number,  // for retry logic (attempt 1, 2, 3, ...)
    }
    ```
- New execution engine: `GraphExecutionService`
  - `startExecution(workflowDefinitionId, inputs)`:
    1. Load graph (nodes + edges) from DB
    2. Validate graph (DAG check, no cycles except explicit loops)
    3. Find start node
    4. Create execution record with `currentNodeId = startNodeId`
    5. Transition to first actionable node
  - `executeNode(executionId, nodeId)`:
    1. Load node config
    2. Based on nodeType, dispatch to handler:
       - `task`: create pending nodeExecution, assign to user, wait for approval
       - `decision`: evaluate conditions, choose outgoing edge, transition
       - `loop`: iterate over loopVariable, execute child nodes N times
       - `parallel_gateway`: fork execution to all outgoing edges
       - `join_gateway`: wait for all incoming edges to complete
    3. Update `executionState` JSON with node status
    4. If node completed, transition to next node(s)
  - `transitionToNextNode(executionId, currentNodeId)`:
    1. Load outgoing edges from currentNodeId
    2. Evaluate edge conditions (if any)
    3. Select target node(s) based on conditions
    4. Update `currentNodeId` (or create parallel branches)
    5. Call `executeNode()` for next node(s)
  - `handleNodeCompletion(executionId, nodeId, decision)`:
    1. Mark node as completed in `executionState`
    2. If decision = 'reject', check nodeConfig.errorHandling:
       - If retry allowed, increment retryAttempt, reschedule
       - If no retry, mark execution as failed
    3. If decision = 'approve', transition to next node
- New condition evaluator: `ConditionEvaluatorService`
  - `evaluate(conditionConfig, executionInputs, nodeState): boolean`
  - Supports operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `in`, `not_in`, `contains`, `regex`
  - Example condition JSON:
    ```json
    {
      "operator": "and",
      "conditions": [
        {"field": "invoice_amount", "operator": ">", "value": 10000},
        {"field": "customer_type", "operator": "==", "value": "enterprise"}
      ]
    }
    ```
  - Use library: **json-rules-engine** (battle-tested, 2.5k GitHub stars)
- Migration strategy:
  1. Create `workflowNodes` and `workflowEdges` tables
  2. Write migration script: convert existing `workflowSteps` → nodes + sequential edges
  3. Run migration on staging environment
  4. Deprecate old `workflowSteps` table (keep for rollback, delete after 6 months)
  5. Update all workflows services to use graph model
  6. Deploy with feature flag: `USE_GRAPH_EXECUTION=true` (enable after testing)

**Estimated Effort:** **6-9 months** (2 backend engineers — this is the **critical path** item)

**Dependencies:**
- **Must be completed BEFORE visual flow builder** (Feature #1) is useful
- **Must be completed BEFORE dynamic task decomposition** (Feature #2) can use loops
- **Must be completed BEFORE in-flight amendments** (Feature #4) can modify topology

**Risk:**
- **VERY HIGH:** This is the most complex backend change; high chance of bugs in execution logic
- **HIGH:** Migration from linear to graph model is risky; requires extensive testing
- **MEDIUM:** Parallel execution introduces concurrency issues; need careful transaction management

**Recommendation:** **THIS IS THE HIGHEST PRIORITY** — start Phase 2 with this feature

---

### 7. Real-Time Collaboration

**Current State:**
- **No real-time features** — all interactions are request/response (REST API)
- No WebSockets, no Server-Sent Events (SSE)
- No presence awareness (who's viewing this workflow?)
- No live updates (user must refresh to see changes)
- No comment threads or shared editing

**Target State:**
- Multiple users viewing workflow simultaneously see live updates
- Presence indicators: "Alice and Bob are viewing this workflow"
- Comment threads on specific nodes (Slack-style threaded conversations)
- Live cursor positions (Google Docs style)
- Notification toasts when someone approves a step
- Optimistic UI updates (instant feedback, then server confirmation)

**Gap Analysis:**

| Aspect | Current | Target | Gap |
|--------|---------|--------|-----|
| **Real-Time Transport** | None (REST only) | WebSockets or SSE | Complete greenfield |
| **Presence System** | None | User presence tracking per resource | High (new infrastructure) |
| **Live Updates** | None | Broadcast changes to all viewers | High (pub/sub system) |
| **Comment Threads** | Remarks exist (v5.2) but not threaded | Nested comments per node | Moderate (extend remarks) |
| **Optimistic UI** | None | Client-side state management + rollback | Moderate (frontend complexity) |
| **Notifications** | None | Toast on remote actions | Low (listen to broadcast events) |

**Complexity:** **VERY HIGH**

**Build Approach:**
- **Defer to Phase 3** — this is a "nice-to-have" multiplier, not a core requirement
- Technology choice: **WebSockets** (via **Socket.IO** for NestJS)
  - Alternatives: SSE (simpler but one-way), GraphQL subscriptions (overhead)
- Infrastructure additions:
  - WebSocket gateway in NestJS: `WorkflowGateway`
  - Redis pub/sub for multi-instance support (if scaling horizontally)
  - Presence tracking: `presenceMap = { workflowId: [userId1, userId2, ...] }`
- Data model additions:
  - `workflowComments` table:
    ```typescript
    {
      id: uuid,
      workflowDefinitionId: uuid,
      nodeId: uuid | null,  // null = comment on workflow, non-null = comment on node
      parentCommentId: uuid | null,  // for threaded replies
      authorId: uuid,
      content: text,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    ```
- WebSocket events:
  - `workflow:join` - user joins workflow view, broadcast presence
  - `workflow:leave` - user leaves, remove from presence
  - `workflow:update` - node/edge changed, broadcast to all viewers
  - `workflow:comment` - new comment, broadcast to all viewers
  - `workflow:step_completed` - step approved/rejected, broadcast + toast
- Frontend:
  - Socket.IO client in Next.js
  - Connect on workflow page load: `socket.emit('workflow:join', workflowId)`
  - Listen for events: `socket.on('workflow:update', handleUpdate)`
  - Optimistic UI: update local state immediately, rollback on error

**Estimated Effort:** **4-6 months** (1 backend engineer + 1 frontend engineer)

**Dependencies:**
- **None** — can be added independently as enhancement layer
- Works best AFTER graph-based execution (more events to broadcast)

**Risk:**
- **MEDIUM:** WebSockets add infrastructure complexity (connection management, scaling)
- **LOW:** Can be deployed as opt-in feature flag initially

**Recommendation:** **DEFER to Phase 3** — focus on core orchestration first, add collaboration later

---

## Critical Technical Gaps (Infrastructure & Architecture)

### 1. Database Schema Changes

**Required Migrations:**

| Table | Change Type | Complexity | Description |
|-------|-------------|------------|-------------|
| **workflowNodes** | NEW | High | Replace workflowSteps with graph nodes (type, config, position) |
| **workflowEdges** | NEW | High | Define graph topology (source, target, conditions) |
| **workflowStepExecutions** | RENAME | Moderate | Rename to workflowNodeExecutions, add iteration/retry fields |
| **workflowExecutions** | EXTEND | Moderate | Add currentNodeId, executionState JSON |
| **dependencies** | NEW | Moderate | Multi-type dependency tracking (task→task, task→workflow) |
| **workflowAmendments** | NEW | Very High | Amendment requests with before/after snapshots |
| **workflowComments** | NEW | Low | Threaded comments on workflows/nodes |
| **todos** | EXTEND | Low | Add status='cancelled_by_amendment' enum value |

**Migration Risk:** **HIGH** — workflowSteps → workflowNodes/workflowEdges is a major breaking change requiring careful data migration

---

### 2. New Backend Services

| Service | Purpose | Complexity | Dependencies |
|---------|---------|------------|--------------|
| **GraphExecutionService** | DAG-based workflow execution engine | Very High | workflowNodes, workflowEdges, ConditionEvaluator |
| **ConditionEvaluatorService** | JSON rules engine for branching logic | Moderate | json-rules-engine library |
| **TaskGenerationService** | Dynamic task creation from templates | High | todos, workflowExecutions |
| **EvidenceValidationService** | Validate evidence against requirements | High | attachments, ocrResults |
| **AmendmentSimulationService** | Preview impact of workflow amendments | Very High | Draft graph infrastructure (v11) |
| **AmendmentApplicationService** | Apply amendments atomically | Very High | Transactions, TaskGenerationService |
| **DependencyGraphService** | Build multi-type dependency graph | Moderate | dependencies, todos, workflows |
| **BlockingAnalysisService** | Compute "why blocked?" explanations | Moderate | DependencyGraphService |
| **CriticalPathService** | Find longest dependency chain | Moderate | Graph traversal algorithms |

**Total Estimated Effort:** **12-18 months** (2-3 backend engineers working in parallel)

---

### 3. Frontend Libraries & Components

| Library/Component | Purpose | Complexity | Alternative Options |
|-------------------|---------|------------|---------------------|
| **React Flow** | Visual flow builder canvas | High | Mermaid (read-only), Drawflow (less mature) |
| **json-rules-engine** | Condition builder UI | Moderate | Custom rule builder |
| **react-gantt-chart** | Timeline dependency view | Moderate | dhtmlxGantt (paid), FullCalendar |
| **Socket.IO client** | Real-time collaboration | Moderate | Native WebSocket (no auto-reconnect) |
| **Cytoscape.js** | Dependency graph visualization | High | D3.js (more control, steeper learning curve) |
| **Handlebars** | Template variable substitution | Low | Custom regex-based (more fragile) |

**Total Estimated Effort:** **8-12 months** (2 frontend engineers working in parallel)

---

## Architectural Considerations (Alignment with Core Principles)

### 1. **Explicit User Intent vs. Automation**

**Tension:**
- Core principle: "Explicit user intent required for all state mutation"
- Target feature: Dynamic task decomposition (system auto-generates tasks)

**Resolution:**
- ✅ Automation is ACCEPTABLE if:
  1. User explicitly triggers workflow execution (start button)
  2. Workflow definition was explicitly approved by admin (v6 activation)
  3. Task generation is deterministic and auditable (inputs → outputs traceable)
  4. User can preview generated tasks before workflow starts (dry-run)
- ❌ NOT acceptable: Background task generation without user awareness

**Recommendation:** Add "Preview Execution Plan" step before workflow start showing all tasks that will be created

---

### 2. **Auditability vs. Real-Time Collaboration**

**Tension:**
- Core principle: "Auditability-first (before/after snapshots)"
- Target feature: Real-time collaborative editing (Google Docs style)

**Resolution:**
- ✅ Real-time updates are ACCEPTABLE for:
  - Viewing changes (read-only sync)
  - Presence indicators (who's here)
  - Comment threads (non-authoritative data)
- ⚠️ Real-time editing of workflow definitions requires:
  - Operational transformation (OT) or CRDT for conflict resolution
  - Audit log of every keystroke (impractical) OR snapshot on save (acceptable)
  - Locking mechanism to prevent concurrent edits (simpler, recommended)

**Recommendation:**
- Phase 1: Read-only real-time sync (safe, simple)
- Phase 2: Optimistic locking (first to save wins, others see conflict warning)
- Defer: True collaborative editing (too complex, low ROI)

---

### 3. **Immutability vs. In-Flight Amendments**

**Tension:**
- Core principle: "Derived data is never authoritative" + "Undo restores validity, not history"
- Target feature: Amend running workflow (modify execution in-flight)

**Resolution:**
- ✅ Amendments preserve immutability if:
  1. Original execution record is never modified (append-only)
  2. Amendment is a new record with before/after snapshots
  3. Tasks cancelled by amendment get new status (not deleted)
  4. Amendment history is append-only log
- ✅ Aligns with "undo restores validity" principle:
  - Amendment doesn't erase history, it adds a corrective action
  - "Undo amendment" would create a new amendment (forward-moving)

**Recommendation:** Amendments are architecturally sound, but implementation complexity is very high — defer to Phase 3

---

### 4. **No Background Automation vs. Workflow Execution**

**Tension:**
- Core principle: "No background automation, no implicit execution"
- Target feature: Automatic step transitions after approval

**Resolution:**
- ✅ Step transitions are ACCEPTABLE if:
  - User explicitly approves a step (explicit action)
  - Transition to next step is deterministic (defined in workflow graph)
  - Transition is audited (logged in executionState)
- ❌ NOT acceptable:
  - Auto-approvals based on time ("if no response in 24h, auto-approve")
  - Background task execution without user awareness

**Recommendation:** Workflow transitions are user-triggered; escalations (if added) must notify user and require explicit action

---

## Recommended Implementation Sequence

### **Phase 1: Graph Execution Foundation** (6-9 months | 2 engineers)

**Goal:** Enable conditional branching and visual flow definition (no UI yet, API-first)

**Deliverables:**
1. ✅ Migrate workflowSteps → workflowNodes + workflowEdges (data model)
2. ✅ Implement GraphExecutionService (DAG execution engine)
3. ✅ Implement ConditionEvaluatorService (JSON rules engine)
4. ✅ Extend v7 user participation to work with graph nodes
5. ✅ Add graph validation (DAG check, no orphan nodes)
6. ✅ Backend API: CRUD for nodes/edges (no UI yet)

**User Value After Phase 1:**
- Admins can define workflows with conditional branching via API/JSON
- Users can execute branching workflows (same inbox UI as v7)
- **No visual builder yet** — workflows are JSON definitions (power users only)

**Why This First:**
- Foundation for ALL advanced features (visual builder, dynamic tasks, amendments)
- Highest technical risk — validate early
- Can be deployed behind feature flag (safe rollout)

**Risk Mitigation:**
- Run both linear and graph execution engines in parallel for 1-2 months (gradual migration)
- Extensive testing: unit tests, integration tests, load tests
- Rollback plan: keep workflowSteps table for 6 months

---

### **Phase 2: Visual Flow Builder + Dynamic Tasks** (6-9 months | 3 engineers)

**Goal:** Deliver visual orchestration MVP competitive with Monday.com

**Deliverables:**
1. ✅ React Flow-based workflow builder (canvas editor)
2. ✅ Node property panels (step config, evidence requirements, assignments)
3. ✅ Visual condition builder (drag-drop rules)
4. ✅ Live validation + dry-run preview (visual simulation)
5. ✅ TaskGenerationService (dynamic task decomposition)
6. ✅ Template variable substitution (${var} syntax)
7. ✅ Preview execution plan (show tasks before workflow starts)

**User Value After Phase 2:**
- Admins design workflows visually (no JSON editing)
- Workflows can loop, branch, and create dynamic tasks
- Operations teams can execute complex multi-step processes
- **Competitive feature parity** with Monday.com, Airtable Automations

**Why This Second:**
- Delivers core market value (visual flow orchestration)
- Unlocks non-technical users (admins don't need to write JSON)
- Validates product-market fit early

**Risk Mitigation:**
- Start with read-only visual viewer, then add editing (incremental)
- Ship with limited node types (task, decision only), add loops/parallel later
- Extensive UX testing with target users (operations teams)

---

### **Phase 3: Evidence Gates + Dependency Visualization** (4-6 months | 2 engineers)

**Goal:** Add compliance and visibility features (differentiators vs. competitors)

**Deliverables:**
1. ✅ EvidenceValidationService (OCR-based gates)
2. ✅ v8 Evidence Review UI (side-by-side document inspector)
3. ✅ Evidence requirements in node config
4. ✅ Manual override with approval (admin bypass)
5. ✅ DependencyGraphService (multi-type dependencies)
6. ✅ Dependency visualization (React Flow graph view)
7. ✅ "Why blocked?" explanations
8. ✅ Timeline view (Gantt chart with dependencies)

**User Value After Phase 3:**
- Compliance-heavy industries can enforce evidence-based approvals
- Users can visualize complex dependency chains
- Bottleneck detection reduces process delays
- **Differentiator** vs. generic workflow tools (evidence + OCR integration)

**Why This Third:**
- Builds on Phase 2 infrastructure (graph execution + visual builder)
- Targets high-value verticals (legal, finance, healthcare)
- Lower technical risk than real-time collaboration or amendments

---

### **Phase 4: Real-Time Collaboration (Optional)** (4-6 months | 2 engineers)

**Goal:** Add collaborative features (multiplayer mode)

**Deliverables:**
1. ✅ WebSocket infrastructure (Socket.IO)
2. ✅ Presence tracking (who's viewing)
3. ✅ Live updates (broadcast changes)
4. ✅ Comment threads (threaded discussions)
5. ✅ Notification toasts (remote actions)

**User Value After Phase 4:**
- Teams can collaborate on workflow design and execution
- Faster communication (comments instead of emails)
- **Nice-to-have** — not critical for core value

**Why This Fourth:**
- Can be deferred if budget/timeline is tight
- Adds complexity (WebSockets, scaling) without proportional value
- Competitors (Pipefy, Kissflow) don't have strong collaboration features

---

### **Phase 5: In-Flight Amendments (Future)** (6-9 months | 2 engineers)

**Goal:** Enable change order management (advanced feature)

**Deliverables:**
1. ✅ v11 Draft & Simulation infrastructure
2. ✅ AmendmentSimulationService (impact preview)
3. ✅ Amendment approval workflow (nested approvals)
4. ✅ Atomic amendment application
5. ✅ Before/after snapshots + audit trail

**User Value After Phase 5:**
- Users can request changes to running workflows
- Managers can approve amendments with impact preview
- **Killer feature** for professional services, construction, procurement

**Why This Last:**
- Extremely complex (highest risk)
- Requires v11 infrastructure (not yet built)
- Can validate market demand in Phases 1-3 before investing

---

## What NOT to Build (Yet)

### Deferred to Post-MVP (Phase 6+)

1. **Advanced Loop Controls**
   - Break/continue semantics
   - Nested loops
   - Loop timeout handling
   - **Why defer:** Adds complexity; simple for-each loops sufficient for MVP

2. **Workflow Templates Marketplace**
   - Public library of workflow templates
   - Template sharing between organizations
   - Template ratings and reviews
   - **Why defer:** Requires user base first; focus on core product

3. **Advanced Scheduling**
   - Cron-based workflow triggers
   - Recurring workflows (daily, weekly, monthly)
   - Scheduled task generation
   - **Why defer:** v1-v2 calendar sufficient for manual scheduling

4. **External Integrations**
   - v14 is planned (Telegram, email, API)
   - Zapier/Make.com connectors
   - Webhook triggers
   - **Why defer:** Explicitly out of scope (no ERP integration requirement)

5. **Mobile App**
   - Native iOS/Android apps
   - Mobile-optimized workflow viewer
   - Push notifications
   - **Why defer:** Web-first strategy; responsive web app sufficient

6. **Advanced Analytics**
   - Workflow performance metrics (avg completion time, bottleneck heat maps)
   - Predictive analytics (estimated completion date)
   - Custom dashboards
   - **Why defer:** Requires significant execution data; add after 6 months of usage

7. **Workflow Versioning UI**
   - Visual diff between workflow versions
   - Rollback to previous version
   - A/B testing different workflow versions
   - **Why defer:** v6 versioning backend exists; UI is low priority vs. visual builder

8. **Multi-Tenancy**
   - Organization/workspace isolation
   - Cross-organization workflow sharing
   - Per-org billing
   - **Why defer:** Current app is single-tenant; add when scaling to SaaS

9. **Advanced Permissions**
   - Fine-grained node-level permissions
   - Role-based access control (RBAC) for workflows
   - Approval delegation
   - **Why defer:** Current user-based assignment sufficient for MVP

10. **AI-Powered Features**
    - v13 is planned (assistive planning & intelligence)
    - Auto-suggest workflow improvements
    - Anomaly detection (unusual approval patterns)
    - Natural language workflow creation
    - **Why defer:** Requires v13 infrastructure + training data

---

## Biggest Risks & Unknowns

### 1. Graph Execution Engine Complexity
- **Risk Level:** VERY HIGH
- **Impact:** If DAG execution has bugs, entire product is unusable
- **Mitigation:**
  - Start with simple graphs (no loops, no parallel execution)
  - Extensive unit tests (100+ test cases for edge conditions)
  - Run in parallel with linear execution for 1-2 months (feature flag)
  - Hire engineer with workflow engine experience (Temporal, Cadence, Camunda)

### 2. Visual Flow Builder UX
- **Risk Level:** HIGH
- **Impact:** If UX is confusing, admins won't adopt (deal-breaker)
- **Mitigation:**
  - User research with 10+ operations teams before building
  - Build interactive prototype (Figma) before coding
  - Weekly UX testing sessions during development
  - Study competitors: Pipefy, Kissflow, n8n (open-source workflow tool)

### 3. Data Migration (Linear → Graph)
- **Risk Level:** HIGH
- **Impact:** Failed migration could corrupt existing workflows
- **Mitigation:**
  - Write migration script with dry-run mode (preview changes)
  - Test on staging environment with production data clone
  - Implement rollback script (graph → linear, just in case)
  - Keep both tables in parallel for 6 months (safety net)

### 4. Evidence Validation False Positives
- **Risk Level:** MEDIUM
- **Impact:** Users frustrated by gates blocking valid evidence
- **Mitigation:**
  - Start with low confidence thresholds (60%, not 80%)
  - Always allow manual override (with approval)
  - Collect feedback: track override frequency per workflow
  - Improve OCR models based on real-world accuracy data

### 5. Amendment Atomic Application Failures
- **Risk Level:** VERY HIGH (if implemented)
- **Impact:** Partial amendment application corrupts execution state
- **Mitigation:**
  - Use database transactions (all-or-nothing guarantee)
  - Implement compensating transactions (rollback on failure)
  - Extensive integration tests (simulate failures at each step)
  - **Recommend:** Defer to Phase 5, validate demand first

### 6. WebSocket Scaling (Real-Time Collaboration)
- **Risk Level:** MEDIUM (if implemented)
- **Impact:** Performance degrades with >100 concurrent users per workflow
- **Mitigation:**
  - Use Redis pub/sub for multi-instance scaling
  - Implement connection limits (max 50 users per workflow)
  - Load testing with 1000+ concurrent connections
  - **Recommend:** Defer to Phase 4, focus on core features first

### 7. Market Fit Uncertainty
- **Risk Level:** MEDIUM
- **Impact:** Build features users don't actually need
- **Mitigation:**
  - User interviews BEFORE each phase (validate demand)
  - Ship MVPs with feature flags (A/B test adoption)
  - Track usage metrics: which features are actually used?
  - **Pivot strategy:** If visual builder isn't adopted, fall back to API-first (power users)

### 8. Timeline Underestimation
- **Risk Level:** HIGH
- **Impact:** 12-18 month estimate could balloon to 24+ months
- **Mitigation:**
  - Add 30% buffer to all estimates (18 months → 24 months realistic)
  - Prioritize ruthlessly: cut features if timeline slips
  - Hire experienced engineers (workflow/graph expertise)
  - Consider outsourcing visual builder to frontend agency (accelerate Phase 2)

---

## Bottom Line Estimate

### **Time to Basic Visual Flow Orchestration**

| Scenario | Timeline | Team Size | Scope |
|----------|----------|-----------|-------|
| **Aggressive** | 12-15 months | 3 engineers (2 backend, 1 frontend) | Phase 1 + Phase 2 only (no evidence gates, no collaboration) |
| **Realistic** | 18-24 months | 4 engineers (2 backend, 2 frontend) | Phase 1 + Phase 2 + Phase 3 (evidence + dependencies) |
| **Conservative** | 24-30 months | 3 engineers (slower pace) | All phases including collaboration + amendments |

### **Confidence Level:** MEDIUM

**Reasoning:**
- ✅ Strong foundation (v1-v7 complete, architecture is sound)
- ⚠️ Graph execution engine is **critical path** and **high risk**
- ⚠️ Visual flow builder UX is **make-or-break** for adoption
- ⚠️ No prior experience with workflow engines in team (assumption)
- ✅ Incremental delivery possible (Phase 1 can ship without visual UI)

### **Key Dependencies (Critical Path)**

```
Phase 1: Graph Execution Engine (6-9 months)
   ↓
Phase 2a: Visual Flow Builder (4-6 months)
   ↓
Phase 2b: Dynamic Task Decomposition (2-3 months, parallel with 2a)
   ↓
Phase 3a: Evidence Gates (3-4 months)
   ↓
Phase 3b: Dependency Visualization (3-4 months, parallel with 3a)
```

**Total Critical Path:** 18-24 months (with parallelization)

### **Recommended Approach**

1. **Validate Demand First** (Month 0-1)
   - User interviews with 20+ operations teams
   - Show mockups of visual flow builder
   - Ask: "Would you pay for this? How much?"
   - If demand is weak, reconsider investment

2. **Hire/Train Team** (Month 0-2)
   - Hire 1 engineer with workflow engine experience (Temporal, Cadence, Apache Airflow)
   - Train team on graph algorithms, DAG execution patterns
   - Study open-source workflow engines: n8n, Node-RED, Prefect

3. **Phase 1: Build Foundation** (Month 1-9)
   - Graph execution engine (highest risk, highest priority)
   - Ship behind feature flag (safe rollout)
   - Validate with power users (JSON workflow definitions)

4. **Phase 2: Ship Visual Builder** (Month 10-18)
   - React Flow integration
   - Dynamic task decomposition
   - **Target:** Competitive MVP launch

5. **Phase 3: Add Differentiators** (Month 19-24)
   - Evidence gates (OCR integration)
   - Dependency visualization
   - **Target:** Premium tier features for compliance-heavy industries

6. **Evaluate & Pivot** (Month 24)
   - Measure adoption: are users creating workflows?
   - Measure retention: are workflows being executed?
   - If yes → continue to Phase 4 (collaboration)
   - If no → investigate: UX issues? Wrong target market? Missing features?

---

## Conclusion

**Feasibility:** ✅ **FEASIBLE** — The v1-v7 foundation is solid, and a clear incremental path exists.

**Complexity:** ⚠️ **VERY HIGH** — This is an 18-24 month engineering investment with significant technical risk.

**Market Timing:** ⏰ **URGENT** — Competitors (Pipefy, Kissflow, Monday.com) already have visual flow builders. Delaying Phase 2 beyond 24 months risks missing market window.

**Recommendation:**
- **Proceed with Phase 1** (graph execution engine) — this is the foundation for everything
- **Validate UX early** — visual flow builder makes or breaks adoption
- **Cut scope aggressively** — defer amendments (Phase 5) and collaboration (Phase 4) if timeline slips
- **Target:** Ship competitive MVP in 18 months (Phase 1 + 2), differentiate with evidence gates in 24 months (Phase 3)

**Confidence:** 70% that basic visual orchestration is achievable in 18 months with 3-4 dedicated engineers, assuming:
- No major technical blockers in graph execution engine
- Visual flow builder UX is validated early with users
- Team has or acquires workflow engine expertise

**Go/No-Go Decision Point:** Month 9 (end of Phase 1)
- If graph execution engine is stable → proceed to Phase 2
- If major issues remain → reassess timeline or pivot to simpler API-first approach
