# Architecture Research

**Domain:** Manual account CRUD + CSV import integration — Minerva Money v2.7
**Researched:** 2026-03-25
**Confidence:** HIGH (all findings derived from direct codebase inspection)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client (React SPA)                          │
│  ┌─────────────┐  ┌─────────────────────────────┐  ┌─────────────┐  │
│  │ AccountsPage│  │        ImportPage            │  │  ChatPage   │  │
│  │  (modified) │  │  PreviewStep (modified)      │  │ (modified)  │  │
│  │  Manual badge│  │  + inline create form       │  │ create_acct │  │
│  └──────┬──────┘  └──────────────┬───────────────┘  └──────┬──────┘  │
│         │                        │                         │          │
│         └────────────────────────┴─────────────────────────┘          │
│                           tRPC client (useTRPC)                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ tRPC over HTTP
┌───────────────────────────────▼──────────────────────────────────────┐
│                        Server (Express + tRPC)                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    appRouter (trpc-router.ts)                    │  │
│  │  accountsRouter (modified)    importRouter (modified)           │  │
│  │  agentRouter (new tool)                                         │  │
│  └──────────────┬────────────────────────┬──────────────────────── ┘  │
│                 │                        │                             │
│  ┌──────────────▼──────────┐  ┌──────────▼──────────────────────┐     │
│  │   accounts-service.ts   │  │       import-service.ts         │     │
│  │       (NEW MODULE)      │  │          (modified)             │     │
│  │  createAccount()        │  │  executeImport() calls          │     │
│  │  updateAccount()        │  │  recalculateBalance() per       │     │
│  │  deleteAccount()        │  │  manual account after inserts   │     │
│  │  recalculateBalance()   │  └─────────────────────────────────┘     │
│  └──────────────┬──────────┘                                          │
└─────────────────┼──────────────────────────────────────────────────── ┘
                  │
┌─────────────────▼──────────────────────────────────────────────────── ┐
│                           SQLite Database                               │
│  accounts (+ source column via migration 006)                           │
│  transactions, balance_snapshots, budget_allocations, ...              │
└─────────────────────────────────────────────────────────────────────── ┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `migrations/006-manual-accounts.sql` | Add `source TEXT NOT NULL DEFAULT 'simplefin'` to accounts table | NEW |
| `src/accounts/accounts-service.ts` | createAccount, updateAccount, deleteAccount, recalculateBalance — all manual-account business logic | NEW |
| `src/sync/trpc-router.ts` — accountsRouter | Add accounts.create, accounts.update, accounts.delete mutations; extend accounts.list to return source field | MODIFIED |
| `src/import/import-service.ts` — executeImport | After transaction insert loop, call recalculateBalance for each touched manual account | MODIFIED |
| `src/agent/tools/action-tools.ts` | Add create_account tool wrapping createAccount() service function | MODIFIED |
| `src/agent/tools/query-tools.ts` | Include source field in get_account_balances response | MODIFIED |
| `src/agent/system-prompt.ts` | Add guidance that agent can create manual accounts for unsupported institutions | MODIFIED |
| `client/pages/ImportPage.tsx` — PreviewStep | Inline account creation form in account mapping dropdowns; invalidate accounts.list on create | MODIFIED |
| `client/pages/AccountsPage.tsx` | Render "Manual" badge for source=manual accounts; suppress last-synced timestamp for manual accounts | MODIFIED |

## Recommended Project Structure

```
packages/server/
├── migrations/
│   └── 006-manual-accounts.sql     # NEW: ALTER TABLE accounts ADD COLUMN source
├── src/
│   ├── accounts/                   # NEW module
│   │   └── accounts-service.ts     # createAccount, updateAccount, deleteAccount, recalculateBalance
│   ├── sync/
│   │   └── trpc-router.ts          # MODIFIED: accountsRouter gains CRUD + list returns source
│   ├── import/
│   │   └── import-service.ts       # MODIFIED: executeImport calls recalculateBalance post-insert
│   └── agent/
│       └── tools/
│           ├── action-tools.ts     # MODIFIED: +create_account tool
│           └── query-tools.ts      # MODIFIED: source in get_account_balances

packages/client/src/
└── pages/
    ├── ImportPage.tsx              # MODIFIED: inline create form in PreviewStep
    └── AccountsPage.tsx            # MODIFIED: Manual badge, conditional last-synced label
```

### Structure Rationale

- **`src/accounts/` as new module:** Mirrors the existing module pattern (budget/, categories/, rules/, sync/). One service file, one clear responsibility. The tRPC router stays thin and imports from it.
- **No new router file for accounts:** The existing `accountsRouter` in `trpc-router.ts` already exists with a `list` procedure. Adding mutations inline there follows the same pattern as every other router in the file. A separate `accounts-router.ts` would add a file for minimal benefit.
- **Migration as a numbered SQL file:** The migration runner (`migrate.ts`) reads `migrations/*.sql` sorted numerically and applies any file with a version number above `PRAGMA user_version`. Adding `006-manual-accounts.sql` requires zero changes to the runner.

## Architectural Patterns

### Pattern 1: Service-Layer Encapsulation (existing, extended)

**What:** All business logic lives in service functions. tRPC router procedures are thin: validate with Zod, call service, return result. Agent tools call the same service functions directly (bypassing tRPC), following the exact pattern of `create_category` and `create_category_group`.
**When to use:** Every new mutation in this codebase — this is the established convention.
**Trade-offs:** Minor indirection, but the benefit is that service functions remain testable in isolation and reusable by both tRPC and agent tools.

**Example:**
```typescript
// accounts-service.ts
export function createAccount(db: Database.Database, name: string, institution: string, type: string) {
  const id = `manual_${randomUUID()}`;
  db.transaction(() => {
    db.prepare(`INSERT INTO accounts (id, name, institution, type, balance, source)
                VALUES (?, ?, ?, ?, 0, 'manual')`).run(id, name, institution, type);
    // Write today's balance snapshot (same pattern as syncAccount in sync-service.ts)
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`INSERT OR REPLACE INTO balance_snapshots (account_id, date, balance)
                VALUES (?, ?, 0)`).run(id, today);
  })();
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
}

// In trpc-router.ts accountsRouter
create: publicProcedure
  .input(z.object({ name: z.string().min(1), institution: z.string().min(1), type: z.string().min(1) }))
  .mutation(({ ctx, input }) => createAccount(ctx.db, input.name, input.institution, input.type)),
```

### Pattern 2: Source Guard on Mutations

**What:** `updateAccount` and `deleteAccount` verify `source = 'manual'` before proceeding and throw a descriptive error if called on a SimpleFIN-synced account. The guard lives in the service function, not the tRPC router, so the agent tool path is also protected.
**When to use:** Any write operation that is only valid for user-managed rows.
**Trade-offs:** Runtime check only (not a TypeScript compile-time constraint), but this matches how the codebase handles all other runtime preconditions.

**Example:**
```typescript
export function deleteAccount(db: Database.Database, id: string) {
  const account = db.prepare('SELECT id, source FROM accounts WHERE id = ?')
    .get(id) as { id: string; source: string } | undefined;
  if (!account) throw new Error(`Account ${id} not found`);
  if (account.source !== 'manual') throw new Error('Cannot delete SimpleFIN-synced accounts');
  // ON DELETE CASCADE handles transactions, balance_snapshots, transfer_links
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}
```

### Pattern 3: Post-Import Balance Recalculation

**What:** After `executeImport()` completes its transaction insert loop, it collects the set of account IDs that actually received new rows, filters to those with `source = 'manual'`, and calls `recalculateBalance()` once per manual account. This happens inside the same DB transaction so balance is consistent on rollback.
**When to use:** Any write path that inserts transactions for manual accounts.
**Trade-offs:** Requires one additional query per manual account (SELECT SUM). For typical import sizes (hundreds to thousands of rows across a handful of accounts) this is negligible.

**Key implementation detail:** Collect unique account IDs during the insert loop, not after, to avoid an extra scan. Filter for manual accounts with a single batch query (`WHERE id IN (...) AND source = 'manual'`).

```typescript
// In executeImport() — after the insert loop, inside db.transaction():
const touchedAccountIds = [...new Set(validTransformed
  .filter(row => accountMappings[row.accountName])
  .map(row => accountMappings[row.accountName])
)];

if (touchedAccountIds.length > 0) {
  const placeholders = touchedAccountIds.map(() => '?').join(', ');
  const manualAccounts = db.prepare(
    `SELECT id FROM accounts WHERE id IN (${placeholders}) AND source = 'manual'`
  ).all(...touchedAccountIds) as { id: string }[];
  for (const { id } of manualAccounts) {
    recalculateBalance(db, id);
  }
}
```

### Pattern 4: Inline Account Creation in Import Wizard

**What:** In `ImportPage.tsx`, the `PreviewStep` component adds a `"+ Create New Account"` option at the top of each account mapping `<select>`. Selecting it reveals a small inline form (name pre-filled from CSV account name, institution text input, type dropdown). On submit, the component calls `trpc.accounts.create` mutation, then auto-selects the new account in the dropdown and collapses the form.
**When to use:** Surfacing a quick-create flow without navigating away from a multi-step wizard.
**Trade-offs:** Adds local state to `PreviewStep` (a `creatingForAccount: string | null` state and an inline form component). The newly created account must appear in the dropdown immediately — achieved by calling `queryClient.invalidateQueries(trpc.accounts.list.queryKey())` on mutation success so the `accounts` prop re-fetches.

The `PreviewStep` already receives `accounts` as a prop from the `useQuery(trpc.accounts.list.queryOptions())` call in the parent `ImportPage`. After invalidation, the query refetches and the prop updates automatically.

## Data Flow

### Create Manual Account

```
User selects "+ Create New Account" in ImportPage Step 2 dropdown
    ↓
Inline form appears (name pre-filled from CSV account name)
    ↓
User fills institution, type; submits form
    ↓
accounts.create mutation (tRPC)
    ↓
accountsRouter.create → createAccount(db, name, institution, type)
    ↓
INSERT INTO accounts ... source = 'manual', id = 'manual_<uuid>'
INSERT OR REPLACE INTO balance_snapshots ... balance = 0
    ↓
Returns new account row
    ↓
queryClient.invalidateQueries(trpc.accounts.list.queryKey())
    ↓
accounts.list query refetches; dropdown re-renders with new account auto-selected
```

### CSV Import with Manual Account

```
executeImport mutation fires with accountMappings including 'manual_<uuid>'
    ↓
executeImport(db, csvText, accountMappings, categoryMappings) — no parsing changes
    ↓
Same INSERT OR IGNORE pipeline (dedup, rules engine, transfer detection unchanged)
    ↓
Collect unique touched account IDs
    ↓
Batch query: filter to source = 'manual'
    ↓
recalculateBalance(db, id) for each manual account:
  UPDATE accounts SET balance = (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ?)
  INSERT OR REPLACE INTO balance_snapshots (account_id, date, balance) VALUES (?, today, newBalance)
    ↓
Returns ExecuteResult (shape unchanged — no new fields required)
```

### Delete Manual Account

```
User clicks Delete on manual account in AccountsPage
    ↓
accounts.delete mutation (tRPC)
    ↓
deleteAccount(db, id) — checks source = 'manual'; throws if SimpleFIN account
    ↓
DELETE FROM accounts WHERE id = ?
  (CASCADE: transactions, balance_snapshots, transfer_links auto-deleted)
    ↓
queryClient.invalidateQueries(trpc.accounts.list.queryKey())
    ↓
AccountsPage re-renders without deleted account
```

### Agent create_account Tool

```
User asks Claude to create an account for an unsupported institution
    ↓
Agent requests confirmation (same pattern as create_category)
    ↓
User confirms
    ↓
create_account tool calls createAccount(db, name, institution, type)
    ↓
Same service function as tRPC path — identical DB write
    ↓
Returns jsonResult({ success: true, id, name, source: 'manual' })
```

## Integration Points

### New vs. Modified Components

| Component | Type | What Changes |
|-----------|------|-------------|
| `migrations/006-manual-accounts.sql` | NEW | Single `ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin'` |
| `src/accounts/accounts-service.ts` | NEW | Full CRUD service + recalculateBalance |
| `src/sync/trpc-router.ts` — accountsRouter | MODIFIED | +create/update/delete mutations; list SELECT gains `source` column; return type gains `source` field |
| `src/import/import-service.ts` — executeImport | MODIFIED | ~10 lines: collect touched account IDs, filter to manual, call recalculateBalance |
| `src/agent/tools/action-tools.ts` | MODIFIED | +create_account tool (same structure as create_category) |
| `src/agent/tools/query-tools.ts` | MODIFIED | get_account_balances SELECT includes `source` column |
| `src/agent/system-prompt.ts` | MODIFIED | +guidance for manual account creation |
| `client/pages/ImportPage.tsx` | MODIFIED | PreviewStep: inline create form, accounts query invalidation on create |
| `client/pages/AccountsPage.tsx` | MODIFIED | Manual badge, suppress last-synced for source=manual |
| `client/pages/DashboardPage.tsx` | UNCHANGED | accounts.list query already renders all accounts regardless of source |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `accounts-service` ← `trpc-router` | Direct import | Same pattern as all other service modules |
| `accounts-service` ← `action-tools` | Direct import | Consistent with create_category / create_group precedent |
| `accounts-service.recalculateBalance` ← `import-service` | Direct import | Called post-insert in executeImport |
| `sync-service` → `accounts` table | Raw SQL (unchanged) | SimpleFIN sync still writes directly; only manual account mutations go through the service |
| `AccountsPage` ↔ `accountsRouter.list` | tRPC query | list response must include `source` field for conditional UI rendering |
| `ImportPage` ↔ `accountsRouter.create` | tRPC mutation | New mutation; invalidates accounts.list cache on success |

### Schema Migration Contract

SQLite `ALTER TABLE ... ADD COLUMN ... DEFAULT 'simplefin'` is safe:
- All existing rows receive `'simplefin'` as the source value — no data migration needed
- The `source` column is NOT NULL with a default, so it cannot be omitted on new inserts
- The migration runner wraps it in a transaction with `PRAGMA user_version` bump
- No other migration files need to change

```sql
-- migrations/006-manual-accounts.sql
ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin';
```

### Account ID Convention

Manual accounts use `manual_<uuid>` as the primary key. This prefix:
- Prevents collision with SimpleFIN IDs (which are opaque strings without a known prefix)
- Makes manual accounts identifiable by ID alone without a DB lookup (useful for the import wizard to distinguish after creation)
- Does not affect any existing queries (all JOIN on `accounts.id` regardless of format)

The `simplefin_id` column remains nullable; manual accounts leave it NULL.

## Anti-Patterns

### Anti-Pattern 1: Balance Recalculation Inside the Per-Row Insert Loop

**What people do:** Call `recalculateBalance(db, accountId)` for each row inside the `for (const row of validTransformed)` loop.
**Why it's wrong:** Recalculates N times when only one recalculation per account is needed. A 500-row import touching 3 accounts would trigger 500 recalculations instead of 3.
**Do this instead:** Collect unique manual account IDs during the loop; call `recalculateBalance` once per account after the loop completes.

### Anti-Pattern 2: Source Guard in the tRPC Router Instead of the Service

**What people do:** Put the `source !== 'manual'` guard inside the tRPC mutation handler.
**Why it's wrong:** The agent `create_account` tool and any future CLI path call service functions directly, bypassing the tRPC router. Guards at the router level do not protect the service-level path.
**Do this instead:** Guards in service functions. The router procedure trusts the service to enforce invariants.

### Anti-Pattern 3: Creating a Separate accounts-router.ts File

**What people do:** Create `src/accounts/accounts-router.ts` and register it separately in `appRouter`.
**Why it's wrong:** The existing `accountsRouter` in `trpc-router.ts` is already a sub-router. Splitting it out adds a file and an import for no functional benefit. All other domain routers are defined inline in `trpc-router.ts` alongside their imports.
**Do this instead:** Add `create`, `update`, and `delete` procedures to the existing `accountsRouter` in `trpc-router.ts`, importing from `accounts-service.ts`.

### Anti-Pattern 4: Separate Balance Snapshot Write Outside recalculateBalance

**What people do:** After calling `recalculateBalance()`, separately write a `balance_snapshots` record.
**Why it's wrong:** Creates two code paths for snapshot management. `syncAccount()` in `sync-service.ts` already does both balance column update and snapshot write in a single function. `recalculateBalance()` should follow the same pattern for consistency.
**Do this instead:** `recalculateBalance()` updates both `accounts.balance` and writes a `balance_snapshots` entry for today, using `INSERT OR REPLACE` (same as `syncAccount`).

### Anti-Pattern 5: Adding `source` Filter to Existing Report/Budget Queries

**What people do:** Add `WHERE a.source = 'simplefin'` or similar conditions to spending reports, net worth queries, or budget queries to exclude manual accounts.
**Why it's wrong:** The design explicitly requires manual accounts to be treated identically to SimpleFIN accounts in all reports. Filtering them out would defeat the purpose.
**Do this instead:** Leave all existing query joins unchanged. Manual account transactions participate in reports automatically via the `transactions.account_id` foreign key.

## Suggested Build Order

Dependencies flow strictly: schema → service → router → import integration → client → agent.

| Step | What | Files | Dependency |
|------|------|-------|------------|
| 1 | Migration | `migrations/006-manual-accounts.sql` | None — unblocks all subsequent steps |
| 2 | accounts-service | `src/accounts/accounts-service.ts` | Depends on source column existing |
| 3 | accountsRouter mutations + list update | `src/sync/trpc-router.ts` | Depends on accounts-service |
| 4 | import-service recalculateBalance integration | `src/import/import-service.ts` | Depends on accounts-service |
| 5 | AccountsPage visual distinction | `client/pages/AccountsPage.tsx` | Depends on list returning source |
| 6 | ImportPage inline account creation | `client/pages/ImportPage.tsx` | Depends on accounts.create mutation (step 3) |
| 7 | create_account agent tool | `src/agent/tools/action-tools.ts` | Depends on accounts-service |
| 8 | get_account_balances source field | `src/agent/tools/query-tools.ts` | Depends on list returning source (step 3) |
| 9 | System prompt update | `src/agent/system-prompt.ts` | Depends on create_account tool existing (step 7) |

**Step ordering rationale:**
- Steps 1-4 are server-only and have a strict linear dependency chain
- Steps 5-6 are client and can be done in parallel with steps 7-9 once step 3 is complete
- Step 6 (ImportPage) is the most complex client change and should be done independently from AccountsPage to keep diffs reviewable
- Agent steps 7-9 can proceed in parallel with client steps once the service is ready

## Sources

- Direct inspection of `packages/server/migrations/001-initial-schema.sql` (schema structure and migration pattern)
- Direct inspection of `packages/server/src/sync/trpc-router.ts` (router pattern, existing accountsRouter)
- Direct inspection of `packages/server/src/import/import-service.ts` (executeImport structure)
- Direct inspection of `packages/server/src/sync/sync-service.ts` (balance snapshot pattern in syncAccount)
- Direct inspection of `packages/server/src/agent/tools/action-tools.ts` (tool creation pattern)
- Direct inspection of `packages/server/src/db/migrate.ts` (migration runner behavior)
- Direct inspection of `packages/client/src/pages/ImportPage.tsx` (wizard state management, PreviewStep structure)
- Direct inspection of `packages/client/src/pages/AccountsPage.tsx` (current render structure)
- Direct inspection of `packages/client/src/pages/DashboardPage.tsx` (accounts list consumption)
- Direct inspection of `.planning/designs/2026-03-25-manual-accounts-csv-import-design.md` (authoritative design decisions)
- Direct inspection of `.planning/PROJECT.md` (milestone requirements and key decisions)

---
*Architecture research for: Minerva Money v2.7 — Manual Accounts & CSV Import Integration*
*Researched: 2026-03-25*
