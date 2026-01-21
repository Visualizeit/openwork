---
name: planning-with-files
description: Implements Manus-style file-based planning for complex tasks. Creates task_plan.md, findings.md, and progress.md. Use when starting complex multi-step tasks, research projects, or any task requiring more than 5 tool calls.
---

# Planning with Files Skill

## When to Use

Use this skill when:
- Starting complex multi-step tasks
- Conducting research projects
- Any task requiring more than 5 tool calls
- Tasks that may span multiple sessions
- When you need to maintain context across many operations

Do NOT use for:
- Simple questions or quick lookups
- Single-file edits
- Tasks completable in 1-2 steps

## Core Concept

**Context Window = RAM (volatile, limited)**
**Filesystem = Disk (persistent, unlimited)**

Offload important information to files rather than keeping it only in conversation context.

## The Three-File Pattern

Create these files in the project root:

### 1. task_plan.md
Your roadmap for the entire task. Contains:
- Goal statement (your "north star")
- Current phase tracking
- Phase checklist with status
- Decisions made and rationale
- Error log

### 2. findings.md
Your research knowledge base. Contains:
- Requirements discovered
- Research findings from searches
- Technical decisions with reasoning
- Issues encountered and solutions
- Useful resources and links

### 3. progress.md
Your session activity log. Contains:
- Session timestamps
- Actions performed per phase
- Test results
- Detailed error history
- 5-Question Reboot Check answers

## How to Use

### Starting a Task
1. Read templates from `templates/` directory in this skill folder
2. Create the three files in project root
3. Fill in the Goal and initial phases in task_plan.md

### During Work
1. **Read Before Decide**: Always re-read task_plan.md before major decisions
2. **2-Action Rule**: After every 2 search/read operations, update findings.md
3. **Log Errors**: Document all errors in progress.md with timestamps

### Completing a Task
1. Update all phases to "complete" in task_plan.md
2. Document final test results in progress.md
3. Answer the 5-Question Reboot Check

## Critical Rules

### Rule 1: The 2-Action Rule
After every 2 view/search/browse operations, immediately save key findings to findings.md. Visual and search information doesn't persist in context.

### Rule 2: Read-Before-Decide Pattern
Before any major decision or implementation step, re-read task_plan.md to refresh your goals and context.

### Rule 3: Log All Errors
Every error must be logged in progress.md with:
- Timestamp
- Error message
- What you tried
- Resolution or next steps

### Rule 4: 3-Strike Error Protocol
When encountering errors:
- **Attempt 1**: Diagnose and target the root cause
- **Attempt 2**: Try an alternative approach
- **Attempt 3**: Reconsider fundamental assumptions
After 3 strikes, escalate to the user with full context.

### Rule 5: Never Repeat Failed Actions
If something failed, document it and try a different approach. Never repeat the exact same action expecting different results.

## 5-Question Reboot Check

Before ending a session or after `/clear`, answer these in progress.md:
1. **Where am I?** - Current phase and status
2. **Where am I going?** - Next immediate steps
3. **What's the goal?** - Original objective
4. **What have I learned?** - Key discoveries
5. **What have I done?** - Completed actions

## Read vs Write Decision Matrix

| Situation | Action |
|-----------|--------|
| Starting new task | Write task_plan.md |
| After 2 searches | Write to findings.md |
| Before implementation | Read task_plan.md |
| Hit an error | Write to progress.md |
| Completed a phase | Update task_plan.md status |
| Context feels lost | Read all three files |
