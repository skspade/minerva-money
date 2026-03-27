# Phase 49: tRPC Response Extension - Research

**Researched:** 2026-03-26
**Status:** Complete

## Phase Goal

Extend the `sync.status` tRPC query to include a `warnings` array from the `sync_warnings` table, so downstream phases (50-52) can consume structured per-account warnings.

## Existing Code Analysis

### sync.status Handler (trpc-router.ts:80-119)

The handler currently:
1. Queries `sync_log` for the latest entry (`.get()` with `as` cast)
2. Queries `sync_log` for error count (`.get()` with `as` cast)
3. Queries `accounts` table (`.all()` with `as` cast)
4. Returns `{ lastSync, errorCount, accounts }` with snake_case-to-camelCase mapping

Pattern: All queries are inline `ctx.db.prepare(SQL).get/all()` with TypeScript `as` casts. No service layer, no Zod output schemas.

### sync_warnings Table (migration 007)

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

Key: UNIQUE(account_id) means at most one active warning per account. Phase 48 auto-clears resolved warnings, so this table only contains current issues.

## Implementation Approach

### Single Change Point

Add one query + one field to the return object in the `sync.status` handler:

1. **Query**: `SELECT account_id, account_name, error_code, message, last_seen FROM sync_warnings ORDER BY last_seen DESC`
2. **Map**: snake_case columns to camelCase (`account_id` -> `accountId`, etc.)
3. **Return**: Add `warnings` array to the existing return object

### Column Selection

API-01 requires exactly 5 fields: `accountId`, `accountName`, `errorCode`, `message`, `lastSeen`. The table also has `id`, `sync_log_id`, `first_seen`, `occurrence_count` -- these are NOT needed in the response per the requirement.

### Empty Array Guarantee

When no warnings exist, `db.prepare().all()` returns `[]`, which naturally satisfies the requirement for an empty array (no null, no omission).

### Type Safety

Use inline `as` cast matching existing pattern:
```typescript
const warnings = ctx.db.prepare(...).all() as {
  account_id: string;
  account_name: string;
  error_code: string;
  message: string;
  last_seen: string;
}[];
```

## Testing Strategy

### What to Test

1. **Warnings returned**: Insert sync_warnings rows, call sync.status, verify warnings array shape
2. **Empty array**: No warnings in table, verify `warnings: []` in response
3. **Field mapping**: Verify snake_case-to-camelCase conversion
4. **Ordering**: Multiple warnings returned in last_seen DESC order
5. **Existing fields unchanged**: lastSync, errorCount, accounts still present and correct

### Test Approach

Use the same pattern as existing sync tests -- in-memory SQLite with migrations applied, direct handler invocation via tRPC caller.

### Test Budget

- Estimated: 3-5 tests for this phase
- Budget: 50 per phase, currently 0 used
- Well within budget

## Risk Assessment

**Low risk phase.** Single file modification, additive-only change, well-established pattern to follow. No breaking changes to existing response shape.

## RESEARCH COMPLETE
