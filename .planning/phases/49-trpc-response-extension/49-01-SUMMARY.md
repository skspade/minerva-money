---
phase: 49-trpc-response-extension
plan: 01
status: complete
started: 2026-03-26
completed: 2026-03-26
---

# Plan 49-01 Summary: tRPC Response Extension

## What Was Built

Extended the `sync.status` tRPC query handler to include a `warnings` array queried from the `sync_warnings` table. The response now returns `{ lastSync, errorCount, accounts, warnings }` where each warning has `accountId`, `accountName`, `errorCode`, `message`, and `lastSeen` fields in camelCase.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Write tests for sync.status warnings array | ✓ Complete |
| 2 | Add warnings query to sync.status handler | ✓ Complete |

## Key Files

### Modified
- `packages/server/src/sync/trpc-router.ts` — Added warnings query and mapping to sync.status handler
- `packages/server/src/sync/trpc-router.test.ts` — Added 4 tests for warnings array

## Approach

TDD red-green cycle: wrote 4 tests first (empty array, shape validation, ordering, backward compatibility), confirmed they failed, then added the implementation. Single `db.prepare().all()` call with `as` cast and snake_case-to-camelCase mapping, matching the existing handler pattern exactly.

## Requirements Satisfied

- **API-01**: sync.status response includes structured warnings array with accountId, accountName, errorCode, message, lastSeen
- **API-02**: Warnings queried from sync_warnings table alongside existing sync status data

## Self-Check: PASSED

- [x] All 20 tests pass (4 new + 16 existing)
- [x] Build succeeds
- [x] Existing fields unchanged
- [x] Empty array when no warnings
- [x] Warnings ordered by lastSeen DESC

## Deviations

None. Implementation matched plan exactly.
