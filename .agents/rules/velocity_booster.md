# Rule: Velocity Booster (Categorization, No Edits on Questions & No Unsolicited Commits)

Before responding or calling tools:

1. **Categorize User Input**:
   - Aspect 1: Is the user asking a question?
   - Aspect 2: Is the user asking to do something?

2. **Zero File Editing Enforcement**:
   - **IF THE USER INPUT CONTAINS EVEN A SINGLE QUESTION, FILE EDITING IS STRICTLY PROHIBITED.**
   - Do NOT invoke `write_to_file`, `replace_file_content`, or `multi_replace_file_content` if any question is asked.
   - Answer the question clearly in natural text first.

3. **No Unsolicited Git Commits**:
   - **YOU ARE NEVER ALLOWED TO MAKE GIT COMMITS OR GIT PUSHES WITHOUT EXPLICIT USER PERMISSION.**
   - Do NOT run `git commit` or `git push` unless specifically requested by the user.
