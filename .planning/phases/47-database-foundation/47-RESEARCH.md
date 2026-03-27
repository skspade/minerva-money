# Phase 47: Database Foundation - Research

**Researched:** 2026-03-26
**Domain:** SQLite migration / DDL
**Confidence:** HIGH

## Summary

Phase 47 adds a single SQL migration file (`007-sync-warnings.sql`) that creates the `sync_warnings` table. The project's migration infrastructure is mature and well-tested -- the migration runner reads `.sql` files from `packages/server/migrations/`, applies them in version order using `user_version` pragma, and wraps each in a transaction.

The schema is fully specified in CONTEXT.md with locked decisions for all columns, types, foreign key, and UNIQUE constraint. No library research is needed -- this is pure SQLite DDL using established project patterns.

**Primary recommendation:** Write a single `007-sync-warnings.sql` migration file following the exact patterns from `001-initial-schema.sql` (datetime defaults, INTEGER PRIMARY KEY AUTOINCREMENT, foreign key syntax).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Migration file named `007-sync-warnings.sql` in `packages/server/migrations/`
- Migration number is 007 (latest existing is `006-account-source.sql`)
- Migration runner uses `user_version` pragma -- version 7 set automatically by `migrate.ts`
- Migration must be pure DDL (CREATE TABLE) with no data backfill
- Table named `sync_warnings` with columns: id, sync_log_id, account_id, account_name, error_code, message, first_seen, last_seen, occurrence_count
- All datetime columns use TEXT type with `datetime('now')` default
- `account_name` stored denormalized (avoids join failure for accounts not yet synced locally)
- `FOREIGN KEY (sync_log_id) REFERENCES sync_log(id) ON DELETE CASCADE`
- `UNIQUE(account_id)` constraint enabling UPSERT pattern
- Foreign keys already enabled globally via `PRAGMA foreign_keys = ON` in connection.ts

### Claude's Discretion
- Exact column ordering within CREATE TABLE
- Whether to add a SQL comment at the top of the migration file
- Index strategy beyond the UNIQUE constraint

### Deferred Ideas (OUT OF SCOPE)
- UPSERT logic and warning writes (Phase 48)
- Warning query and tRPC response extension (Phase 49)
- Additional indexes on sync_log_id or last_seen
- Pruning old sync_log entries
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | sync_warnings table persists per-account errors with account_id, account_name, error_code, message, first_seen, last_seen, and occurrence_count | Column types and defaults verified against existing schema patterns in 001-initial-schema.sql |
| SCHEMA-02 | sync_warnings rows are linked to sync_log entries via foreign key | CASCADE delete pattern verified; foreign keys enabled in connection.ts |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (project dep) | SQLite driver | Already in use; migration runner uses it |
| SQLite | WAL mode | Database engine | Project standard |

No new dependencies needed. This phase is pure SQL.

## Architecture Patterns

### Migration File Pattern
All migrations follow the same structure:
- File: `NNN-descriptive-name.sql` in `packages/server/migrations/`
- Content: Pure SQL statements (no TypeScript)
- Applied by `migrate.ts` inside a transaction via `db.transaction()`
- Version tracked via `PRAGMA user_version`

### Existing Schema Conventions (from 001-initial-schema.sql)
```sql
-- INTEGER PRIMARY KEY AUTOINCREMENT for auto-increment IDs
-- TEXT NOT NULL for required strings
-- TEXT NOT NULL DEFAULT (datetime('now')) for timestamps
-- REFERENCES table(id) ON DELETE CASCADE for foreign keys
-- UNIQUE(col) for uniqueness constraints
```

### sync_log Table (foreign key target)
```sql
CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  accounts_synced INTEGER NOT NULL DEFAULT 0,
  transactions_added INTEGER NOT NULL DEFAULT 0
);
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration ordering | Custom version tracking | Existing `migrate.ts` with `user_version` | Already handles incremental application, idempotency, transactions |

## Common Pitfalls

### Pitfall 1: Missing AUTOINCREMENT on SQLite primary key
**What goes wrong:** Without AUTOINCREMENT, SQLite reuses deleted row IDs
**Why it happens:** `INTEGER PRIMARY KEY` alone allows ID reuse
**How to avoid:** Always use `INTEGER PRIMARY KEY AUTOINCREMENT` (matches project convention)

### Pitfall 2: Forgetting ON DELETE CASCADE
**What goes wrong:** Orphaned sync_warnings rows when sync_log entries are deleted
**Why it happens:** SQLite defaults to ON DELETE NO ACTION
**How to avoid:** Explicitly specify `ON DELETE CASCADE` on the foreign key

### Pitfall 3: UNIQUE constraint on wrong column
**What goes wrong:** Multiple active warnings per account, causing unbounded growth
**Why it happens:** Might put UNIQUE on (account_id, error_code) instead of just (account_id)
**How to avoid:** UNIQUE(account_id) only -- one active warning row per account, as specified in CONTEXT.md

## Code Examples

### Migration SQL (verified pattern from existing schema)
```sql
CREATE TABLE sync_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_log_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (sync_log_id) REFERENCES sync_log(id) ON DELETE CASCADE,
  UNIQUE(account_id)
);
```

### Test Pattern (from migrate.test.ts)
```typescript
// Apply all migrations including 007 to an in-memory DB
// Verify sync_warnings table exists
// Verify column types and constraints
// Verify foreign key works (insert requires valid sync_log_id)
// Verify UNIQUE constraint on account_id
```

## Open Questions

None -- the schema is fully specified in CONTEXT.md and all patterns are established in the codebase.

## Sources

### Primary (HIGH confidence)
- `packages/server/migrations/001-initial-schema.sql` - Schema conventions, column types, FK syntax
- `packages/server/migrations/006-account-source.sql` - Latest migration (confirms 007 is next)
- `packages/server/src/db/migrate.ts` - Migration runner implementation
- `packages/server/src/db/migrate.test.ts` - Test patterns for migration verification
- `packages/server/src/db/connection.ts` - Foreign keys pragma confirmation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using existing project infrastructure only
- Architecture: HIGH - following established migration patterns verbatim
- Pitfalls: HIGH - SQLite DDL pitfalls are well-documented

**Research date:** 2026-03-26
**Valid until:** Indefinite (SQLite DDL is stable)
