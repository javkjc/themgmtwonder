# AI Assistant Working Instructions
*Compatible with Claude, ChatGPT, and other LLMs*
*Last updated: 2026-02-05*

## Purpose

This file provides behavioral guidelines and workflow optimization for AI assistants working on this project. It complements (does not replace) the strict governance rules in `tasks/prompt_guidelines.md`.

**Authority Hierarchy:**
1. `tasks/prompt_guidelines.md` - Execution governance (MUST follow)
2. `tasks/ai-rules.md` - Behavioral standards (SHOULD follow)
3. When in conflict, `tasks/prompt_guidelines.md` always wins

## Required Reading on Session Start

Before beginning any work, read these files in order:

1. **tasks/prompt_guidelines.md** - Understand execution governance
2. **tasks/session-state.md** - Where we are now
3. **tasks/lessons.md** - Patterns to avoid
4. **tasks/plan.md** - What we're doing (check NEXT TASK pointer)
5. **tasks/codemapcc.md** - Where code lives (reference as needed)
6. **tasks/features.md** - Why we're building this (context only)

## Workflow Orchestration

### 1. Plan Mode Default
- Use plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- **Before execution**: State all assumptions explicitly and confirm alignment

### 2. Context Management
- **Claude**: Use artifacts for code generation, enable plan mode when needed
- **ChatGPT**: Provide complete file contents with clear file boundaries
- Keep main context focused on active work
- Use `tasks/codemapcc.md` for navigation instead of scanning repository
- Reference `tasks/features.md` for "why" context, not "what" to build (plan.md owns execution)

### 3. Self-Improvement Loop
- After ANY correction from user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake
- Review `tasks/lessons.md` at session start for relevant patterns
- **Pattern recognition**: If corrected twice on same issue, it becomes a blocking rule
- Format: Date, Problem, Root Cause, Rule, Related Feature

### 4. Verification Before Done
- Never mark task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- **Show your work**: Provide diff summaries for multi-file changes
- **Enable verification**: Give test commands to copy-paste
- **State confidence**: "95% confident this works" vs "needs testing because X"

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: propose both quick-fix and elegant solution with effort estimates
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it
- **Technical debt awareness**: If taking shortcut, document it and propose cleanup task

### 6. Autonomous Bug Fixing
- When given bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from user
- Go fix failing CI tests without being told how
- **Root cause analysis**: After fixing, identify what failed to prevent it earlier
- **Prevention**: Update `tasks/lessons.md` or add tests to catch similar issues

### 7. Context Preservation
- Before ending session: update `tasks/session-state.md` with current state
- Document where you stopped and what's next
- Note any open questions or decisions needed
- Include context that would help resume in <2 minutes next time
- **Handoff quality test**: Could another AI assistant resume immediately?

### 8. Boundary Respect
- Ask before refactoring code outside immediate task scope
- Flag when "fixing this properly" requires touching multiple systems
- **Scope creep detection**: "This task is growing into X, Y, Z — should I continue or split?"
- Respect the "one concern per task" principle from `tasks/prompt_guidelines.md`

## Task Management Protocol

1. **Identify Task**: Find NEXT TASK from tasks/plan.md
2. **Verify Understanding**: Check requirements and files list
3. **Track Progress**: Mark items complete as you go (update tasks/plan.md status only)
4. **Explain Changes**: High-level summary at each step (what changed, why, impact)
5. **Document Results**: Append to tasks/executionnotes.md with structured format (see below)
6. **Capture Lessons**: Update tasks/lessons.md after any user corrections
7. **Update State**: Rewrite tasks/session-state.md before ending session

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Proof of Work**: Code isn't done until it's verified working.
- **Continuous Learning**: Every mistake becomes a lesson that prevents future mistakes.
- **Elegant by Default**: When effort is similar, always choose cleaner solution.
- **Autonomous Execution**: Minimize back-and-forth. Take ownership.
- **Governance First**: `tasks/prompt_guidelines.md` rules are non-negotiable.

## Communication Standards

- **Concise Updates**: Say what changed, not a novel about the journey
- **Proactive Problem Reporting**: Surface issues immediately, don't hide them
- **Question Quality**: Ask clarifying questions upfront, not halfway through
- **Assumption Validation**: "I'm assuming X, Y, Z — correct?" before big changes
- **Honest Uncertainty**: "I don't know" is better than guessing
- **Respect Stop Conditions**: From `tasks/prompt_guidelines.md` - stop when task complete or clarity needed

## Anti-Patterns to Avoid

- ❌ Continuing when confused — STOP and ask (per `tasks/prompt_guidelines.md`)
- ❌ Implementing before plan is verified
- ❌ Marking tasks complete without testing
- ❌ Repeating same mistake twice (use lessons.md)
- ❌ Over-engineering simple fixes
- ❌ Under-engineering complex problems
- ❌ Assuming instead of confirming
- ❌ Temporary fixes that become permanent
- ❌ Violating any rule in tasks/prompt_guidelines.md

## File Update Rules

Per tasks/prompt_guidelines.md requirements:

**tasks/executionnotes.md:**
- Append only (never modify existing entries)
- New entries at **bottom of file** (chronological ascending: oldest at top, newest at bottom)
- Use structured format below
- Factual only - what changed, where, why (brief)

**tasks/plan.md:**
- Update status only (check/uncheck boxes)
- Never reword tasks
- Never add scope
- Never reshuffle sections

**tasks/session-state.md:**
- Rewrite completely at session end
- Must contain: where stopped, what's half-done, next step, context, open questions

**tasks/lessons.md:**
- Append new pattern entries after user corrections
- Format: Date, Problem, Root Cause, Rule, Related Feature

**tasks/features.md:**
- MUST NOT be modified unless explicitly instructed by user

**tasks/codemapcc.md:**
- Update when new files/tables/routes/controllers are added
- Keep format consistent with existing entries

## executionnotes.md Entry Format

Use this structure for all appends (per tasks/prompt_guidelines.md):

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
[What was tested and results, or "Not performed (manual)" if applicable]

### Status
[VERIFIED] or [UNVERIFIED] or [NEEDS-TESTING]

### Notes
- **Impact**: Affects Feature #[X] from features.md
- **Assumptions**: [Any assumptions made, if applicable]
- **Open Questions**: [If any decisions deferred]
```

## Model-Specific Notes

- **Claude Sonnet/Opus**:
  - Use plan mode for complex tasks
  - Enable artifacts for code generation
  - Use web search if uncertain about current state

- **ChatGPT**:
  - Provide complete file contents with clear boundaries
  - Use code interpreter for verification when available
  - Be explicit about file paths

- **Both**:
  - Follow all tasks/prompt_guidelines.md governance rules
  - Maintain file update discipline
  - Review lessons.md at session start
  - Update session-state.md at session end

## Integration with tasks/prompt_guidelines.md

This file (ai-rules.md) provides **behavioral standards** that complement the **governance rules** in tasks/prompt_guidelines.md.

**Key differences:**
- tasks/prompt_guidelines.md: WHAT you must do (authority, scope, stop conditions)
- ai-rules.md: HOW you should do it (quality, style, learning, continuity)

**When in conflict:** tasks/prompt_guidelines.md always wins.

**Session structure:**
1. User crafts prompt following tasks/prompt_guidelines.md structure
2. User tells you to read tasks/ai-rules.md
3. You execute following both sets of rules
4. You document following both file update protocols

---

## Execution Prompt Generation Guidelines

When generating execution prompts for tasks (meta-level prompt crafting):

### Prompt Structure Template

Every execution prompt should contain:

1. **Context**  
   - "You are continuing an existing [project type] governed by tasks/plan.md."
   - **[IF RELEVANT]** Add session context when tasks have dependencies:
     - "Task [ID] is complete. [Key info: helper exists, validation added, etc.]"
   - Skip session context for independent tasks

2. **Authority**
   - "tasks/plan.md is the single source of truth for execution."

3. **Scope Lock**  
   - Explicit constraint (e.g., "UX/UI fixes only" or "v8.6 only")

4. **Task Description**
   - What to build, specific files from codemapcc.md, line number hints

5. **Execution Rules**  
   - Minimal changes, no new dependencies, preserve governance principles

6. **Verification Requirements**
   - Manual tests from Checkpoint sections in plan.md

7. **Write Rules**
   - Append executionnotes.md, update plan.md status only, rewrite session-state.md

8. **Stop Conditions**  
   - Ambiguity → STOP, Task complete → STOP and document

### When to Include Session Context

**✅ Include when:**
- Task depends on previous task's output (e.g., A3 uses A1's helper)
- Prior task revealed constraints affecting current work
- Verification from previous task informs current approach

**❌ Skip when:**
- Task is independent (e.g., auth fix unrelated to calendar work)
- Following strict execution order with no cross-dependencies
- Plan.md contains all needed context

### Target Length
- Aim for ~100-150 words for execution prompts
- Concise but complete
- Reference files from codemapcc.md, not repo scanning

---

**Last Updated**: 2026-02-05
**Maintained By**: Project owner
**Review Frequency**: Update when workflow patterns change
