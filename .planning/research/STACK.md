# Stack Research

**Domain:** Manual Account CRUD + CSV Import Integration (Minerva Money v2.7)
**Researched:** 2026-03-25
**Confidence:** HIGH

## Core Finding: Zero New Dependencies Required

Manual account CRUD, schema migration, UUID generation, and balance recalculation all use capabilities already present in the codebase. No new npm packages are needed.

---

## Recommended Stack

### Core Technologies (All Existing)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `node:crypto` `randomUUID()` | Node 22 built-in | Generate `manual_<uuid>` account IDs | Already used in `import-service.ts` (line 390) and `category-service.ts` (line 142). Same pattern: `import { randomUUID } from 'node:crypto'`. Zero-cost, no library required. |
| better-sqlite3 `ALTER TABLE` | ^11.7.0 (existing) | Schema migration via `006-manual-accounts.sql` | The existing migration runner in `migrate.ts` reads numbered SQL files in sequence and applies them transactionally. Adding `ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin'` as `006-manual-accounts.sql` follows the established pattern exactly. |
| better-sqlite3 `db.prepare().run()` | ^11.7.0 (existing) | Balance recalculation via `SUM(amount)` | Balance computation is `SELECT SUM(amount) FROM transactions WHERE account_id = ?`. The result updates `accounts.balance`. Same pattern used throughout `sync-service.ts` and `import-service.ts`. |
| tRPC mutations | ^11.14.1 (existing) | `accounts.create`, `accounts.update`, `accounts.delete` router additions | New mutations added to the existing `accountsRouter`. Input validated with Zod schemas. Pattern is identical to the existing `categories.create` and `rules.create` mutations. |
| Zod | ^4.3.6 (existing) | Input validation for account CRUD mutations | Already used for all tRPC input validation. New schemas: `createAccountInput`, `updateAccountInput`, `deleteAccountInput`. |

### Supporting Libraries (All Existing)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Query (client) | existing | Cache invalidation after account creation | `trpc.useUtils().accounts.invalidate()` after `accounts.create` mutation completes — same pattern as category creation. |
| React `useState` | 19.x (existing) | Inline account creation form state in CSV import wizard | The "+ Create New Account" inline form in `ImportPage` step 2 needs local state for `name`, `institution`, `type` fields and a `creating` boolean. No form library needed. |

---

## Schema Migration: `006-manual-accounts.sql`

The only schema change is one `ALTER TABLE` statement. SQLite's `ALTER TABLE ... ADD COLUMN` is supported and safe — it adds the column with a default value without a table rewrite.

```sql
-- 006-manual-accounts.sql
ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin';
```

**Why `DEFAULT 'simplefin'`:** All existing accounts are SimpleFIN-synced. The default backfills existing rows correctly. Manual accounts are created with explicit `source = 'manual'`.

**Why NOT a separate `is_manual` boolean:** A `source` text column is more extensible (future sources like `plaid` or `manual-crypto`) and matches the design spec. The tradeoff is that queries use `WHERE source = 'manual'` instead of `WHERE is_manual = 1` — negligible difference for SQLite.

**Migration runner compatibility:** The existing `migrate.ts` reads files sorted by name. File `006-manual-accounts.sql` will be applied after `005-budget-funding-step.sql` (current user_version = 5). The runner sets `PRAGMA user_version = 6` after applying it. Verified in `migrate.ts` lines 8-23.

---

## UUID Generation Pattern

Use `node:crypto` `randomUUID()` with a `manual_` prefix to namespace manual account IDs:

```typescript
import { randomUUID } from 'node:crypto';

const id = `manual_${randomUUID()}`;
// e.g. "manual_f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

**Why the prefix:** SimpleFIN IDs are opaque strings. The `manual_` prefix guarantees no collision and makes the source visually identifiable in logs. The `accounts.id` column is `TEXT PRIMARY KEY` with no format constraint — the prefix is valid.

**Why NOT the `uuid` npm package:** `crypto.randomUUID()` is available in Node 15+, is cryptographically secure, and requires no import of third-party code. The codebase already uses it in two places.

---

## Balance Recalculation

Balance for manual accounts is computed from the transaction sum. No external source of truth exists.

```sql
SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ?
```

**Why `COALESCE(SUM(...), 0)`:** `SUM` returns `NULL` for empty result sets. `COALESCE` ensures the balance is 0 (integer cents) for accounts with no transactions.

**When to call:** After each `executeImport()` call, for every manual account that received transactions in that import batch. The import service already tracks `accountId` per row — filter for `source = 'manual'` accounts in that set and call `recalculateBalance()` for each.

**Balance snapshot:** The daily snapshot job reads `accounts.balance` column directly. After `recalculateBalance()` updates the column, the next snapshot captures it automatically — no changes to the snapshot scheduler needed.

---

## Service Module Structure

New service at `packages/server/src/accounts/accounts-service.ts`. This follows the established per-feature module pattern (`sync/`, `categories/`, `rules/`, `budget/`, etc.).

```
packages/server/src/accounts/
  accounts-service.ts    # createAccount, updateAccount, deleteAccount, recalculateBalance
  accounts-router.ts     # tRPC mutations wiring to service functions
```

The tRPC router is added to the main router at `packages/server/src/sync/trpc-router.ts` (which already aggregates all sub-routers).

---

## Agent Tool Integration

The `create_account` agent tool wraps `accounts.create()`. It follows the existing confirmation flow pattern used by budget mutations:

- Parameters: `name: string`, `institution: string`, `type: string` (default `'banking'`)
- Requires confirmation (like `set_budget_amount`)
- The existing `list_accounts` tool needs the `source` field added to its response shape so the agent can distinguish manual vs synced accounts

No new SDK integration patterns needed — this is identical to the existing `create_category` tool added in v2.5.

---

## Import Wizard Integration

The inline account creation form in `ImportPage` (step 2) needs:

1. A `"+ Create New Account"` sentinel option in the mapping dropdown (mirrors the existing `"__skip__"` sentinel pattern from v2.4)
2. A conditional inline form rendered below the dropdown when that option is selected
3. A call to the `accounts.create` tRPC mutation
4. On success: add the new account to the local dropdown options and auto-select it

**State management:** Local `useState` in the mapping component. No global state needed — the created account is immediately available via the tRPC mutation response and can be inserted into the local options array.

**Pattern reference:** The `"__skip__"` sentinel in `ImportPage` (v2.4) shows the exact pattern for special dropdown values. The new sentinel can be `"__create__"`.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `node:crypto` `randomUUID()` | `uuid` npm package | Unnecessary dependency. `crypto.randomUUID()` is built-in, already used in the codebase, and cryptographically equivalent. |
| `ALTER TABLE ADD COLUMN` migration | New migration with table rebuild | SQLite ALTER TABLE ADD COLUMN is safe and non-destructive. A full table rebuild (CREATE new + INSERT SELECT + DROP old) would be needed only for column type changes or adding NOT NULL without a default — neither applies here. |
| `source TEXT DEFAULT 'simplefin'` | `is_manual INTEGER DEFAULT 0` | Text enum is more extensible and self-documenting. Adds no query complexity for SQLite. |
| Separate `accounts-service.ts` module | Adding to `sync-service.ts` | `sync-service.ts` is already large and focused on SimpleFIN sync. CRUD for manual accounts is a distinct concern. The existing module-per-feature pattern (`categories/`, `rules/`, etc.) is consistent. |
| Local `useState` for inline form | Form library (react-hook-form) | Three fields, no complex validation. The existing codebase uses zero form libraries. Consistent with how all other forms are implemented. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `uuid` npm package | Already have `crypto.randomUUID()` built-in, used in 2 existing files | `import { randomUUID } from 'node:crypto'` |
| `drizzle-orm` or `knex` for migrations | The custom migration runner is minimal, tested, and sufficient for this schema change | Add `006-manual-accounts.sql` to `/migrations/` |
| `react-hook-form` or `formik` | Three-field inline form doesn't warrant a form library. Zero form libraries used in the codebase. | `useState` with controlled inputs |
| Separate balance snapshot on account creation | Manual accounts start with balance 0, which is accurate (no transactions yet). | Snapshot job captures balance on next scheduled run. |

---

## Installation

```bash
# Nothing to install. Zero new dependencies for this milestone.
```

---

## Version Compatibility

| Component | Current Version | Notes |
|-----------|-----------------|-------|
| `node:crypto` `randomUUID` | Node 22 (runtime) | Available since Node 15. Node 22 is the current runtime. No version concerns. |
| `better-sqlite3` ALTER TABLE | 11.7.0 | SQLite ALTER TABLE ADD COLUMN has been supported since SQLite 3.0. No compatibility concerns. |
| tRPC mutations | 11.14.1 | New mutations follow identical patterns to existing ones. No API changes required. |

---

## Sources

- Codebase `packages/server/src/import/import-service.ts` line 390 -- HIGH confidence. Verified `randomUUID` from `node:crypto` in use.
- Codebase `packages/server/src/categories/category-service.ts` line 142 -- HIGH confidence. Verified `crypto.randomUUID()` pattern for ID generation.
- Codebase `packages/server/src/db/migrate.ts` -- HIGH confidence. Verified migration runner reads numbered SQL files, applies transactionally, sets `user_version`.
- Codebase `packages/server/migrations/001-initial-schema.sql` -- HIGH confidence. Verified `accounts` table schema: `id TEXT PRIMARY KEY`, `simplefin_id TEXT UNIQUE`, `balance INTEGER`, no `source` column (confirms migration needed).
- Design doc `.planning/designs/2026-03-25-manual-accounts-csv-import-design.md` -- HIGH confidence. Authoritative spec for `manual_<uuid>` ID format, `source` column name/values, `recalculateBalance` function, sentinel `__create__` pattern.
- [SQLite ALTER TABLE documentation](https://www.sqlite.org/lang_altertable.html) -- HIGH confidence. Confirms ADD COLUMN is safe without table rebuild when column has a DEFAULT value.
- [Node.js crypto.randomUUID() docs](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) -- HIGH confidence. Available since Node 14.17.0; cryptographically random UUID v4.

---
*Stack research for: Minerva Money v2.7 Manual Accounts*
*Researched: 2026-03-25*
