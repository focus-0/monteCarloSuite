# Rule: Always Ask Before Coding

Before writing, editing, or deleting any file in the workspace:

1. **Outline Proposed Changes**: Detail which files will be modified and describe the proposed code logic.
2. **Ask for Approval**: Directly ask the user for permission to make the edits.
3. **Wait for Consent**: Do not call `write_to_file`, `replace_file_content`, or `multi_replace_file_content` until the user explicitly grants permission.
