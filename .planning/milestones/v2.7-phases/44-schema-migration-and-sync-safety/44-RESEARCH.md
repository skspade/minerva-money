# Phase 44: Schema Migration and Sync Safety - Research

**Researched:** 2026-03-25
**Domain:** SQLite schema migration, tRPC query updates, sync pipeline isolation
**Confidence:** HIGH

## Summary

Phase 44 is a straightforward schema migration plus targeted query modifications. The codebase already has a well-established migration system (`user_version` pragma, sequential SQL files). The accounts table needs a `source` column added via `ALTER TABLE`, three SQL queries in the tRPC router need updating (sync trigger, accounts.list, sync.status), and the agent's `get_account_balances` query should also include `source`.

**Primary recommendation:** Single plan with one wave -- migration file + query updates + tests. The scope is small, well-isolated, and has no external dependencies.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Migration file `006-account-source.sql` with `ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin'`
- Existing accounts get `source = 'simplefin'` via DEFAULT clause -- no backfill needed
- Manual account IDs use `manual_` prefix + UUID v4
- No schema constraint for prefix -- service-layer enforcement in Phase 45
- Sync trigger pre-flight rate-limit check must filter to `source = 'simplefin'`
- `runSync` function does NOT need changes (iterates SimpleFIN response, not local DB)
- Sync scheduler does NOT need changes
- Rate limiter operates on IDs passed to it, no DB queries
- `accounts.list` must include `source` in SELECT and return type
- `sync.status` must include `source` for consistency

### Claude's Discretion
- Exact UUID generation approach -- deferred to Phase 45
- Whether to add index on `source` column -- table is small
- Exact migration file naming

### Deferred Ideas (OUT OF SCOPE)
- Account CRUD service -- Phase 45
- Import wizard integration -- Phase 46
- Dashboard visual distinction -- Phase 46
- Agent tools for account creation -- Phase 46
- Index on source column
- CHECK constraint on source values
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | Database has `source` column distinguishing manual from synced accounts | Migration file 006 adds column with DEFAULT |
| SCHEMA-02 | Existing accounts default to `source = 'simplefin'` after migration | `DEFAULT 'simplefin'` clause handles this automatically |
| SCHEMA-03 | Manual account IDs use `manual_` prefix + UUID | Convention documented; enforcement deferred to Phase 45 service layer |
| SCHEMA-04 | Sync trigger and rate-limit check filter to `source = 'simplefin'` only | Add WHERE clause to line 60 of trpc-router.ts |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | current | SQLite driver | Already used throughout project |
| vitest | current | Test framework | Already configured in project |

### Supporting
No new libraries needed. This phase modifies existing code only.

## Architecture Patterns

### Migration Pattern (established)
```
packages/server/migrations/NNN-description.sql
```
- Files sorted alphabetically, version extracted from `NNN-` prefix
- `user_version` pragma tracks applied migrations
- Each migration wrapped in a transaction
- `ALTER TABLE` is the correct SQLite approach for adding columns

### tRPC Router Pattern (established)
```typescript
// Snake_case DB columns -> camelCase response properties
const accounts = ctx.db.prepare('SELECT col_name FROM table').all() as { col_name: type }[];
return accounts.map(a => ({ colName: a.col_name }));
```

### Test Pattern (established)
```typescript
// Tests use temporary directory with real SQLite DB + migrations
const tmpDir = mkdtempSync(join(tmpdir(), 'minerva-test-'));
const db = createDatabase(join(tmpDir, 'test.db'));
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration tracking | Version tracking system | `user_version` pragma (already exists) | Battle-tested, atomic |

## Common Pitfalls

### Pitfall 1: SQLite ALTER TABLE Limitations
**What goes wrong:** Trying to add CHECK constraints or complex defaults via ALTER TABLE
**Why it happens:** SQLite ALTER TABLE only supports ADD COLUMN with limited constraint types
**How to avoid:** Use `NOT NULL DEFAULT 'simplefin'` -- this is supported. Do NOT add CHECK constraints.
**Warning signs:** Error "Cannot add a column with non-constant default"

### Pitfall 2: Sync Trigger Query Scope
**What goes wrong:** Missing the sync.status query when adding source, or missing the agent query-tools
**Why it happens:** Multiple queries reference the accounts table across different files
**How to avoid:** Update ALL account queries: sync.trigger (line 60), accounts.list (line 119-120), sync.status (line 93-94), and agent query-tools (line 20)
**Warning signs:** `source` field missing from some API responses

### Pitfall 3: TypeScript Type Alignment
**What goes wrong:** Adding `source` to SQL but not the TypeScript type assertion
**Why it happens:** Raw SQL queries use `as` type assertions that must match query columns
**How to avoid:** Update both the SQL SELECT and the TypeScript `as { ... }` type in every modified query

## Code Examples

### Migration SQL
```sql
-- 006-account-source.sql
ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin';
```

### Sync Trigger Filter (trpc-router.ts line 60)
```typescript
// Before:
const accounts = ctx.db.prepare('SELECT id, name FROM accounts').all()

// After:
const accounts = ctx.db.prepare("SELECT id, name FROM accounts WHERE source = 'simplefin'").all()
```

### Accounts List Update (trpc-router.ts line 119-120)
```typescript
// Before:
'SELECT id, name, institution, type, balance, last_synced FROM accounts ORDER BY type ASC, name ASC'

// After:
'SELECT id, name, institution, type, balance, last_synced, source FROM accounts ORDER BY type ASC, name ASC'
```

### Sync Status Update (trpc-router.ts line 93-94)
```typescript
// Before:
'SELECT id, name, balance, last_synced FROM accounts'

// After:
'SELECT id, name, balance, last_synced, source FROM accounts'
```

## Codebase Findings

### Files to Modify
1. **`packages/server/migrations/006-account-source.sql`** (NEW) -- migration file
2. **`packages/server/src/sync/trpc-router.ts`** -- 3 queries (sync.trigger, accounts.list, sync.status)
3. **`packages/server/src/agent/tools/query-tools.ts`** -- `get_account_balances` query (add `source`)

### Files NOT to Modify (confirmed)
- `sync-service.ts` -- iterates SimpleFIN API response, not local DB
- `sync-scheduler.ts` -- calls runSync with SimpleFIN client
- `rate-limiter.ts` -- operates on passed IDs, no DB queries
- `connection.ts` -- auto-applies migrations, no changes needed
- `migrate.ts` -- migration runner is generic, no changes needed

### Existing Test Infrastructure
- `packages/server/src/sync/sync-service.test.ts` -- 8 existing tests for sync
- Tests use `createDatabase()` which auto-runs migrations on a temp DB
- New migration will be applied automatically in test DBs

### Agent Query Note
- `query-tools.ts` line 20 references `available_balance` which doesn't exist in schema (pre-existing issue, not Phase 44 scope)
- Adding `source` to this query is good practice for consistency

## Open Questions

None -- the scope is fully defined by CONTEXT.md and the codebase examination confirms all assumptions.

## Sources

### Primary (HIGH confidence)
- Direct codebase examination of all referenced files
- SQLite documentation on ALTER TABLE ADD COLUMN (well-known stable behavior)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing codebase, no new dependencies
- Architecture: HIGH - following established migration and query patterns
- Pitfalls: HIGH - direct codebase inspection confirms exact line numbers

**Research date:** 2026-03-25
**Valid until:** Indefinite (internal codebase patterns)
