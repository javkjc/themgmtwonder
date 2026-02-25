# Old prompt // .vscode/snippets.code-snippets
{
  "Task Execution Prompt": {
    "prefix": "taskprompt",
    "body": [
      "# ${1:Task Name} - ${2:Task ID}",
      "",
      "**Governance:** Follow `prompt_guidelines.md` and `ai-rules.md`",
      "",
      "**Context (read per Session Start Protocol):**",
      "- ${3:task file} - Task: ${4:task id}",
      "- tasks/session-state.md - ${5:current state}",
      "- tasks/executionnotes.md - ${6:what to check}",
      "- codemapcc.md - ${7:what to locate}",
      "- tasks/lessons.md - Avoid known patterns",
      "",
      "**Execute:** ${8:task description}",
      "- ${9:subtask 1}",
      "- ${10:subtask 2}",
      "- ${11:verification}",
      "",
      "**Stop when:** ${12:completion criteria}",
      "",
      "**Document:** Per Session End Protocol",
      "- Append executionnotes.md (bottom, structured format)",
      "- Update session-state.md (rewrite)",
      "- Update plan.md status (if applicable)"
    ]
  }
}

# for simple task *******************

[Task Name] - [Task ID]

**Governance:** Follow `prompt_guidelines.md` and `ai-rules.md`

**Context:** Read per Session Start Protocol
- [task file] - [specific task]
- tasks/session-state.md
- codemapcc.md - [what to locate]

**Execute:** [task from task file]
- [key steps]

**Stop when:** [done criteria]

**Document:** Per Session End Protocol


# for generating plan.md  ***************************************


Generate a tasks/plan.md for **[VERSION] — [Feature Name]**.

**Instructions:**
1. Read `tasks/features.md` under [VERSION] section for feature requirements
2. Read `tasks/codemapcc.md` for architecture context and file paths
3. Read `tasks/prompt_guidelines.md` for governance principles
4. Read `tasks/lessons.md` for patterns to avoid from previous versions
5. Read `tasks/executionnotes.md` to verify what was actually built in prerequisite versions
6. Follow the template structure below

**REQUIREMENTS:**
The plan MUST:
1. Be execution-focused: Concrete steps, not abstract goals
2. Include file paths: Reference `tasks/codemapcc.md` for existing files
3. Have verification checkpoints: Every task needs testable success criteria with specific examples
4. Respect governance: Align with principles from `tasks/prompt_guidelines.md`
5. Be granular: Tasks should take 1-3 hours max, not days
6. Show dependencies: Execution order must be explicit with blocking relationships
7. Include guardrails: What is out of scope must be clear
8. Define STOP conditions: When to halt and request clarification
9. Specify checkpoint detail: Manual tests must show exact inputs/outputs, DB queries must be copy-pasteable, logs must name exact fields

**TEMPLATE STRUCTURE:**

## [VERSION] — [Feature Name]

**Date:** [Today's date]  
**Scope:** [One sentence summary]  
**Principles:** Minimal localized changes. Backend authoritative. No new dependencies. No background automation. Preserve auditability-first.

---

## 0) Preconditions / Guardrails

**Prerequisites:**
- ✅ [Required infrastructure/prerequisites with evidence check]
  - Evidence: Check `tasks/executionnotes.md` for [specific completion marker]
- ✅ [Required prior versions complete]
  - Evidence: Check `tasks/codemapcc.md` for [required file paths]
- ✅ Review `tasks/lessons.md` for [VERSION family] patterns before starting

**Out of Scope:**
- ❌ [What is explicitly out of scope with reason]
- ❌ [Anti-patterns to avoid with reference to lessons.md if applicable]

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Missing Infrastructure:** If [required file/table/service] not found in codemapcc.md → Update codemap before proceeding
- **STOP - New Dependency Request:** If implementation requires packages beyond current requirements.txt → Get explicit approval
- **STOP - Ambiguous Requirement:** If [specific scenario] has multiple valid interpretations → Request specification clarification
- **STOP - Scope Creep:** If task requires features from [future version] → Flag dependency conflict

---

## 1) [Task Group A] — [Category Name] (P[0-2])

> **Context:** [Why this task group exists and what it enables]

### A1 — [Task Name] ([Complexity: Simple/Medium/Complex])

**Problem statement**  
[What needs to be built/fixed and why, in 2-3 sentences]

**Files / Locations**
- Frontend:
  - `apps/web/path/to/file.tsx` — [specific function/component to create/modify]
  - `apps/web/path/to/types.ts` — [types to define/update]
- Backend:
  - `apps/api/src/module/service.ts` — [specific method to implement]
  - `apps/api/src/module/dto.ts` — [validation rules to add]
  - `apps/api/src/db/schema.ts` — [table changes if any]
- Docs:
  - `tasks/codemapcc.md` — [section to update after implementation]

**Implementation plan**
1. [Step 1 with concrete action and expected outcome]
2. [Step 2 with concrete action and expected outcome]
3. [Step 3 with concrete action and expected outcome]
4. Update `tasks/codemapcc.md` to reflect new/changed file paths

**Checkpoint A1 — Verification**
- Manual: 
  - [Specific user action] → [Expected UI outcome]
  - [Edge case test] → [Expected behavior]
  - Example: "Click 'Save Field' without entering name → See error 'Field name required'"
- DB: 
```sql
  [Copy-pasteable SQL query]
```
  Expected result: [Specific row state or count]
- Logs: 
  - [Specific log entry to check]
  - Example: "API log shows action='field.created' with details={fieldKey: '...', createdBy: '...'}"
- Regression:
  - [Existing feature that must still work]
  - Example: "Existing tasks still load without errors"

**Estimated effort:** [1-3 hours]  
**Complexity flag:** [Simple = GPT-4o-mini OK | Medium = GPT-4o preferred | Complex = GPT-4o required]

[Repeat A2, A3, etc.]

---

## 2) [Task Group B] — [Category Name] (P[0-2])

[Same structure as Task Group A]

---

## [N]) Execution Order (Do Not Skip)

**Critical path dependencies:**

1. **A1** [Brief description] — No dependencies
2. **A2** [Brief description] — Depends on A1 (requires [specific output])
3. **B1** [Brief description] — Depends on A2 (needs [specific file/endpoint])
4. **B2** [Brief description] — Depends on B1
5. **C1** [Brief description] — Depends on A2, B2 (parallel OK after both complete)

**Parallel execution opportunities:**
- A3, A4 can run in parallel after A2 completes
- B1, C1 can run in parallel after A2 completes

**Blocking relationships:**
- Frontend tasks (C-series) BLOCKED until backend APIs (B-series) complete
- ML integration (E-series) BLOCKED until data model (A-series) complete

---

## [N+1]) Definition of Done

**Feature Completeness:**
- [Feature area 1]:
  - ✅ [Specific testable outcome with acceptance criteria]
  - ✅ [Specific testable outcome with acceptance criteria]
- [Feature area 2]:
  - ✅ [Specific testable outcome with acceptance criteria]

**Data Integrity:**
- ✅ [Required constraints enforced]
  - Example: "Unique constraint on (baselineId, fieldKey) prevents duplicates"
- ✅ [Audit trail complete]
  - Example: "All mutations logged in audit_events with userId and timestamp"

**No Regressions:**
- ✅ API boots without errors (`pnpm dev` in apps/api)
- ✅ Web builds without errors (`pnpm build` in apps/web)
- ✅ Core flows still work:
  - ✅ [Critical flow 1 with test steps]
  - ✅ [Critical flow 2 with test steps]

**Documentation:**
- ✅ `tasks/codemapcc.md` updated with new files/endpoints
- ✅ `tasks/executionnotes.md` updated with completion evidence

---

## [N+2]) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (Run After Every Task):**
- [ ] API boots: `cd apps/api && pnpm dev` → No errors in terminal
- [ ] Web builds: `cd apps/web && pnpm build` → Exit code 0
- [ ] Login flow works: Navigate to /login → Enter credentials → Redirects to /tasks

**Feature-Specific Tests:**

**Task Group A — [Category]:**
- [ ] [Specific test with exact steps]
  - Steps: [1. Action → 2. Expected result → 3. Verification]
  - Example: "1. Navigate to /admin/fields → 2. See empty state message → 3. Click 'Create Field' → Modal opens"
- [ ] [Edge case test]
  - Steps: [...]

**Task Group B — [Category]:**
- [ ] [Specific test with exact steps]
- [ ] [Edge case test]

**Integration Tests (Run After All Tasks Complete):**
- [ ] [End-to-end workflow test]
  - Example: "Upload PDF → Extract text → Assign fields → Confirm baseline → Verify read-only"
- [ ] [Cross-feature validation]
  - Example: "Create baseline → Use in record creation → Verify utilization lockout"

**Regression Tests:**
- [ ] [Critical existing feature 1 still works]
- [ ] [Critical existing feature 2 still works]

---

## [N+3]) Post-Completion Checklist

- [ ] Update `tasks/executionnotes.md` with:
  - [ ] Completion date
  - [ ] What was built (reference task IDs)
  - [ ] Any deviations from plan (with reasons)
  - [ ] Lessons learned (add to `tasks/lessons.md` if applicable)
- [ ] Update `tasks/codemapcc.md` with new file paths
- [ ] Run full regression suite
- [ ] Tag commit: `git tag v[VERSION] -m "[Feature Name] complete"`

---

**Output Instructions:**
1. Save the generated plan as `tasks/plan.md`
2. Ensure all file paths reference `tasks/codemapcc.md` locations
3. Verify all STOP conditions are specific and actionable
4. Confirm all checkpoints have concrete verification steps (no vague "test it works")
5. Double-check execution order reflects true blocking dependencies










# for reviewing of completed plan.md files ******************************


## Post-Implementation Quality Review

**Your Role**: Quality auditor comparing delivered work against original requirements. Find gaps, don't fix them.

**Context**: A plan.md file defined tasks with specific checkpoints and Definition of Done criteria. Work is now complete. Your job is to verify every requirement was met with evidence.

---

## Required Reading (in order)

1. **tasks/plan.md** - Original requirements, checkpoints, Definition of Done
2. **tasks/executionnotes.md** - What was actually built (evidence log)
3. **tasks/session-state.md** - Final project state
4. **tasks/codemapcc.md** - File structure (reference only)
5. **Changed files** - [User will specify 3-5 key files to examine]

---

## Review Criteria

For EACH task in plan.md, verify:

### ✅ Requirements Coverage
- All bullet points from "Implementation plan" addressed?
- Edge cases from "Problem statement" handled?
- Files listed in "Files / Locations" actually modified?

### ✅ Verification Evidence
- Checkpoint tests performed (quote executionnotes)?
- Database checks documented where required?
- Manual testing results recorded?
- Audit log samples provided where required?

### ✅ Documentation Quality
- executionnotes.md entry exists with structured format?
- All 5 questions answered (What/Where/How verified/Evidence/What's NOT done)?
- Status marked VERIFIED/UNVERIFIED/NEEDS-TESTING?
- plan.md checkbox updated?

### ✅ Cross-Task Dependencies
- Prerequisites completed before dependent tasks?
- Execution order from plan.md followed?
- Shared state/helpers referenced correctly?

### ✅ Governance Compliance
- No new dependencies added (unless explicitly allowed)?
- Audit trail preserved for mutations?
- No background automation introduced?
- Backend remains authoritative?

---

## Deliverable Format

### Executive Summary
**Overall Status**: [PASS ✅ | PASS WITH NOTES ⚠️ | NEEDS REWORK ❌]

**Completion Rate**: [X/Y tasks fully verified]

**Critical Issues**: [Count of blocking gaps, or "None"]

---

### Task-by-Task Audit

For each task, use this template:

#### Task [ID] — [Name from plan.md]

**Status**: [✅ Complete | ⚠️ Partial | ❌ Missing | 🔍 Unverified]

**Requirements Met**:
- [Requirement 1] ✅ Evidence: [quote executionnotes.md line or file diff]
- [Requirement 2] ✅ Evidence: [quote]

**Requirements Missed**:
- [Missing item] ❌ Severity: [CRITICAL | MEDIUM | LOW]

**Verification Evidence**:
- Manual tests: [Present ✅ / Missing ❌] - [quote checkpoint results]
- Database checks: [Present ✅ / Not Required ⚪ / Missing ❌]
- Audit logs: [Present ✅ / Not Required ⚪ / Missing ❌]

**Documentation Quality**: [COMPLETE ✅ | PARTIAL ⚠️ | MISSING ❌]

---

### Cross-Cutting Analysis

#### Regressions Detected
[List any tasks that may have broken earlier work, or "None detected"]

#### Documentation Gaps
- Missing executionnotes entries: [list or none]
- Incomplete verification sections: [list or none]
- session-state.md not updated: [yes/no]

#### Scope Deviations
- Scope creep (did more than asked): [list or acceptable]
- Shortcuts taken: [list with technical debt notes or none]
- Governance violations: [list or none]

#### Definition of Done Assessment
[Copy the "Definition of Done" section from plan.md and check each item]:
- [ ] Item 1 from DoD
- [ ] Item 2 from DoD
[Mark each with ✅ Met | ⚠️ Partial | ❌ Not met]

---

### Evidence Quality Assessment

Rate evidence strength for verification claims:

**Strong Evidence** (can reproduce/validate):
- DB query results with actual values
- Audit log samples (redacted)
- Console output / test results
- Before/after screenshots

**Weak Evidence** (claims without proof):
- "Tested manually" without specifics
- "Works as expected" without showing how
- "Verified" without method described

List tasks with weak evidence: [task IDs or "All tasks have strong evidence"]

---

### Recommended Actions

#### Critical (must fix before ship):
[List gaps marked CRITICAL with task IDs]

#### Medium (fix in next iteration):
[List gaps marked MEDIUM]

#### Low (technical debt / nice-to-have):
[List gaps marked LOW]

#### If PASS:
- All requirements met with strong evidence
- Documentation complete
- No critical gaps
- Ready to ship ✅

#### If PASS WITH NOTES:
- Core requirements met
- Minor documentation gaps or unverified edge cases
- Ship with noted limitations: [list]

#### If NEEDS REWORK:
- [X] critical requirements missed
- Create fixplan addressing: [specific gaps]
- Re-review after fixes

---

## Review Constraints

- **Do NOT suggest code changes** - only identify gaps
- **Do NOT assume** - if verification isn't documented, mark as unverified
- **Quote evidence** - cite executionnotes.md or file line numbers
- **Be severity-aware** - distinguish blocking issues from polish
- **Check actual files** - if executionnotes says "modified X" but file unchanged, flag it

---

## Stop Conditions

- If >50% tasks have no executionnotes entries → STOP, flag as "Implementation tracking failure"
- If plan.md has no Definition of Done section → STOP, ask user to clarify success criteria
- If executionnotes.md is empty → STOP, flag as "No evidence of work"

---

**Review Mode**: Strict quality gate, not advisory
**Output**: Structured report with evidence citations
**Audience**: Project owner needs clear go/no-go decision

# for generating task from plan.md 1 each time ********************************
Generate execution prompt for next task from tasks/plan.md.
Output must be anti-hallucination: explicit sources, no assumptions, verification-heavy.

READ IN ORDER:
1. tasks/plan.md → find first task without "✅ Completed"
   Extract VERBATIM: Task ID, Problem statement, Files/Locations, Implementation steps, Checkpoint section
2. tasks/session-state.md → last completed task, current blockers
3. tasks/lessons.md → find 2-3 patterns matching this task's files/scope
4. tasks/ai-rules.md → "Execution Prompt Generation Guidelines" section
5. tasks/codemapcc.md → verify every file path from step 1 exists here

PREREQUISITES CHECK: Read plan.md §0 Preconditions.
If any prerequisite not marked [OK] → output ONLY: "STOP: Prerequisite missing — [quote line]"

OUTPUT STRUCTURE:

## Context
- Project: [from tasks/session-state.md]
- [Only if task depends on previous]: "[Prior ID] is complete: [specific artifact]"

## Authority
tasks/plan.md is the single source of truth. Follow it exactly.

## Scope
CONSTRAINT: [copy scope from plan.md task section]
Work ONLY on files in ## Files for implementation. Do NOT touch other files.
**Exception:** The post-completion writes in ## After Completion are mandatory governance writes and are NOT subject to this constraint — execute them after all verification passes.

## Task
**[Task ID] — [Task Name]**
**Problem:** [copy verbatim from plan.md]
**Steps** (copy EXACTLY — do not paraphrase):
1. [step 1]
2. [step 2]

## Files
Modify ONLY (each path verified in tasks/codemapcc.md):
- [path 1]
If any path from plan.md Files/Locations is absent from codemapcc.md → output ONLY:
"STOP: Path missing from codemapcc.md — [path]"

## Rules
1. Minimal changes: edit only files above
2. No new dependencies: packages in package.json/requirements.txt only
3. No assumptions: if plan.md unclear → STOP, quote it, ask
4. [Only if lessons.md has relevant patterns]:
   - DON'T: [pattern]

## Verification
**Credentials:** test@test.com / 12341234

**Manual tests** (copy verbatim from plan.md Checkpoint [Task ID]):
- [test]

**DB check** (only if in Checkpoint — copy SQL verbatim):
```sql
[query]
Expected: [from plan.md]

Regression (copy verbatim):

[test]
After Completion — Required Writes
tasks/executionnotes.md (APPEND at bottom only — never modify existing):


---
## [DATE] - [Task ID]
### Objective
[one sentence]
### What Was Built
- [deliverable]
### Files Changed
- `path` - [description]
### Verification
[results]
### Status
[VERIFIED] or [UNVERIFIED] or [NEEDS-TESTING]
### Notes
- Impact: [feature reference]
tasks/plan.md:

Add **Status:** ✅ Completed on [DATE] under the ### [Task ID] heading
Do not change any other line
tasks/codemapcc.md (update if ANY of the following changed):

New file created → add path + one-line purpose in appropriate section
New API endpoint added → add to endpoint list with method, path, purpose
New DB table or column added → add to Data Model section
New service, controller, component, or module added → add to appropriate section
Existing entry now inaccurate → correct it Do NOT rewrite sections not touched by this task.
tasks/session-state.md (at session end — rewrite entirely):

Current task done, next task ID, blockers, open questions
Stop Conditions
STOP immediately if:

plan.md step is ambiguous → quote it, ask a specific question
file in ## Files not found on disk
required backend endpoint missing → name it and which step needs it
all verification passes → report: "Task [Task ID] complete, verified"
ANTI-HALLUCINATION RULES:

Copy don't paraphrase: implementation steps, verification tests, file paths
Verify existence: check codemapcc.md before listing any file path
No assumptions: if plan.md doesn't specify → STOP and ask
No code until prerequisites verified
Do not compress or summarize the verification section