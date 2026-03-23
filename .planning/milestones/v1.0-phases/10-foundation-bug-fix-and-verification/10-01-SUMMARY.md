---
phase: 10-foundation-bug-fix-and-verification
plan: 01
subsystem: infra
tags: [better-sqlite3, tsx, launchd, backup]

requires:
  - phase: 01-foundation
    provides: createBackup function and backup.ts module
provides:
  - run-backup.ts standalone entry point for launchd scheduled backups
affects: []

tech-stack:
  added: []
  patterns: [standalone script entry point using direct DB open instead of createDatabase]

key-files:
  created:
    - packages/server/src/backup/run-backup.ts
    - packages/server/src/backup/run-backup.test.ts
  modified: []

key-decisions:
  - "Open DB directly with better-sqlite3 instead of createDatabase() to avoid running migrations during backup"
  - "Use process.exitCode instead of process.exit to allow finally block to run"

patterns-established:
  - "Standalone scripts: open DB directly, set WAL, try/catch/finally with db.close()"

requirements-completed: [INFR-01]

duration: 5min
completed: 2026-03-22
---

# Phase 10 Plan 01: Run-Backup Entry Point Summary

**Standalone run-backup.ts script for launchd-scheduled atomic SQLite backups to iCloud Drive**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22
- **Completed:** 2026-03-22
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created `run-backup.ts` that opens production DB, calls `createBackup()`, logs result, and exits cleanly
- Fixed the broken INFR-01 requirement — launchd plist now has a valid script to execute
- Added 3 tests verifying the backup entry-point pattern

## Task Commits

1. **Task 1: Create run-backup.ts entry-point script** - `bd1b358` (feat)

## Files Created/Modified
- `packages/server/src/backup/run-backup.ts` - Standalone backup script for launchd
- `packages/server/src/backup/run-backup.test.ts` - Tests for backup entry-point pattern

## Decisions Made
- Opened DB directly with `new Database(path)` instead of `createDatabase()` to avoid running migrations during backup
- Used `process.exitCode = 1` instead of `process.exit(1)` so the `finally` block runs and closes the DB
- Set WAL mode explicitly since we bypass the connection module

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- run-backup.ts exists at the exact path referenced by com.minerva.backup.plist
- All 10 backup tests pass (7 existing + 3 new)

---
*Phase: 10-foundation-bug-fix-and-verification*
*Completed: 2026-03-22*
