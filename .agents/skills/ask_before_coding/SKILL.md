---
name: ask_before_coding
description: Ensures the agent always proposes the exact plan and asks for explicit user approval before making any code modifications or creating new files.
---

# Ask Before Coding Rule

## Protocol Requirements

1. **No Unsolicited Edits**: Before writing, modifying, replacing, or deleting any file in the workspace, you MUST stop and present the proposed changes to the user.
2. **Present Clear Rationale**:
   - Explain what files will be created or edited.
   - Summarize the exact changes to be made.
   - List the technical rationale and impact.
3. **Wait for Explicit Approval**: Ask the user directly for permission (e.g., "Would you like me to proceed with creating/editing these files?") and WAIT for their explicit approval before calling any code modification tools (`write_to_file`, `replace_file_content`, `multi_replace_file_content`).
