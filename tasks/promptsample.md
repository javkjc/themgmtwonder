// .vscode/snippets.code-snippets
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

for simple tesk

# [Task Name] - [Task ID]

**Governance:** Follow `prompt_guidelines.md` and `ai-rules.md`

**Context:** Read per Session Start Protocol
- [task file] - [specific task]
- tasks/session-state.md
- codemapcc.md - [what to locate]

**Execute:** [task from task file]
- [key steps]

**Stop when:** [done criteria]

**Document:** Per Session End Protocol