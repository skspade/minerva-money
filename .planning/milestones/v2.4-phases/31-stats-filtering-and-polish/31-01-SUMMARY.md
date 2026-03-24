# Plan 31-01: Stats Filtering and Polish — Summary

**Status:** Complete
**Completed:** 2026-03-24

## What Was Built

Added client-side skip-aware filtering to the import wizard so all preview stats, sample rows, dedup stats, confirm summary, and results page accurately reflect skip decisions. Added "Skip All Unmatched" convenience button and a summary banner showing import scope.

## Key Changes

### New Helper Function
- `computeSkipFilterStats()` — pure function computing skipped account names and total skipped row count from account mappings and row-count-by-account data. Exported and tested with 5 cases.

### PreviewStep Enhancements
- **Summary banner (PLSH-02):** Amber banner showing "Importing from X of Y accounts (Z skipped)" when accounts are skipped
- **Filtered stats (STAT-01):** Total rows and valid rows dynamically exclude rows from skipped accounts
- **Filtered sample rows (STAT-02):** Sample rows table excludes rows from skipped accounts, with note about excluded count
- **Dedup exclusion note (STAT-03):** Note below dedup stats showing how many rows are excluded from skipped accounts
- **Skip All Unmatched button (PLSH-01):** Text button in account mappings header that sets all undecided accounts to skip

### ResultsStep Enhancements
- **Confirm summary (EXEC-02):** Added amber skipped-accounts card and exclusion note to pre-execution summary
- **Results card (EXEC-02):** Added amber skippedByAccountFilter stat card to post-execution results grid

## Requirements Satisfied
- STAT-01: Preview stats filtering
- STAT-02: Sample rows filtering
- STAT-03: Dedup stats note
- EXEC-02: Confirm summary and results filtering
- PLSH-01: Skip All Unmatched button
- PLSH-02: Summary banner

## Key Files

### Modified
- `packages/client/src/pages/ImportPage.tsx` — all UI changes
- `packages/client/src/pages/ImportPage.test.ts` — new computeSkipFilterStats tests

## Self-Check: PASSED

- [x] All tasks executed
- [x] Each task committed individually (3 commits)
- [x] All 17 tests pass
- [x] TypeScript build succeeds
- [x] All 6 requirements addressed

## Deviations

None.
