# Phase 26: Import Service and API - Research

**Completed:** 2026-03-24
**Status:** Ready for planning

## Codebase Analysis

### Transaction Table Schema
The `transactions` table (`migrations/001-initial-schema.sql`) has columns:
- `id` TEXT PRIMARY KEY
- `account_id` TEXT NOT NULL (FK to accounts)
- `date` TEXT NOT NULL
- `amount` INTEGER NOT NULL (cents)
- `pending` INTEGER NOT NULL DEFAULT 0
- `payee` TEXT (nullable)
- `memo` TEXT (nullable)
- `category_id` INTEGER (FK to categories, nullable)
- `dedup_hash` TEXT (unique index, partial — WHERE dedup_hash IS NOT NULL)
- `rule_id` INTEGER (FK to categorization_rules, added in migration 003)
- `created_at`, `updated_at` TEXT defaults

Key constraint: `CREATE UNIQUE INDEX idx_transactions_dedup_hash ON transactions(dedup_hash) WHERE dedup_hash IS NOT NULL` — this enables INSERT OR IGNORE for dedup.

### Sync Service Pattern (sync-service.ts lines 92-141)
The exact pattern to replicate for import:
1. `db.transaction(() => { ... })()` wrapping
2. Prepare `INSERT OR IGNORE INTO transactions` statement outside loop
3. Loop rows, call `stmt.run(...)`, check `info.changes > 0` to track additions
4. Collect `newTransactionIds` array for post-insert hooks
5. Call `categorizeNewTransactions(db, newTransactionIds)` then `detectTransferCandidates(db, newTransactionIds)`

### Dedup Hash Function (simplefin-client.ts:62-65)
```typescript
export function generateDedupHash(accountId: string, date: string, amount: number, payee: string): string {
  const input = `${accountId}|${date}|${amount}|${payee}`;
  return createHash('sha256').update(input).digest('hex');
}
```
Already exported. Takes accountId (Minerva account ID), date (YYYY-MM-DD), amount (cents integer), payee (string). Import must use the **mapped Minerva account ID** (not the CSV account name) for hash alignment with synced transactions.

### Rules Service Integration (rules-service.ts:285+)
`categorizeNewTransactions(db, transactionIds: string[])` — exported, accepts array of transaction IDs. Sets `category_id` and `rule_id` on matching transactions. Already handles the "most specific rule wins" logic internally.

### Transfer Detection (transfer-service.ts:41+)
`detectTransferCandidates(db, transactionIds: string[], dateWindowDays?: number)` — exported, finds offsetting pairs across accounts within a date window. Returns count of pairs found.

### toCents (shared/types.ts:3-5)
`toCents(dollars: number): Cents` — `Math.round(dollars * 100)` with branded type. Already used by simplefin-client for the same purpose.

### tRPC Router Structure (trpc-router.ts)
- `appRouter` at line 443 composes 9 nested routers
- Uses `router` and `publicProcedure` from `./trpc.js`
- Context provides `{ db, rateLimiter, client }` — import router only needs `db`
- All routers defined in the same file or imported — import router should be in its own file and imported

### Express Body Limit (index.ts:18)
Currently `app.use(express.json())` with no limit option — defaults to 100KB. Must change to `app.use(express.json({ limit: '10mb' }))`.

### Test Pattern (sync-service.test.ts)
- Uses `createDatabase(path)` with temp directory for isolated test DB
- `beforeEach`/`afterEach` pattern with `mkdtempSync`/`rmSync`
- Direct SQL queries to verify data: `db.prepare('SELECT ...').all()`
- Vitest `describe`/`it`/`expect` imports

### Account and Category Tables
For auto-matching in preview:
- `accounts` table has `id` TEXT PRIMARY KEY and `name` TEXT
- `categories` table has `id` INTEGER PRIMARY KEY, `name` TEXT, `group_id` INTEGER

## Dependencies

### New Dependency: csv-parse
- Package: `csv-parse` ^5.6.0 (install in server workspace only)
- Import: `import { parse } from 'csv-parse/sync';`
- ESM-compatible, sync API avoids async complexity for parsing

### Existing Dependencies Used
- `crypto` (Node built-in) — via `generateDedupHash`
- `@minerva/shared` — `toCents`
- `better-sqlite3` — database operations
- `@trpc/server` — router definition
- `zod` — input validation

## Key Design Decisions Confirmed

1. **Stateless preview/execute**: Client sends full CSV text on both calls; server re-parses on execute (no server-side session state)
2. **Two mutations**: `import.preview` and `import.execute` — both are mutations because CSV text in POST body
3. **Category priority**: Rules engine first (sets category_id + rule_id), CSV-mapped categories as fallback (sets category_id only, leaves rule_id NULL)
4. **Transaction IDs**: `crypto.randomUUID()` — matches manual transaction pattern
5. **Payee field**: Use "Original Statement" column; fall back to "Merchant" when empty
6. **Account mapping required**: Execute rejects if any CSV account is unmapped
7. **Category mapping optional**: Unmapped categories default to NULL (uncategorized)

## Risk Assessment

1. **csv-parse ESM compatibility** — Low risk: csv-parse v5 has full ESM support with `csv-parse/sync` subpath export
2. **Date parsing edge cases** — Medium risk: must handle both `YYYY-MM-DD` and `M/D/YYYY` formats reliably. Regex-based parser avoids `new Date()` timezone issues
3. **Dedup hash alignment** — Medium risk: hash must use mapped Minerva account ID + "Original Statement" as payee to match SimpleFIN-synced transaction hashes. Misalignment would cause false "new" counts in preview
4. **Large CSV performance** — Low risk: 10K rows is well within SQLite's single-transaction capability; csv-parse sync API handles this size trivially

## File Impact Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/import/import-service.ts` | Create | Business logic: parse, validate, transform, preview, execute |
| `packages/server/src/import/import-router.ts` | Create | tRPC router with preview and execute mutations |
| `packages/server/src/import/import-service.test.ts` | Create | Unit tests for import service |
| `packages/server/src/sync/trpc-router.ts` | Modify | Add `import: importRouter` to appRouter |
| `packages/server/src/index.ts` | Modify | Set express.json limit to 10mb |
| `packages/server/package.json` | Modify | Add csv-parse dependency |

---
*Phase: 26-import-service-and-api*
*Research completed: 2026-03-24*
