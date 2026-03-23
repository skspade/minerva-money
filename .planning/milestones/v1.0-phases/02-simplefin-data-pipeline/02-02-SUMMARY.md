---
phase: 02-simplefin-data-pipeline
plan: 02
subsystem: sync
tags: [sync-service, deduplication, rate-limiter, balance-snapshots]

requires:
  - phase: 02-simplefin-data-pipeline
    provides: SimpleFIN client, normalizeAccount, normalizeTransaction, generateDedupHash
provides:
  - Sync service (runSync, syncAccount) with layered dedup
  - Rate limiter with 20/day per account limit and manual reserve
  - Balance snapshot recording after each successful account sync
  - Sync log tracking (running -> success/error transitions)
  - Post-sync backup integration
affects: [02-simplefin-data-pipeline]

tech-stack:
  added: []
  patterns: [INSERT OR IGNORE for dedup, INSERT OR REPLACE for balance snapshots, in-memory rate limiting with daily reset]

key-files:
  created:
    - packages/server/src/sync/sync-service.ts
    - packages/server/src/sync/sync-service.test.ts
    - packages/server/src/sync/rate-limiter.ts
    - packages/server/src/sync/rate-limiter.test.ts
  modified: []

key-decisions:
  - "Rate limiter uses Map<string, {count, date}> with date comparison for daily reset"
  - "Sync processes accounts inside db.transaction() for atomic per-account operations"
  - "Account upsert uses ON CONFLICT(id) DO UPDATE for balance and last_synced"
  - "Backup failure after sync does not fail the overall sync"

patterns-established:
  - "SyncResult interface for structured sync outcome reporting"
  - "SyncOptions with skipBackup for test isolation"

requirements-completed: [SYNC-01, SYNC-05, ACCT-02]

duration: 10min
completed: 2026-03-22
---

# Plan 02-02: Sync Service Summary

**Sync service deduplicates transactions via INSERT OR IGNORE, enforces 20/day rate limit per account, and records balance snapshots.**

## Performance

- **Duration:** 10 min
- **Tasks:** 2/2 completed
- **Files created:** 4
- **Tests:** 17 passing (8 rate limiter + 9 sync service)

## Accomplishments

- Rate limiter with per-account daily tracking and manual sync reserve
- Sync service orchestrating: fetch -> normalize -> upsert account -> insert transactions -> balance snapshot
- Layered dedup: primary key + dedup_hash UNIQUE index, both handled by INSERT OR IGNORE
- Verified: second sync with same data adds 0 transactions
- Sync log status transitions (running -> success/error) with account context in error messages
- Balance snapshots use INSERT OR REPLACE for same-day re-syncs

## Self-Check: PASSED

- [x] Sync populates accounts and transactions with integer cents
- [x] Dedup prevents duplicate transactions
- [x] Rate limiter enforces daily limit
- [x] Sync failures logged with context
- [x] Balance snapshots recorded per account
- [x] 17 tests passing
