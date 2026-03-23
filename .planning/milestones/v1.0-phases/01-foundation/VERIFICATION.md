# Phase 1: Foundation - Verification

**Verified:** 2026-03-22
**Phase Goal:** The project is buildable, the database schema is correct by design, and the backup system is in place before any data is written
**Result:** PASS

## Requirements

### INFR-01: App performs atomic SQLite backups to iCloud Drive every 6 hours via launchd

**Status:** PASS

**Evidence:**
- `packages/server/src/backup/run-backup.ts` exists as a standalone entry point that opens the production DB and calls `createBackup(db)` (created by Phase 10, Plan 10-01)
- `com.minerva.backup.plist` references the correct absolute path: `/Users/seanspade/Documents/Source/minverva-money/packages/server/src/backup/run-backup.ts`
- Plist `StartInterval` is `21600` (6 hours in seconds)
- Plist `RunAtLoad` is `true` (runs immediately on load)
- `createBackup()` in `backup.ts` line 44 uses `db.backup(backupPath)` — the native SQLite atomic backup API
- `DEFAULT_BACKUP_DIR` resolves to `~/Library/Mobile Documents/com~apple~CloudDrive/MinervaBackups/` (iCloud Drive)
- Plist captures stdout/stderr to `~/Library/Logs/minerva-backup.log`
- `run-backup.ts` opens the DB directly with `better-sqlite3` (no migrations), sets WAL mode, calls `createBackup`, logs result, closes DB in `finally` block, and exits with code 1 on failure

### INFR-02: App triggers SQLite backup after every SimpleFIN sync completion

**Status:** PASS

**Evidence:**
- `packages/server/src/sync/sync-service.ts` line 5 imports `createBackup` from `../backup/backup.js`
- Line 74-76: after successful sync, calls `await createBackup(db)` inside a `try/catch` block
- The `catch` block is intentionally empty with comment "Backup failure should not fail the sync" — backup is best-effort after sync
- The backup is gated by `!options.skipBackup` (line 74), allowing tests to bypass

### INFR-03: App retains 30 days of timestamped backup snapshots plus a latest copy

**Status:** PASS

**Evidence:**
- `packages/server/src/backup/backup.ts` line 22: `RETENTION_DAYS = 30`
- `pruneOldBackups()` (lines 68-84): iterates backup directory, deletes files with `mtime` older than 30 days, preserves `minerva_latest.db`
- `createBackup()` line 40: creates timestamped file named `minerva_${timestamp}.db` (e.g., `minerva_20260322_141500.db`)
- `createBackup()` line 46: copies timestamped backup to `minerva_latest.db` via `fs.copyFileSync`
- `createBackup()` line 56: calls `pruneOldBackups(dir)` after every backup
- Test evidence: `backup.test.ts` "prunes backups older than 30 days" (lines 79-97) — creates a file 31 days old, runs backup, confirms old file deleted and recent file preserved

### INFR-04: All money values are stored as integers (cents) to avoid floating-point errors

**Status:** PASS

**Evidence:**
- `packages/server/migrations/001-initial-schema.sql` line 2: comment `-- All money values are INTEGER (cents) to avoid floating-point errors.`
- Money-value columns confirmed as INTEGER:
  - `accounts.balance` — `INTEGER NOT NULL DEFAULT 0` (line 10)
  - `transactions.amount` — `INTEGER NOT NULL` (line 37)
  - `budget_allocations.amount` — `INTEGER NOT NULL DEFAULT 0` (line 57)
  - `categorization_rules.amount_min` — `INTEGER` (line 68)
  - `categorization_rules.amount_max` — `INTEGER` (line 69)
  - `balance_snapshots.balance` — `INTEGER NOT NULL` (line 90)
- No REAL or FLOAT types used for any monetary column in the schema

## Test Evidence

- `packages/server/src/backup/backup.test.ts`: 7 tests passing — covers timestamped backup creation, latest copy, integrity check, directory creation, BackupResult shape, data validity, and 30-day pruning
- `packages/server/src/backup/run-backup.test.ts`: 3 tests passing — covers backup pattern (open DB, backup, close), data preservation, and clean database close

## Summary

All 4 INFR requirements are satisfied. The backup system performs atomic SQLite backups via `db.backup()` to iCloud Drive on a 6-hour launchd schedule (INFR-01), triggers after every sync (INFR-02), retains 30 days of timestamped snapshots plus a latest copy (INFR-03), and all money values are stored as INTEGER cents (INFR-04). The missing `run-backup.ts` entry point was the only broken requirement; the other three were correctly implemented since Phase 1 but lacked formal verification documentation.
