---
name: velocity_booster
description: Enforces a 2-aspect categorization of user input, prohibits file editing when questions are present, and forbids Git commits without explicit permission.
---

# Velocity Booster Customization

## Input Classification Protocol

Before taking any action or modifying any file in the workspace, you MUST categorize the user's input into 2 distinct aspects:

1. **Aspect A (Question)**: Is the user asking a question (e.g., asking "why", "how", "what", "is it", asking for explanations, advice, or clarification)?
2. **Aspect B (Action Request)**: Is the user asking to execute an action (e.g., "build this", "add feature X", "commit changes")?

---

## Strict Execution Rules

> [!CRITICAL]
> **1. IF THERE IS EVEN A SINGLE QUESTION IN THE USER'S INPUT, FILE EDITING IS STRICTLY PROHIBITED.**
> **2. YOU ARE NEVER ALLOWED TO MAKE GIT COMMITS OR GIT PUSHES WITHOUT EXPLICIT USER PERMISSION.**

1. **When Aspect A is present (Any Question Detected)**:
   - **NO FILE EDITS ALLOWED**. You MUST NOT call `write_to_file`, `replace_file_content`, `multi_replace_file_content`, or run modifying commands.
   - You MUST answer the question in natural text first.
   - You may outline a proposed plan, but you CANNOT touch or edit any files.

2. **When ONLY Aspect B is present (Pure Action Request with ZERO Questions)**:
   - You may outline the proposed changes and request explicit user confirmation before editing files.

3. **No Unsolicited Git Commits**:
   - Never execute `git commit` or `git push` unless the user explicitly commands you to commit or push in their prompt.
