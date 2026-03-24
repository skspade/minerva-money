---
phase: quick
plan: 2
subsystem: ui
tags: [react, trpc, tanstack-query, sync]

requires:
  - phase: none
    provides: existing sync.trigger tRPC mutation
provides:
  - Manual sync button on Dashboard
affects: []

tech-stack:
  added: []
  patterns: [useMutation with query invalidation on success]

key-files:
  created: []
  modified: [packages/client/src/pages/DashboardPage.tsx]

key-decisions:
  - "Reused existing text-link style for button to match View all links"
  - "Added error display in both no-sync and has-sync branches"

patterns-established: []

requirements-completed: [QUICK-2]

duration: 1min
completed: 2026-03-24
---

# Quick Task 2: Add Sync Now Button Summary

**Manual sync button on Dashboard Sync Status card using existing sync.trigger tRPC mutation with loading state and inline error display**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-24T21:44:20Z
- **Completed:** 2026-03-24T21:45:09Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added "Sync Now" button to Dashboard Sync Status card header
- Button shows "Syncing..." loading state while mutation is pending
- On success, invalidates sync.status and accounts.list queries to refresh dashboard
- Mutation errors displayed inline with red background styling

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Sync Now button to Dashboard Sync Status card** - `558f793` (feat)

## Files Created/Modified
- `packages/client/src/pages/DashboardPage.tsx` - Added useMutation/useQueryClient imports, sync mutation with invalidation, Sync Now button in card header, inline error display

## Decisions Made
- Used text-link style (`text-blue-600 hover:text-blue-800`) to match existing "View all" links in other cards
- Added mutation error display in both the "No syncs recorded" and normal sync status branches so errors show regardless of sync history state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added error display for no-sync-history state**
- **Found during:** Task 1
- **Issue:** Plan only specified error display after the sync status details block, but if no syncs have been recorded yet, the error would never be visible
- **Fix:** Added mutation error display in the `!syncStatus?.lastSync` branch as well
- **Files modified:** packages/client/src/pages/DashboardPage.tsx
- **Verification:** Build passes, both branches have error display
- **Committed in:** 558f793 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correct UX when user has no sync history. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sync button is fully functional, no follow-up work needed

---
*Plan: quick-2*
*Completed: 2026-03-24*
