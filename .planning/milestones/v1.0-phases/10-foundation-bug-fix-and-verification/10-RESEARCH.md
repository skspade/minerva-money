# Phase 10: Foundation Bug Fix & Verification - Research

**Researched:** 2026-03-22
**Domain:** SQLite backup scripting, requirement verification
**Confidence:** HIGH

## Summary

Phase 10 is a focused gap-closure phase with two deliverables: (1) create the missing `run-backup.ts` entry-point script that the existing `com.minerva.backup.plist` references, and (2) write a Phase 1 VERIFICATION.md formally documenting that all 4 INFR requirements are satisfied.

The codebase already has everything needed. The `createBackup(db, backupDir?)` function in `backup.ts` handles the entire backup workflow (atomic copy, integrity check, latest copy, pruning). The `run-backup.ts` script just needs to open the production database with `better-sqlite3`, call `createBackup(db)`, log the result, close the DB, and exit. The plist already uses `--import tsx` so no build step is needed.

**Primary recommendation:** Create a minimal `run-backup.ts` (under 30 lines) that wraps `createBackup`, then write VERIFICATION.md with concrete evidence for each INFR requirement.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `run-backup.ts` must exist at `packages/server/src/backup/run-backup.ts` to match the path in `com.minerva.backup.plist`
- The script must be a standalone entry point that opens the database and calls `createBackup(db)` from the existing `backup.ts` module
- The script must use the production database path `~/minerva-money/data/minerva.db`
- The plist already uses `--import tsx` to run TypeScript directly via Node, so no compilation step is needed
- The script should log success/failure output to stdout/stderr since the plist captures both to `~/Library/Logs/minerva-backup.log`
- The script should exit with code 0 on success and non-zero on failure
- The script should close the database connection and exit cleanly after backup completes
- VERIFICATION.md is written for Phase 1 at `.planning/phases/01-foundation/VERIFICATION.md`
- Covers all 4 requirements: INFR-01, INFR-02, INFR-03, INFR-04
- Each requirement gets a pass/fail status with concrete evidence
- No modifications to the plist file itself are needed

### Claude's Discretion
- Exact log message format in `run-backup.ts`
- Whether to add a test for `run-backup.ts` or rely on manual execution verification
- VERIFICATION.md prose style and level of detail per requirement
- Whether to include test output snippets as evidence in VERIFICATION.md

### Deferred Ideas (OUT OF SCOPE)
- Phases 5, 6, and 9 VERIFICATION.md files (Phase 11 scope)
- Off-by-one date bug fix in spending queries (Phase 11 scope)
- Budget defaults UI (Phase 12 scope)
- Test consolidation for rules-service.test.ts boilerplate
- launchctl load/unload automation
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFR-01 | App performs atomic SQLite backups to iCloud Drive every 6 hours via launchd | Plist exists and references `run-backup.ts`; `createBackup` uses `db.backup()` (atomic); script creation fixes the broken flow |
| INFR-02 | App triggers SQLite backup after every SimpleFIN sync completion | `sync-service.ts` line 76 calls `createBackup(db)` after sync — already wired |
| INFR-03 | App retains 30 days of timestamped backup snapshots plus a latest copy | `pruneOldBackups` uses 30-day cutoff; `minerva_latest.db` maintained in `createBackup` — already wired |
| INFR-04 | All money values are stored as integers (cents) to avoid floating-point errors | Schema `001-initial-schema.sql` uses INTEGER for all money columns — already wired |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (project dep) | Open production DB for backup | Already used throughout project; synchronous API perfect for a script that runs and exits |
| tsx | (project dep) | Run TypeScript directly via `--import tsx` | Already configured in the plist; no build step needed |

### Supporting
No additional libraries needed. This phase uses only existing project dependencies.

## Architecture Patterns

### Pattern 1: Standalone Script Entry Point
**What:** A TypeScript file that runs as a standalone process, not imported by any other module.
**When to use:** When launchd or cron needs to execute a task.
**Example:**
```typescript
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import { createBackup } from './backup.js';

const DB_PATH = path.join(os.homedir(), 'minerva-money', 'data', 'minerva.db');

const db = new Database(DB_PATH, { readonly: false });
db.pragma('journal_mode = WAL');

try {
  const result = await createBackup(db);
  console.log(`Backup complete: ${result.path} (${result.sizeBytes} bytes)`);
} catch (error) {
  console.error('Backup failed:', error);
  process.exitCode = 1;
} finally {
  db.close();
}
```

**Key details:**
- Opens DB directly with `better-sqlite3`, NOT via `createDatabase()` (which runs migrations — inappropriate for a backup script)
- Sets WAL mode for safe concurrent reads during backup
- Uses `process.exitCode = 1` instead of `process.exit(1)` to allow finally block to run
- The `finally` block ensures DB is always closed

### Anti-Patterns to Avoid
- **Using `createDatabase()` for backup script:** Runs migrations, which could modify the DB during what should be a read-only backup operation
- **Forgetting to close the DB:** Leaves the process hanging since better-sqlite3 keeps the event loop alive
- **Using `process.exit(1)` in try block:** Skips the finally block, leaving DB connection open

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic backup | Manual file copy | `db.backup()` via better-sqlite3 | Native SQLite backup API handles WAL correctly |
| Integrity check | Custom validation | `PRAGMA integrity_check` | SQLite's built-in verification is authoritative |

## Common Pitfalls

### Pitfall 1: Running Migrations in Backup Script
**What goes wrong:** Using `createDatabase()` runs pending migrations, potentially modifying the database during backup.
**Why it happens:** `createDatabase()` is the standard way to get a DB handle in this project.
**How to avoid:** Open with `new Database(path)` directly, set WAL mode manually.

### Pitfall 2: Script Not Exiting
**What goes wrong:** The backup script completes but the Node process stays alive.
**Why it happens:** better-sqlite3 keeps a reference that prevents Node from exiting if the DB isn't closed.
**How to avoid:** Always close the DB in a `finally` block.

## Code Examples

### Existing createBackup signature
```typescript
// Source: packages/server/src/backup/backup.ts
export async function createBackup(
  db: Database.Database,
  backupDir?: string
): Promise<BackupResult>
```

### Plist reference path
```xml
<!-- Source: com.minerva.backup.plist -->
<string>/Users/seanspade/Documents/Source/minverva-money/packages/server/src/backup/run-backup.ts</string>
```

### INFR-02 evidence (sync-service.ts line 76)
```typescript
// Source: packages/server/src/sync/sync-service.ts
if (!options.skipBackup) {
  try {
    await createBackup(db);
  } catch {
    // Backup failure should not fail the sync
  }
}
```

### INFR-04 evidence (money columns in schema)
All money-value columns confirmed as INTEGER:
- `accounts.balance INTEGER NOT NULL DEFAULT 0`
- `transactions.amount INTEGER NOT NULL`
- `budget_allocations.amount INTEGER NOT NULL DEFAULT 0`
- `categorization_rules.amount_min INTEGER`
- `categorization_rules.amount_max INTEGER`
- `balance_snapshots.balance INTEGER NOT NULL`

## Open Questions

None. This phase is straightforward with all evidence already in the codebase.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/server/src/backup/backup.ts` — createBackup implementation
- Codebase inspection: `com.minerva.backup.plist` — launchd configuration
- Codebase inspection: `packages/server/src/sync/sync-service.ts` — INFR-02 wiring
- Codebase inspection: `packages/server/migrations/001-initial-schema.sql` — INFR-04 INTEGER columns
- Codebase inspection: `packages/server/src/db/connection.ts` — createDatabase() behavior (runs migrations)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing project dependencies
- Architecture: HIGH — simple script wrapping an existing function
- Pitfalls: HIGH — identified from direct code inspection

**Research date:** 2026-03-22
**Valid until:** Indefinite (no external dependencies)
