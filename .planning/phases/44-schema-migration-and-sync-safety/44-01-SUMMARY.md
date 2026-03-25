---
phase: 44-schema-migration-and-sync-safety
plan: 01
subsystem: database
tags: [sqlite, migration, trpc, sync]

requires: []
provides:
  - source column on accounts table distinguishing manual from SimpleFIN accounts
  - sync pipeline filtered to SimpleFIN-only accounts
  - source field exposed in accounts.list, sync.status, and agent queries
affects: [phase-45-account-crud, phase-46-client-ui]

tech-stack:
  added: []
  patterns: [source-column-filtering]

key-files:
  created:
    - packages/server/migrations/006-account-source.sql
  modified:
    - packages/server/src/sync/trpc-router.ts
    - packages/server/src/agent/tools/query-tools.ts
    - packages/server/src/sync/sync-service.test.ts

key-decisions:
  - "No index on source column -- table has ~3 rows, not needed at current scale"
  - "Agent query-tools updated for consistency even though not in explicit requirements"

patterns-established:
  - "Source filtering: queries touching the sync pipeline filter by source = 'simplefin'"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04]

duration: 5min
completed: 2026-03-25
---

# Phase 44: Schema Migration and Sync Safety Summary

**Added source column to accounts table with migration 006, filtered sync trigger to SimpleFIN-only, and exposed source field in all account queries**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25
- **Completed:** 2026-03-25
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Migration 006-account-source.sql adds `source TEXT NOT NULL DEFAULT 'simplefin'` to accounts table
- Sync trigger rate-limit pre-check now only queries SimpleFIN accounts, protecting manual accounts from sync contamination
- accounts.list, sync.status, and agent get_account_balances all return the source field
- 3 new tests verify migration defaults, sync isolation, and source field in list queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration and update tRPC queries** - `3861edf` (feat)
2. **Task 2: Add tests for source column and sync filtering** - `213c5be` (test)

## Files Created/Modified
- `packages/server/migrations/006-account-source.sql` - Migration adding source column
- `packages/server/src/sync/trpc-router.ts` - Updated sync.trigger, accounts.list, sync.status queries
- `packages/server/src/agent/tools/query-tools.ts` - Added source to get_account_balances query
- `packages/server/src/sync/sync-service.test.ts` - 3 new tests for source column behavior

## Decisions Made
- Updated agent query-tools for consistency, even though not explicitly in requirements
- Kept existing `available_balance` reference in agent query (pre-existing issue, out of scope)

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Source column exists and defaults correctly for all existing SimpleFIN accounts
- Sync pipeline is safe for manual accounts to coexist
- Phase 45 can implement account CRUD service using `source = 'manual'` and `manual_` ID prefix
- Phase 46 can read `source` field from accounts.list to differentiate UI display

---
*Phase: 44-schema-migration-and-sync-safety*
*Completed: 2026-03-25*
