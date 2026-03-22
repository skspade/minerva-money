# Architecture Patterns

**Domain:** Personal budgeting / envelope budgeting web app
**Researched:** 2026-03-22

## Recommended Architecture

Three-layer monolith in a monorepo. Single process serves both API and static assets. No microservices, no BFF, no separate worker processes. SQLite is the only data store.

```
Browser (React SPA)
    |
    | tRPC over HTTP (JSON batched)
    |
Express Server
    |--- tRPC Router Layer (procedures grouped by domain)
    |--- Service Layer (business logic, orchestration)
    |--- Data Access Layer (better-sqlite3 queries)
    |
SQLite file (~/minerva-money/data/minerva.db)
    |
    |--- launchd scheduled backup --> iCloud Drive
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **React SPA** | UI rendering, user interaction, client-side cache | tRPC client (via TanStack Query) |
| **tRPC Router Layer** | Input validation (Zod), procedure definitions, request/response shaping | Service Layer |
| **Service Layer** | Business logic: budgeting math, categorization rules, sync orchestration, transfer detection | Data Access Layer, SimpleFIN Client |
| **Data Access Layer** | SQL queries, transactions, migrations | SQLite via better-sqlite3 |
| **SimpleFIN Client** | HTTP calls to SimpleFIN API, response normalization | SimpleFIN API (external) |
| **Backup Module** | Atomic SQLite snapshots to iCloud Drive | SQLite file, filesystem |
| **Scheduler** | Cron-like triggers for sync and backup | Service Layer, Backup Module |

### Why These Boundaries

**tRPC routers do NOT contain business logic.** They validate input with Zod, call a service function, and return the result. This keeps procedures thin and testable.

**Service layer is the core.** All business rules live here: envelope allocation math, rule matching, dedup logic, transfer detection. Services call the data access layer but never import `better-sqlite3` directly.

**Data access layer owns SQL.** Every SQL query lives in dedicated data access modules. Services never construct SQL strings. This isolates the database from business logic and makes queries easy to find and optimize.

**SimpleFIN client is isolated.** It knows nothing about the database or business logic. It fetches, normalizes, and returns typed data. The sync service orchestrates between SimpleFIN client and data access.

### Data Flow

#### Sync Flow (Primary Data Ingestion)

```
1. Scheduler triggers sync (or user clicks "Sync Now")
2. SyncService.runSync()
3.   --> SimpleFINClient.fetchAccounts({ startDate, endDate })
4.   --> SimpleFIN API returns raw account + transaction JSON
5.   --> SimpleFINClient normalizes response to typed objects
6.   --> SyncService.processAccounts(normalizedAccounts)
7.       --> For each account:
8.           AccountDAO.upsertAccount(account)
9.           BalanceSnapshotDAO.recordSnapshot(accountId, balance, date)
10.      --> For each transaction:
11.          DeduplicationService.isDuplicate(tx) -- check transactionId, then hash
12.          If new: TransactionDAO.insert(tx)
13.          CategorizationService.categorize(tx) -- apply rules
14.          TransferDetectionService.checkForMatch(tx) -- look for offsetting tx
15. --> SyncStatusDAO.recordSyncResult(success/error, timestamp)
16. --> BackupModule.triggerPostSyncBackup()
17. --> TanStack Query invalidation (client refetches stale data)
```

#### Budget Flow (User Assigns Money)

```
1. User opens budget view for current month
2. Client fetches: budget allocations + category balances + envelope states
3.   --> BudgetService.getMonthBudget(year, month)
4.       --> BudgetDAO.getAllocations(year, month)
5.       --> TransactionDAO.getCategorySpending(year, month)
6.       --> Calculate: allocated - spent + rollover = available per envelope
7. User adjusts an envelope allocation
8.   --> BudgetService.setAllocation(categoryId, year, month, amount)
9.       --> BudgetDAO.upsertAllocation(categoryId, year, month, amount)
10.      --> Return updated budget state
```

#### Categorization Flow

```
1. New transaction arrives (via sync) or user creates rule
2. CategorizationService.categorize(transaction)
3.   --> RuleDAO.getMatchingRules(transaction.merchant, transaction.amount, transaction.memo)
4.   --> Score rules by specificity (field count)
5.   --> Apply most-specific rule (ties: newest wins)
6.   --> TransactionDAO.setCategoryId(transactionId, categoryId)
7.
8. When rule is created/updated:
9.   --> RuleDAO.upsertRule(rule)
10.  --> CategorizationService.reapplyRule(rule)
11.      --> TransactionDAO.getUncategorizedOrMatchingTransactions()
12.      --> Re-evaluate all affected transactions
```

## Database Schema Design

Six core tables plus supporting tables. Use views (prefixed `v_`) for common query patterns, following Actual Budget's pattern of separating storage from presentation.

### Core Tables

```sql
-- Financial institution accounts
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,          -- UUID
  simplefin_id TEXT UNIQUE,     -- SimpleFIN's account identifier
  name TEXT NOT NULL,
  institution TEXT,
  type TEXT NOT NULL,            -- checking, savings, credit, loan, investment
  balance INTEGER NOT NULL DEFAULT 0,  -- cents (integer math, no floats)
  available_balance INTEGER,
  currency TEXT DEFAULT 'USD',
  is_off_budget INTEGER DEFAULT 0,  -- investment accounts are off-budget
  sort_order INTEGER DEFAULT 0,
  closed INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Budget categories (envelopes)
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT REFERENCES category_groups(id),
  is_income INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0
);

CREATE TABLE category_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_income INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- Individual financial transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  category_id TEXT REFERENCES categories(id),
  date TEXT NOT NULL,              -- ISO 8601 date (YYYY-MM-DD)
  amount INTEGER NOT NULL,         -- cents, negative = outflow
  merchant TEXT,
  memo TEXT,
  simplefin_id TEXT,               -- original SimpleFIN transactionId
  dedup_hash TEXT,                 -- account+date+amount+merchant hash
  is_transfer INTEGER DEFAULT 0,
  transfer_pair_id TEXT,           -- links to the other side of a transfer
  is_pending INTEGER DEFAULT 0,
  imported_at TEXT NOT NULL,
  UNIQUE(simplefin_id),
  UNIQUE(dedup_hash)
);

-- Monthly budget allocations per category
CREATE TABLE budget_allocations (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,             -- YYYY-MM format
  amount INTEGER NOT NULL DEFAULT 0,  -- cents allocated this month
  UNIQUE(category_id, month)
);

-- Default monthly allocation per category (template)
CREATE TABLE category_defaults (
  category_id TEXT PRIMARY KEY REFERENCES categories(id),
  monthly_amount INTEGER NOT NULL DEFAULT 0  -- cents, auto-split across pay periods
);

-- Categorization rules
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  merchant_pattern TEXT,           -- substring or regex match
  amount_min INTEGER,              -- cents
  amount_max INTEGER,              -- cents
  memo_pattern TEXT,               -- substring or regex match
  specificity INTEGER NOT NULL,    -- count of non-null conditions (1-3)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Supporting Tables

```sql
-- Daily balance snapshots for trends
CREATE TABLE balance_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  date TEXT NOT NULL,              -- YYYY-MM-DD
  balance INTEGER NOT NULL,        -- cents
  UNIQUE(account_id, date)
);

-- Sync status tracking
CREATE TABLE sync_log (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,            -- running, success, error
  error_message TEXT,
  accounts_synced INTEGER DEFAULT 0,
  transactions_added INTEGER DEFAULT 0
);

-- App configuration / settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### Key Schema Decisions

**Store money as integers (cents).** Floating point math causes rounding errors in financial calculations. Store $45.67 as 4567. Format for display only at the UI layer.

**Month as YYYY-MM string in budget_allocations.** Simple to query, sort, and group. No date arithmetic needed.

**Specificity as computed column on rules.** Pre-calculate `specificity = (merchant_pattern IS NOT NULL) + (amount_min IS NOT NULL OR amount_max IS NOT NULL) + (memo_pattern IS NOT NULL)` on insert/update. Avoids recalculating during rule matching.

**Dedup hash as UNIQUE constraint.** The database enforces deduplication at the storage level. INSERT OR IGNORE handles duplicates without application code.

**UUIDs as primary keys.** Use `crypto.randomUUID()`. Auto-increment IDs leak information and cause issues with backups/restores.

## Patterns to Follow

### Pattern 1: Repository Pattern for Data Access

**What:** Each domain entity gets a dedicated DAO (Data Access Object) module that encapsulates all SQL queries for that entity.
**When:** Always. Every SQL query goes through a DAO.

```typescript
// src/server/dao/transactions.ts
import type { Database } from 'better-sqlite3';

export function createTransactionDAO(db: Database) {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO transactions (id, account_id, date, amount, merchant, memo, simplefin_id, dedup_hash, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const byCategoryMonth = db.prepare(`
    SELECT category_id, SUM(amount) as total
    FROM transactions
    WHERE date >= ? AND date < ? AND is_transfer = 0
    GROUP BY category_id
  `);

  return {
    insert(tx: NewTransaction) {
      return insertStmt.run(tx.id, tx.accountId, tx.date, tx.amount, tx.merchant, tx.memo, tx.simpleFinId, tx.dedupHash, tx.importedAt);
    },
    getCategorySpending(startDate: string, endDate: string) {
      return byCategoryMonth.all(startDate, endDate);
    }
  };
}
```

**Why:** Prepared statements are compiled once and reused. `better-sqlite3` is synchronous, so this pattern is natural and fast. Grouping queries by entity makes them discoverable.

### Pattern 2: Service Layer Orchestration

**What:** Services contain business logic and orchestrate between DAOs. They do not contain SQL.
**When:** Any operation that involves business rules, multiple DAOs, or external services.

```typescript
// src/server/services/sync.ts
export function createSyncService(deps: {
  simplefin: SimpleFINClient;
  accountDAO: AccountDAO;
  transactionDAO: TransactionDAO;
  snapshotDAO: BalanceSnapshotDAO;
  categorizationService: CategorizationService;
  syncLogDAO: SyncLogDAO;
}) {
  return {
    async runSync() {
      const logId = deps.syncLogDAO.start();
      try {
        const accounts = await deps.simplefin.fetchAccounts({ startDate: lastSyncDate() });
        for (const account of accounts) {
          deps.accountDAO.upsert(account);
          deps.snapshotDAO.record(account.id, account.balance, today());
          for (const tx of account.transactions) {
            const result = deps.transactionDAO.insert(tx);
            if (result.changes > 0) {
              deps.categorizationService.categorize(tx);
            }
          }
        }
        deps.syncLogDAO.complete(logId, 'success');
      } catch (err) {
        deps.syncLogDAO.complete(logId, 'error', err.message);
        throw err;
      }
    }
  };
}
```

### Pattern 3: tRPC Router as Thin Controller

**What:** tRPC procedures validate input and delegate to services. No business logic in routers.
**When:** Always.

```typescript
// src/server/routers/budget.ts
export const budgetRouter = router({
  getMonth: publicProcedure
    .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
    .query(({ input, ctx }) => {
      return ctx.budgetService.getMonthBudget(input.year, input.month);
    }),

  setAllocation: publicProcedure
    .input(z.object({
      categoryId: z.string().uuid(),
      year: z.number(),
      month: z.number().min(1).max(12),
      amount: z.number().int(), // cents
    }))
    .mutation(({ input, ctx }) => {
      return ctx.budgetService.setAllocation(input.categoryId, input.year, input.month, input.amount);
    }),
});
```

### Pattern 4: Dependency Injection via Context

**What:** Create all DAOs and services at startup, pass them through tRPC context.
**When:** App initialization.

```typescript
// src/server/context.ts
export function createContext(db: Database) {
  const accountDAO = createAccountDAO(db);
  const transactionDAO = createTransactionDAO(db);
  const ruleDAO = createRuleDAO(db);
  const budgetDAO = createBudgetDAO(db);
  const snapshotDAO = createBalanceSnapshotDAO(db);
  const syncLogDAO = createSyncLogDAO(db);

  const categorizationService = createCategorizationService({ ruleDAO, transactionDAO });
  const budgetService = createBudgetService({ budgetDAO, transactionDAO });
  const syncService = createSyncService({ /* ... */ });

  return { accountDAO, transactionDAO, budgetService, syncService, categorizationService };
}
```

### Pattern 5: SQLite Transactions for Batch Operations

**What:** Wrap multi-row inserts and cross-table updates in SQLite transactions.
**When:** Sync ingestion, rule reapplication, budget period initialization.

```typescript
const insertMany = db.transaction((transactions: NewTransaction[]) => {
  for (const tx of transactions) {
    insertStmt.run(tx);
  }
});
// 100x faster than individual inserts
```

**Why:** `better-sqlite3` transactions are synchronous and dramatically faster for batch operations. A sync importing 200 transactions in a single transaction takes milliseconds vs. seconds for individual inserts.

## Anti-Patterns to Avoid

### Anti-Pattern 1: SQL in Route Handlers
**What:** Writing SQL queries directly in tRPC procedures.
**Why bad:** Untestable, hard to find queries, business logic mixed with transport concerns.
**Instead:** All SQL lives in DAO modules. Routers call services, services call DAOs.

### Anti-Pattern 2: Floating Point Money
**What:** Storing or calculating money as `number` (float).
**Why bad:** `0.1 + 0.2 !== 0.3` in JavaScript. Rounding errors accumulate and budgets won't balance.
**Instead:** Store cents as integers. Format for display with `(amount / 100).toFixed(2)` only at the UI boundary.

### Anti-Pattern 3: Over-Normalizing the Schema
**What:** Creating separate tables for every relationship (e.g., transaction_categories join table, rule_conditions table).
**Why bad:** Adds complexity without benefit for a single-user app. SQLite thrives on simple schemas with few joins.
**Instead:** Inline foreign keys. A transaction has one category_id. A rule has nullable condition columns.

### Anti-Pattern 4: Async Database Calls
**What:** Using an async SQLite driver or wrapping better-sqlite3 in promises.
**Why bad:** `better-sqlite3` is intentionally synchronous. Wrapping it in async adds overhead and complexity with zero benefit for a single-user app.
**Instead:** Use synchronous calls directly. The only async boundary is the SimpleFIN HTTP client.

### Anti-Pattern 5: Client-Side Budget Calculations
**What:** Sending raw transactions to the client and calculating budget state in React.
**Why bad:** Moves financial logic to the client where it's duplicated, harder to test, and slower for large transaction sets.
**Instead:** Server computes budget state (allocated, spent, available, rollover) and sends computed values.

### Anti-Pattern 6: Global Mutable State for Scheduler
**What:** Using `setInterval` or a global timer for sync/backup scheduling.
**Why bad:** Leaks between tests, no clean shutdown, hard to reason about.
**Instead:** Create a scheduler object at startup that can be stopped cleanly. Use `node-cron` or a simple wrapper around `setTimeout` with cancellation.

## Monorepo Structure

```
minerva-money/
  package.json              # workspace root
  packages/
    shared/                 # shared types and utilities
      src/
        types/              # domain types (Account, Transaction, Budget, etc.)
        constants.ts        # shared constants
        money.ts            # cent <-> dollar utilities
    server/
      src/
        index.ts            # Express + tRPC setup, scheduler start
        context.ts          # DI container creation
        db/
          connection.ts     # better-sqlite3 initialization
          migrations/       # SQL migration files
        dao/                # data access objects
          accounts.ts
          transactions.ts
          budget.ts
          rules.ts
          balance-snapshots.ts
          sync-log.ts
          settings.ts
        services/           # business logic
          sync.ts
          categorization.ts
          budget.ts
          transfer-detection.ts
          backup.ts
        routers/            # tRPC routers
          accounts.ts
          transactions.ts
          budget.ts
          rules.ts
          sync.ts
          settings.ts
          index.ts          # mergeRouters
        simplefin/
          client.ts         # SimpleFIN HTTP client
          types.ts          # SimpleFIN API types
        scheduler.ts        # cron-like sync/backup scheduling
    client/
      src/
        main.tsx
        App.tsx
        api/                # tRPC client setup
          trpc.ts
        components/
          layout/           # shell, sidebar, header
          dashboard/        # balance cards, spending chart, trends
          budget/           # envelope grid, allocation editor
          transactions/     # transaction list, filters, rule editor
          accounts/         # account list, detail view
          settings/         # sync config, category management
          common/           # buttons, inputs, modals, etc.
        hooks/              # custom hooks wrapping tRPC queries
        utils/              # formatters, date helpers
```

**Why monorepo with workspaces:** tRPC requires the shared router type to be importable by the client. A monorepo with a `shared` package makes this trivial without publishing packages. The `shared` package contains domain types used by both client and server.

## Suggested Build Order

Build in dependency order. Each phase produces something runnable.

### Phase 1: Foundation (no UI needed)

1. **SQLite database + migrations** -- Schema is the foundation. Everything depends on it.
2. **DAO layer** -- Basic CRUD for accounts, transactions, categories.
3. **SimpleFIN client** -- Already partially built per PROJECT.md. Finalize and test.
4. **Sync service** -- Connect SimpleFIN client to DAOs. Deduplication logic.
5. **tRPC server** -- Wire up Express + tRPC with basic account/transaction procedures.

**Rationale:** Get real data flowing into the database before building UI. Test sync with actual SimpleFIN data early to catch API surprises.

### Phase 2: Core UI + Transactions

6. **React app shell** -- Layout, sidebar, routing.
7. **Account list + balances** -- Display synced accounts. First visible proof of life.
8. **Transaction list** -- Display, sort, filter transactions. Manual categorization.
9. **Sync UI** -- "Sync Now" button, sync status indicator, last sync time.

**Rationale:** Users need to see their data before they can budget against it. Transaction viewing validates that sync is working correctly.

### Phase 3: Budgeting Engine

10. **Category/envelope management** -- CRUD for categories and groups.
11. **Budget allocation system** -- Monthly allocations, defaults, the budget grid.
12. **Rollover logic** -- Carry unspent funds forward.
13. **Budget views** -- The envelope grid showing allocated/spent/available per category.

**Rationale:** Budgeting depends on categorized transactions. Categories should exist and have transactions before building the budget math.

### Phase 4: Intelligence Layer

14. **Categorization rules engine** -- Rule CRUD, matching, specificity scoring, retroactive application.
15. **Transfer detection** -- Auto-suggest matching transactions, manual confirm/link.

**Rationale:** Rules and transfers are refinements on top of working transaction + budget flows. They improve data quality but aren't prerequisites for core function.

### Phase 5: Trends + Polish

16. **Balance snapshots** -- Daily recording, historical data accumulation.
17. **Dashboard** -- Net worth trend, top spending categories, summary cards.
18. **Spending trends** -- Category-level spending over time charts.
19. **Backup automation** -- launchd plist, post-sync backup trigger.

**Rationale:** Trends need historical data, which accumulates over time. Build the recording mechanism early (Phase 1 snapshots in sync), but defer visualization until core features work.

### Build Order Dependencies

```
Schema ─────> DAOs ─────> Services ─────> tRPC Routers ─────> React UI
                |              |
                |         SimpleFIN Client
                |              |
                └──── Sync Service ────> Sync UI
                                            |
                            Categories ─────> Budget Engine ──> Budget UI
                                |                                  |
                            Rules Engine                    Dashboard/Trends
                                |
                        Transfer Detection
```

## Scalability Considerations

This is a single-user app on a local server. Scalability means "does it stay fast as data grows over years?"

| Concern | Year 1 (~5K txns) | Year 5 (~25K txns) | Year 10+ (~50K+ txns) |
|---------|--------------------|--------------------|----------------------|
| Query speed | No concern, SQLite handles millions of rows | Add indexes on date, category_id, account_id | Consider archiving old snapshots |
| DB file size | < 10 MB | < 50 MB | < 100 MB -- still trivial for SQLite |
| Sync speed | Milliseconds | Milliseconds | Milliseconds -- batch inserts are fast |
| Backup size | Trivial | Trivial | Still under iCloud limits |
| Budget calculations | Instant | Instant | Index on transactions(date, category_id) keeps it fast |

**Bottom line:** SQLite handles this workload without any optimization for the foreseeable future. Do not prematurely optimize. Add indexes only when queries are measurably slow.

### Indexes to Create from Day 1

```sql
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_dedup ON transactions(dedup_hash);
CREATE INDEX idx_budget_month ON budget_allocations(month);
CREATE INDEX idx_snapshots_date ON balance_snapshots(account_id, date);
```

These are cheap to maintain and will keep common queries fast from the start.

## Sources

- [Actual Budget Database Documentation](https://actualbudget.org/docs/contributing/project-details/database/) -- local-first SQLite architecture, views pattern (HIGH confidence)
- [Budget App Database Schema Design](https://www.imade-athing.com/things/software/budget-app/2020/04/28/beginning-budget-app-database.html) -- envelope budgeting schema with accounts, categories, transactions, budget tables (MEDIUM confidence)
- [tRPC Official Documentation](https://trpc.io/) -- router/procedure patterns, Express adapter, Zod integration (HIGH confidence)
- [Marmelab tRPC + React + SQLite Demo](https://github.com/marmelab/trpc-react-sqlite-demo) -- reference implementation of tRPC with React frontend and Express backend (MEDIUM confidence)
- [Better Stack tRPC Guide](https://betterstack.com/community/guides/scaling-nodejs/trpc-explained/) -- tRPC architecture patterns with Express (MEDIUM confidence)
