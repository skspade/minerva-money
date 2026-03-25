---
phase: 35-system-prompt-updates
plan: 01
status: complete
started: 2026-03-25
completed: 2026-03-25
---

# Plan 35-01 Summary: Add Category Management Section to System Prompt

## What was built

Added a `## Category Management` section to the system prompt in `packages/server/src/agent/system-prompt.ts` with three new rules (14-16):

- **Rule 14 (SYS-04, SYS-01)**: Instructs the agent to call `list_categories` before creating a category or group to check for duplicates. If a match exists, suggest using the existing one.
- **Rule 15 (SYS-02, SYS-01)**: Requires the agent to present a confirmation block (matching the existing budget confirmation format) before calling `create_category_group` or `create_category`. Includes examples for both tools.
- **Rule 16 (SYS-03)**: States the agent cannot delete or rename categories and provides exact redirect text pointing users to the Categories page.

## Tests added

Created `packages/server/src/agent/system-prompt.test.ts` with 7 tests verifying:
1. Category Management section exists
2. Duplicate check instruction references `list_categories` (SYS-04)
3. Confirmation block for `create_category_group` (SYS-02)
4. Confirmation block for `create_category` (SYS-02)
5. Delete/rename redirect to Categories page (SYS-03)
6. Both creation tools documented (SYS-01)
7. Date appending (existing behavior)

## Files modified

| File | Change |
|------|--------|
| `packages/server/src/agent/system-prompt.ts` | Added Category Management section with rules 14-16 |
| `packages/server/src/agent/system-prompt.test.ts` | New test file with 7 tests |

## Requirements satisfied

- SYS-01: System prompt documents both category creation tools with usage guidance
- SYS-02: System prompt requires confirmation before category/group creation
- SYS-03: System prompt instructs agent to direct users to Categories page for delete/rename
- SYS-04: System prompt guides agent to check for existing categories before creating duplicates

## Commits

1. `24fc82d` — `test(35-01): add failing tests for system prompt category management` (RED)
2. `02afbca` — `feat(35-01): add category management section to system prompt` (GREEN)
