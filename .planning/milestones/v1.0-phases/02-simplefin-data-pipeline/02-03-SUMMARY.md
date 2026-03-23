---
phase: 02-simplefin-data-pipeline
plan: 03
subsystem: sync
tags: [croner, scheduler, auto-sync]

requires:
  - phase: 02-simplefin-data-pipeline
    provides: runSync, getSimpleFINClient, createRateLimiter
provides:
  - Croner-based sync scheduler (startSyncScheduler, stopSyncScheduler)
  - Twice-daily execution at 6AM and 6PM
affects: [02-simplefin-data-pipeline]

tech-stack:
  added: [croner]
  patterns: [croner 6-field cron expression, error-resilient scheduling]

key-files:
  created:
    - packages/server/src/sync/sync-scheduler.ts
    - packages/server/src/sync/sync-scheduler.test.ts
  modified:
    - packages/server/package.json

key-decisions:
  - "Cron expression '0 0 6,18 * * *' for 6AM and 6PM daily"
  - "Module-level job variable for singleton scheduler pattern"

patterns-established:
  - "Error-resilient cron callback: try/catch wraps entire sync, scheduler never dies"

requirements-completed: [SYNC-02, SYNC-05]

duration: 5min
completed: 2026-03-22
---

# Plan 02-03: Sync Scheduler Summary

**Croner schedules twice-daily auto-sync at 6AM/6PM with error-resilient execution that never crashes the scheduler.**

## Performance

- **Duration:** 5 min
- **Tasks:** 2/2 completed
- **Files created:** 2
- **Tests:** 4 passing

## Accomplishments

- Installed croner dependency
- Implemented startSyncScheduler and stopSyncScheduler lifecycle functions
- Cron expression validated: next runs are always at hour 6 or 18
- Error handling wraps entire sync callback in try/catch

## Self-Check: PASSED

- [x] Scheduler creates cron job for 6AM/6PM
- [x] Errors caught and logged, never thrown
- [x] Stop permanently halts the job
- [x] 4 tests passing
