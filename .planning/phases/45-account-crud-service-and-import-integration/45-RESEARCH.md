# Phase 45: Account CRUD Service and Import Integration - Research

**Researched:** 2026-03-25
**Status:** Complete

## Codebase Analysis

### Existing Account Infrastructure

The accounts table schema (001-initial-schema.sql) has: `id TEXT PRIMARY KEY`, `name`, `institution`, `type`, `subtype`, `balance INTEGER`, `currency`, `last_synced`, `simplefin_id TEXT UNIQUE`, timestamps. Migration 006 added `source TEXT NOT NULL DEFAULT 'simplefin'`.

The `accountsRouter` in trpc-router.ts (line 153) currently has only a `list` query that returns `id, name, institution, type, balance, last_synced, source`. New mutations (`create`, `update`, `delete`) will be added here.

### Cascade Chain (Verified)

Deleting an account triggers:
1. `transactions.account_id REFERENCES accounts(id) ON DELETE CASCADE` -- all transactions removed
2. `transfer_links.transaction_a_id/transaction_b_id REFERENCES transactions(id) ON DELETE CASCADE` -- transfer links removed
3. `balance_snapshots.account_id REFERENCES accounts(id) ON DELETE CASCADE` -- snapshots removed
4. `transaction_splits` (from 002-transaction-splits.sql) also cascades via `transaction_id REFERENCES transactions(id) ON DELETE CASCADE`

No manual cleanup needed -- SQLite FK cascades handle everything.

### Balance Snapshot Pattern (from sync-service.ts lines 133-138)

```typescript
const today = new Date().toISOString().split('T')[0];
db.prepare(`
  INSERT OR REPLACE INTO balance_snapshots (account_id, date, balance)
  VALUES (?, ?, ?)
`).run(accountId, today, balance);
```

This pattern should be replicated in `recalculateBalance()`.

### Import Service Integration Point (import-service.ts lines 370-441)

`executeImport()` runs inside `db.transaction()`. After transfer detection (line 437), the `recalculateBalance()` call should be inserted. The `accountMappings` parameter is `Record<string, string>` mapping CSV account names to account IDs -- we need to collect unique account IDs from this map, check which are manual, and recalculate those.

Key detail: `recalculateBalance` must run INSIDE the existing `db.transaction()` block (line 371) to satisfy success criteria 5 (atomicity). The function should NOT open its own transaction.

### Test Patterns (from import-service.test.ts)

Tests use:
- `import { createDatabase } from '../db/connection.js'` for in-memory SQLite with migrations
- `beforeEach`/`afterEach` for setup/teardown with temp directories
- `tmpdir()`, `mkdtempSync()`, `rmSync()` for temp DB files

### tRPC Router Pattern

All routers follow: `publicProcedure.input(z.object({...})).mutation(({ ctx, input }) => { ... })`. Service functions accept `db: Database.Database` as first param. The router delegates to the service.

### Account Type Constraints

Per REQUIREMENTS.md out-of-scope: "Manual investment accounts" -- so allowed types for manual accounts are `'banking'` and `'credit'` only. The Zod schema should use `z.enum(['banking', 'credit'])`.

### ID Generation

Per CONTEXT.md: `manual_${crypto.randomUUID()}` prefix. The `randomUUID` is already imported from `node:crypto` in import-service.ts -- same import pattern.

## Integration Risk Assessment

**Low risk:**
- New service file in new directory -- no conflicts with existing code
- `accountsRouter` extension adds mutations to existing router -- additive change
- FK cascades handle deletion -- no custom cleanup logic

**Medium risk:**
- Import service modification -- must insert `recalculateBalance` in the right place within the transaction block
- Must ensure `recalculateBalance` doesn't open its own transaction (nested transactions aren't supported in SQLite the same way)

## Key Implementation Notes

1. `recalculateBalance` should be a plain function (not wrapped in `db.transaction()`) since it will be called both standalone and inside `executeImport`'s transaction
2. When called standalone (future use from tRPC), it can be wrapped in a transaction at the caller level
3. The import integration should collect unique manual account IDs from `accountMappings`, then call `recalculateBalance` for each after the post-insert hooks

---

*Phase: 45-account-crud-service-and-import-integration*
*Research completed: 2026-03-25*
