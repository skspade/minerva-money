# Phase 47: Database Foundation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Sync warnings can be persisted and queried without unbounded table growth. This phase creates a `sync_warnings` table via migration 007 with UPSERT-compatible schema (one active row per account), a foreign key to `sync_log` with CASCADE delete, and columns for tracking error history. No service code changes -- purely schema.

</domain>

<decisions>
## Implementation Decisions

### Migration File
- Migration file named `007-sync-warnings.sql` in `packages/server/migrations/` (follows existing naming convention: `NNN-descriptive-name.sql`)
- Migration number is 007 because the latest existing migration is `006-account-source.sql`
- The migration runner uses `user_version` pragma to track applied migrations -- version 7 will be set automatically by `migrate.ts`
- Migration must be pure DDL (CREATE TABLE) with no data backfill needed since the table is new

### Table Schema (SCHEMA-01)
- Table named `sync_warnings` with the following columns:
  - `id` INTEGER PRIMARY KEY AUTOINCREMENT
  - `sync_log_id` INTEGER NOT NULL (foreign key)
  - `account_id` TEXT NOT NULL
  - `account_name` TEXT NOT NULL
  - `error_code` TEXT NOT NULL
  - `message` TEXT NOT NULL
  - `first_seen` TEXT NOT NULL DEFAULT (datetime('now'))
  - `last_seen` TEXT NOT NULL DEFAULT (datetime('now'))
  - `occurrence_count` INTEGER NOT NULL DEFAULT 1
- All datetime columns use TEXT type with `datetime('now')` default, matching the `sync_log.started_at` pattern from the initial schema
- `account_name` stored denormalized because SimpleFIN account names are the display value and the accounts table may not have the account yet if it failed to sync (Claude's Decision: avoids join failure for accounts that exist in SimpleFIN but not locally)

### Foreign Key (SCHEMA-02)
- `FOREIGN KEY (sync_log_id) REFERENCES sync_log(id) ON DELETE CASCADE`
- CASCADE delete ensures warnings are cleaned up when old sync_log entries are purged
- Foreign keys are already enabled globally via `PRAGMA foreign_keys = ON` in `packages/server/src/db/connection.ts`

### UNIQUE Constraint for UPSERT
- `UNIQUE(account_id)` constraint on the table enabling `INSERT ... ON CONFLICT(account_id) DO UPDATE` in Phase 48
- One active warning row per account -- not append-only, which prevents unbounded growth
- On UPSERT, `last_seen` and `occurrence_count` will be updated (Phase 48 concern, but the schema must support it)

### Claude's Discretion
- Exact column ordering within the CREATE TABLE statement
- Whether to add a SQL comment at the top of the migration file
- Index strategy beyond the UNIQUE constraint (likely unnecessary at current scale)

</decisions>

<specifics>
## Specific Ideas

- The `error_code` column stores SimpleFIN error codes (there are 7 known codes per REQUIREMENTS.md out-of-scope notes) as TEXT, not an enum -- SQLite has no enum type and TEXT is more flexible for future codes
- The `sync_log_id` points to the most recent sync run that observed the error, updated on each UPSERT -- this gives temporal context for when the warning was last confirmed
- The success criteria explicitly require migration 007 to work on both fresh databases (all migrations run sequentially) and existing databases (only 007 runs) -- the migration runner already handles this via `user_version` comparison

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/db/migrate.ts`: Migration runner that reads SQL files from `migrations/`, applies them in order using `user_version` pragma, and wraps each in a transaction. No changes needed -- adding `007-sync-warnings.sql` is sufficient.
- `packages/server/src/db/migrate.test.ts`: Tests for the migration runner including idempotency and incremental application. Also tests initial schema table creation -- pattern to follow for verifying the new table.

### Established Patterns
- All migrations are single `.sql` files with pure SQL (no TypeScript migration scripts)
- Migration numbering uses zero-padded 3-digit prefix: `001`, `002`, ..., `006`
- Each migration runs inside a transaction via `db.transaction()` in the runner
- Datetime columns use TEXT type with `datetime('now')` defaults (e.g., `sync_log.started_at`)
- Foreign keys use `ON DELETE CASCADE` where parent deletion should cascade (not currently used in existing schema, but standard SQLite pattern)
- The `sync_log` table has `id INTEGER PRIMARY KEY AUTOINCREMENT` -- the foreign key target

### Integration Points
- `packages/server/src/db/connection.ts`: Database connection setup with `PRAGMA foreign_keys = ON` -- CASCADE deletes will work without additional configuration
- `packages/server/src/sync/sync-service.ts`: Will consume this table in Phase 48 to write warnings during sync
- `packages/server/src/sync/trpc-router.ts`: Will query this table in Phase 49 to return warnings to the client
- `packages/server/src/agent/tools/query-tools.ts`: Will query this table in Phase 52 for agent sync status

</code_context>

<deferred>
## Deferred Ideas

- UPSERT logic and warning writes -- Phase 48 (Sync Service Warning Pipeline)
- Warning query and tRPC response extension -- Phase 49
- Indexes on `sync_log_id` or `last_seen` -- unnecessary at current scale (3 institutions, ~10 accounts), can add later if query performance degrades
- Pruning old sync_log entries (and cascading warning deletes) -- no current requirement, sync_log growth is bounded by twice-daily syncs

</deferred>

---

*Phase: 47-database-foundation*
*Context gathered: 2026-03-26 via auto-context*
