# Prompt Generation Requirements — Authoritative

You are assisting with an existing codebase governed by `tasks/plan.md`.

This file defines **how you must think, read, execute, write, and stop**.
Violating any rule below is considered a failure, even if the code "works".

---

## File Authority (Strict)

- `tasks/plan.md` — **single source of truth for execution**
- `tasks/features.md` — product intent only (NEVER execution order)
- `tasks/executionnotes.md` — append-only factual evidence
- `tasks/codemapcc.md` — navigation index (avoid repo scanning)
- `tasks/lessons.md` — patterns to avoid (updated after corrections)
- `tasks/session-state.md` — resume context (rewritten each session end)

If two files conflict:
- `tasks/plan.md` always wins for "what to build now"
- `tasks/executionnotes.md` always wins for "what was actually built"
- Higher sections within a file override lower ones

---

## Source of Truth Priority (When Files Conflict)

If contradictions exist between files:

**For "what to build":**
1. `tasks/plan.md` (current execution contract)
2. `tasks/features.md` (product intent and context)
3. User instruction (overrides all)

**For "what was built":**
1. `tasks/executionnotes.md` (evidence of actual implementation)
2. `tasks/codemapcc.md` (current codebase structure)
3. Actual codebase (ground truth if files are stale)

**For "how to build":**
1. `tasks/prompt_guidelines.md` (this file - governance)
2. `tasks/ai-rules.md` (behavioral standards, if exists)
3. User instruction (if it doesn't violate governance)

When in doubt: **STOP and ask which source to trust**.

---

## Role Definition (Non-Optional)

You are acting in **Executor Mode**, not Advisor Mode.

- You execute exactly what is specified
- You do NOT optimize scope
- You do NOT anticipate future phases
- You do NOT "improve" designs unless instructed

If reasoning is required:
- Surface it explicitly
- Do NOT silently decide

---

## Session Lifecycle (Required)

### Session Start Protocol

Before executing any task, you MUST:

1. **Read context files** in this order:
   - `tasks/session-state.md` (where we left off)
   - `tasks/lessons.md` (patterns to avoid)
   - `tasks/plan.md` sections 1-5 (execution contract)
   - `tasks/codemapcc.md` (as needed for navigation)

2. **Identify the task**:
   - Find the NEXT TASK pointer in `tasks/plan.md`
   - If multiple tasks are unchecked, follow Implementation Order section
   - If ambiguous, ask which task to execute

3. **Verify prerequisites**:
   - Required infrastructure is running
   - Prerequisite tasks are complete
   - No blocking conditions exist

4. **Confirm readiness**:
   - All context is clear
   - No ambiguity in requirements
   - Files referenced exist in `tasks/codemapcc.md`

If ANY step fails → **STOP and ask**

### Session End Protocol

Before closing session, you MUST:

1. ✅ **Append to `tasks/executionnotes.md`** (bottom only, structured format)
2. ✅ **Update `tasks/plan.md`** (status checkboxes only - do NOT reword)
3. ✅ **Rewrite `tasks/session-state.md`** (complete state for next resume)
4. ✅ **Update `tasks/lessons.md`** (if user made corrections during session)
5. ✅ **Update `tasks/codemapcc.md`** (if files/tables/routes/controllers added)

Failure to complete session end protocol leaves the project in an inconsistent state.

---

## Entry Point for New AI Sessions

If you are starting fresh with no prior context:

1. You MUST read this file (`tasks/prompt_guidelines.md`) first
2. Then read `tasks/ai-rules.md` (if it exists) for behavioral standards
3. Then follow "Session Start Protocol" above
4. Then execute the task specified by user

If user's prompt does not specify a task:
- Read `tasks/plan.md` and identify the NEXT TASK pointer
- Confirm with user before proceeding

---

## Non-Negotiable Rules

- Execute **only** the next incomplete task in `tasks/plan.md`
- One concern per task
- Minimal, localized, reversible changes only
- Stop immediately when Definition of Done is met
- No new dependencies unless explicitly allowed
- No background automation
- No implicit state mutation
- OCR is deterministic extraction only
- Manual verification is owned by the user

You must **prefer stopping over guessing**.

---

## Task Selection Rules (When Multiple Incomplete)

If multiple tasks are unchecked in `tasks/plan.md`:

1. Follow "Implementation Order" section explicitly
2. Never start a task marked "blocked by [X]" or "Blocked by: [condition]"
3. If order is ambiguous, ask which task to execute
4. Never skip to a later task without explicit instruction

**Execute ONE task per session unless explicitly told otherwise.**

---

## Pre-Execution Checklist (Must Pass Before Any Code)

Before touching code, you must confirm:

- [ ] The next incomplete task in `tasks/plan.md` is clearly identified
- [ ] Task is not blocked by prerequisites or conditions
- [ ] Required infrastructure is present and running
- [ ] Relevant files are listed in `tasks/codemapcc.md` or marked UNKNOWN
- [ ] No ambiguity exists in scope or intent
- [ ] Previous related work is documented in `tasks/executionnotes.md`

If ANY item fails → **STOP and ask**

---

## Reading Rules (Strict)

- Always read `tasks/plan.md` Sections 1–5
- Always read `tasks/session-state.md` at session start
- Always read `tasks/lessons.md` at session start (check for relevant patterns)
- Use `tasks/codemapcc.md` for file paths and module ownership
- Do NOT repo-scan unless a file is explicitly marked UNKNOWN
- Do NOT assume files exist unless listed in `tasks/codemapcc.md`
- Do NOT infer behavior from filenames alone
- Verify what was built by checking `tasks/executionnotes.md`, not assumptions

If required context is missing → **STOP**

---

## Forbidden Assumptions (Explicit)

You MUST NOT assume:

- A file exists because it "should" exist
- A table exists because it's mentioned in `tasks/features.md`
- A service is implemented because it's in a past milestone
- Code works because tests passed in a previous session
- A route is wired because the component exists
- Infrastructure is running because it was running before
- A feature is complete because status shows "In Progress"

You MUST verify against:

- `tasks/codemapcc.md` (for files/tables/routes/controllers/services)
- `tasks/executionnotes.md` (for what was actually built)
- Explicit user confirmation (when unclear)

**When in doubt about what exists: STOP and ask.**

---

## Writing Rules (Strict)

### tasks/executionnotes.md

- **Append-only** (never modify existing entries)
- **New entries go at the BOTTOM of the file**
- **Chronological order**: Oldest entries at top, newest at bottom (ascending by date)
  - Example correct order: 2026-01-25 (top) → 2026-01-27 → 2026-02-05 (bottom)
- **Factual only**:
  - What changed
  - Where (file paths)
  - Why (brief, objective)
- **No narrative summaries**
- **No forward-looking commentary**
- **Use structured format** (see format section below)

### tasks/plan.md

- Update **status only** (check/uncheck task boxes)
- Do NOT reword tasks
- Do NOT add scope
- Do NOT reshuffle sections
- Update NEXT TASK pointer if it becomes stale

### tasks/session-state.md

- **Rewrite completely** at session end (not append)
- Must contain:
  - Where we stopped
  - What's half-done
  - Next immediate step
  - Context for resume
  - Open questions

### tasks/lessons.md

- **Append new pattern entries** after user corrections
- Use structured format: Date, Problem, Root Cause, Rule, Related Feature
- Never modify existing patterns (append-only)

### tasks/features.md

- **MUST NOT be modified** unless explicitly instructed by user
- This is the product spec, not execution tracking

### tasks/codemapcc.md

- Update when new files/tables/routes/controllers/services are added
- Keep format consistent with existing entries
- Add entries immediately when structure changes

---

## tasks/executionnotes.md Entry Format (Required)

Use this structure for all appends:
```markdown
---

## [Date] - [Task/Milestone ID]

### Objective
[What was being built - one sentence]

### What Was Built
- [Key deliverable 1]
- [Key deliverable 2]

### Files Changed
- `path/to/file.ts` - [Brief description of changes]
- `path/to/other.ts` - [Brief description]

### Verification
[What was tested and results]
OR
"Not performed (requires manual [X])" if verification cannot be automated

### Status
[VERIFIED] or [UNVERIFIED] or [NEEDS-TESTING]

### Notes
- **Impact**: Affects Feature #[X] from features.md
- **Assumptions**: [Any assumptions made, if applicable]
- **Open Questions**: [If any decisions deferred]
```

---

## Verification Standards (Before Marking Done)

A task is NOT complete until verification is documented.

**Code Verification:**
- [ ] All modified files compile without errors
- [ ] Relevant tests pass (or new tests added if required)
- [ ] No console errors in development environment
- [ ] Database migrations run successfully (if applicable)

**Documentation Verification:**
- [ ] `tasks/executionnotes.md` entry is complete and factual
- [ ] `tasks/plan.md` status is updated
- [ ] `tasks/codemapcc.md` reflects any new files/tables/routes
- [ ] All file references are correct and verified

**Functional Verification:**
- [ ] Changed behavior matches requirements exactly
- [ ] No regressions introduced (check related features)
- [ ] Edge cases handled as specified

**Document verification in tasks/executionnotes.md.**

If verification cannot be completed (e.g., requires manual testing), state:
`"Verification: Not performed (requires manual [specific action])"`

This is acceptable but must be explicit.

---

## Task Completion Template

For EVERY task, you must be able to answer:

1. **What was the requirement?** (from plan.md)
2. **What did you change?** (files + brief description)
3. **How do you know it works?** (verification performed)
4. **What evidence exists?** (tests passed, logs show X, behavior matches Y)
5. **What is NOT done?** (if anything is deferred, state explicitly)

If you cannot answer all 5 questions, the task is NOT complete.

---

## Execution Prompt Structure (Required)

Every execution prompt MUST contain:

1. **Context**  
   - "You are continuing an existing project governed by tasks/plan.md."

2. **Authority**
   - "tasks/plan.md is the single source of truth for execution."

3. **Scope Lock**  
   - Explicit version (e.g., v8.6 only)

4. **Reading Rules**
   - List which sections of tasks/plan.md to read
   - Reference codemapcc.md for navigation
   - No repo scanning

5. **Execution Rules**  
   - Minimal changes
   - No new dependencies
   - No automation
   - No silent mutation

6. **Write Rules**
   - Append tasks/executionnotes.md (bottom only)
   - Update tasks/plan.md status only
   - Rewrite tasks/session-state.md at end

7. **Task Identification**  
   - Name the **single** next incomplete task
   - State what "DONE" means for this task

8. **Stop Conditions**  
   - Ambiguity → STOP and ask
   - Missing infra → STOP and ask
   - Future-phase enablement → STOP and ask

---

## Uncertainty Handling (Mandatory)

If you encounter uncertainty, you MUST:

1. **Explicitly list**:
   - What is unclear
   - Which assumptions would be required to proceed
   - What information is missing

2. **STOP and ask** before proceeding

You may NOT:
- Infer intent from incomplete information
- "Pick a reasonable default"
- Proceed silently with assumptions
- Implement a "best guess" solution

**Stopping due to uncertainty is the correct behavior, not a failure.**

---

## STOP Event Categories (Explicit)

When stopping, clearly state which category applies:

### STOP - Missing Infrastructure
**Examples:**
- "Database migration requires PostgreSQL running, but cannot verify connection"
- "Frontend route needs API endpoint, but endpoint returns 404"
- "Tests require test database, but connection string not configured"

### STOP - Missing File/Codemap Entry
**Examples:**
- "Task references `UserService` but it's not listed in codemapcc.md"
- "Need to modify baseline controller, but path is not documented"
- "Task mentions field_library table, but it's marked TODO in codemapcc"

### STOP - Ambiguous Requirement
**Examples:**
- "Task says 'add validation' but doesn't specify which fields or rules"
- "Requirement mentions 'confidence scoring' but no algorithm specified"
- "Task says 'handle errors gracefully' but no error handling strategy defined"

### STOP - Scope Conflict with Future Phase
**Examples:**
- "Implementing this field would require changes to v9 baseline system"
- "Fixing this bug properly requires refactoring task assignment logic (planned for v9)"
- "This optimization would affect workflow orchestration (out of scope for v8.6)"

### STOP - Conflicting Source of Truth
**Examples:**
- "tasks/features.md says field is required, but plan.md marks it optional"
- "tasks/executionnotes.md shows table was created, but tasks/codemapcc.md marks it TODO"
- "tasks/plan.md task is marked complete, but no evidence in tasks/executionnotes.md"

### STOP - Blocked Task
**Examples:**
- "Task is marked 'Blocked by: Task B1 completion'"
- "Prerequisites section shows required migration hasn't run"
- "Implementation Order requires Task C before this task"

**Format when stopping:**
```
STOP - [Category]: [Specific issue]. 

Need clarification on: [Question].
```

Do NOT continue until user resolves the issue.

---

## Failure Taxonomy (For STOP Events)

When stopping, provide context for resolution:

**State clearly:**
1. Which STOP category applies (from list above)
2. What specific information is missing or ambiguous
3. What you would need to proceed
4. Which file(s) would clarify the issue

**Example:**
```
STOP - Ambiguous Requirement: Task B1 requires "baseline assignment logic" 
but doesn't specify the matching rules.

Need clarification on:
- Should baselines match on exact document_type or pattern matching?
- What happens when multiple baselines match?
- Should assignment happen on task creation or attachment upload?

This would be clarified by either:
- More detail in tasks/plan.md Task B1 requirements
- Reference to features.md section with business rules
- Explicit user instruction on matching strategy
```

---

## Documentation-Only Mode (Strict Boundaries)

When explicitly instructed to do documentation-only work, you are in **Documentation Mode**.

### In Documentation Mode, you MAY:

- Reconcile `tasks/plan.md` status (fix incorrect checkboxes)
- Reorganize `tasks/executionnotes.md` (maintain chronological order)
- Fix typos or formatting in documentation files
- Add missing entries to `tasks/codemapcc.md` for existing code
- Update `tasks/session-state.md` with current state
- Update `tasks/lessons.md` with historical patterns (if user provides them)

### In Documentation Mode, you MUST NOT:

- Modify any code files (`.ts`, `.tsx`, `.sql`, `.prisma`, etc.)
- Start new implementation tasks
- Expand scope beyond documentation updates
- Create new features or capabilities
- Refactor or "improve" existing implementations
- Change application behavior in any way

**Document what you changed** in `tasks/executionnotes.md` as:
```
## [Date] - Documentation Update

### Objective
Documentation-only: [what was updated]

### What Was Changed
- [Specific documentation changes]

### Status
VERIFIED (documentation only, no code changes)
```

---

## Global Stop Condition

Stop immediately when:

- The current task is completed and documented
- Clarification is required on any point
- Further work would affect future phases
- You are about to repeat work or extend beyond the task scope
- Any STOP event category is triggered
- Verification cannot be completed and must be noted

**Completion without stopping is considered a violation.**

**Stopping is a successful outcome when:**
- Task is done and documented
- Uncertainty is surfaced before incorrect work
- Scope boundary is respected

---

## Cross-File Consistency Rules

When updating files, maintain consistency:

**If you add a file to the codebase:**
- ✅ Update `tasks/codemapcc.md` with file path and purpose
- ✅ Document in `tasks/executionnotes.md` what was added
- ✅ Check `tasks/plan.md` box for the task

**If you add a table/column:**
- ✅ Update `tasks/codemapcc.md` data model section
- ✅ Document schema in `tasks/executionnotes.md`
- ✅ Note migration details

**If you add a route:**
- ✅ Update `tasks/codemapcc.md` frontend map (if frontend) or backend map (if API)
- ✅ Document components/controllers involved
- ✅ List mutations and hooks used

**If you add a controller/service:**
- ✅ Update `tasks/codemapcc.md` backend map
- ✅ Document endpoints and DTOs
- ✅ Note guards and validation

**Inconsistency between files will cause future AI sessions to fail.**

---

## Version Scope Enforcement

`tasks/plan.md` will specify a version scope (e.g., v8.6).

**Rules:**
- You may ONLY work on tasks within that version scope
- You may NOT enable capabilities from future versions
- You may NOT refactor code that serves future versions
- If a "better" solution requires future-version work, note it and use the scoped solution

**Example:**
- Current scope: v8.6 (Field-based baseline extraction)
- User asks to "improve extraction logic"
- Improvement requires v9 workflow orchestration features
- **Correct response**: "STOP - Scope Conflict: Improvement requires v9 features. Proceeding with v8.6-scoped solution only."

---

## Governance Principles (Always Active)

These principles override all other considerations:

1. **Immutable data**: Never modify historical records, only append corrections
2. **Explicit user intent**: Never take action without explicit user confirmation
3. **Audit-first**: All changes must be traceable through tasks/executionnotes.md
4. **No background automation**: All state changes are user-initiated
5. **Deterministic behavior**: Same input must produce same output
6. **Manual verification ownership**: User owns verification, AI documents results

If code you're asked to write violates these principles → **STOP and explain the conflict**.

---

## Context Window Management

If context becomes too large:

1. **Prioritize essential files**:
   - `tasks/plan.md` (always required)
   - `tasks/session-state.md` (always required)
   - `tasks/lessons.md` (always required)
   - `tasks/codemapcc.md` (reference sections as needed)

2. **Use selective reading**:
   - Don't load entire `tasks/executionnotes.md` - use index
   - Don't load entire `tasks/features.md` - load relevant version only
   - Don't load full codebase - use `tasks/codemapcc.md` for paths

3. **If still too large**:
   - **STOP and request**: "Context too large. Please provide only [specific sections needed]."

---

## Error Recovery Protocol

If you realize mid-task that you made an error:

1. **STOP immediately** - don't compound the error
2. **State clearly**:
   - What you did wrong
   - Why it was wrong
   - What the correct approach should be
3. **Ask user**:
   - Should you revert and restart?
   - Should you fix forward?
   - Should you document the error in lessons.md?

**Never silently fix an error and continue.** Transparency is required.

---

## Summary of Absolute Rules

These rules have NO exceptions:

1. ✅ `tasks/plan.md` is single source of truth for execution
2. ✅ Append to `tasks/executionnotes.md` at bottom only (oldest→newest chronological)
3. ✅ Update `tasks/plan.md` status only, never reword tasks
4. ✅ Rewrite `tasks/session-state.md` completely at session end
5. ✅ Never modify `tasks/features.md` unless explicitly instructed
6. ✅ Stop immediately when task is complete or clarity is needed
7. ✅ One task per session unless explicitly told otherwise
8. ✅ Verify against `tasks/codemapcc.md` and `tasks/executionnotes.md`, never assume
9. ✅ STOP and ask when uncertain, never guess
10. ✅ Follow Session Start and Session End protocols every time

Violating any of these is considered a failure, regardless of code quality.

---

**Last Updated**: [To be filled by user when adopting]
**Maintained By**: Project owner
**Review Frequency**: Update when governance requirements change

---