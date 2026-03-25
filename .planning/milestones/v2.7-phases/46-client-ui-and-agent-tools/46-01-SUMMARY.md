# Plan 46-01 Summary: Agent create_account Tool and System Prompt

**Status:** Complete
**Completed:** 2026-03-25

## What Was Built

1. Added `create_account` action tool to agent tools (tool #13) that creates manual accounts via `createAccount` service function with duplicate name detection
2. Updated `get_account_balances` query tool description to mention the `source` field distinguishing manual from SimpleFIN accounts
3. Added Account Management section to system prompt with rules 17-19: check existing accounts before creating, confirmation block for `create_account`, and guidance that manual accounts are for non-SimpleFIN institutions

## Key Files

### Created
None (all modifications)

### Modified
- `packages/server/src/agent/tools/action-tools.ts` — added `create_account` tool, `duplicateAccountName` helper, `createAccount` import
- `packages/server/src/agent/tools/action-tools.test.ts` — updated tool count to 13, added `create_account` to names list, added 4 test cases
- `packages/server/src/agent/tools/query-tools.ts` — updated `get_account_balances` description to mention `source` field
- `packages/server/src/agent/system-prompt.ts` — added Account Management section with rules 17-19
- `packages/server/src/agent/system-prompt.test.ts` — added 4 tests for account management section

## Test Results
- action-tools.test.ts: 36/36 passed
- system-prompt.test.ts: 11/11 passed

## Decisions
- Used `duplicateAccountName` case-insensitive check matching existing `duplicateGroupName` pattern
- Type enum restricted to `banking | credit` (no investment per CRUD-04)
