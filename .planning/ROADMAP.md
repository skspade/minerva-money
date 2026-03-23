# Roadmap: Minerva Money

## Overview

Minerva Money is built in strict dependency order: schema and data integrity decisions are made once and made correctly at the start, then real bank data flows before any UI is built, then transaction viewing validates the sync before budgeting against it, then categories and rules clean up the data, then the budget engine runs on categorized transactions, and finally the dashboard synthesizes everything. Nine phases deliver a complete Monarch Money replacement — each phase leaves the app in a demonstrably better and independently verifiable state than the one before it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffolding, SQLite schema with integer-cent money storage, migration runner, and iCloud backup module (completed 2026-03-22)
- [ ] **Phase 2: SimpleFIN Data Pipeline** - SimpleFIN client with mock fixtures, sync service with layered deduplication, scheduled auto-sync, and sync error logging
- [ ] **Phase 3: Accounts and Transactions UI** - React app shell, account list with balances, transaction list with sort/filter/search, and sync status controls
- [ ] **Phase 4: Category Management** - Category groups and categories CRUD, manual transaction categorization, transaction split across categories, and manual transaction entry
- [ ] **Phase 5: Categorization Rules Engine** - Rules matching on merchant/amount/memo, specificity-based conflict resolution, retroactive application with preview, and auto-apply to future transactions
- [ ] **Phase 6: Transfer Detection** - Auto-suggest transfer pairs from offsetting transactions, manual confirm/link UI, and exclusion of confirmed transfers from reports
- [ ] **Phase 7: Budget Engine** - Monthly envelope allocations, default allocations, twice-monthly auto-funding, rollover math (positive forward, negative deducts from available-to-budget)
- [ ] **Phase 8: Budget UI** - Budget grid showing allocated/spent/available per category, manual allocation overrides, and budget period navigation
- [ ] **Phase 9: Dashboard and Reporting** - Spending by category charts, spending trends over time, net worth trend using balance snapshots, and dashboard landing page

## Phase Details

### Phase 1: Foundation
**Goal**: The project is buildable, the database schema is correct by design, and the backup system is in place before any data is written
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04
**Success Criteria** (what must be TRUE):
  1. Running `npm run dev` starts the Express server and Vite dev server without errors
  2. Running migrations creates all database tables with INTEGER columns for every money value
  3. A backup is written to the iCloud Drive path as an atomic SQLite snapshot, passing PRAGMA integrity_check
  4. Running `npm test` executes the test suite with at least the migration runner and backup module covered
**Plans**: 3 plans (2 waves)

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold: npm workspaces, TypeScript strict, Vite + Express dev servers, ESLint, Vitest (Wave 1)
- [x] 01-02-PLAN.md — SQLite schema + migration runner: all 9 tables, INTEGER cents, dedup constraints, PRAGMA user_version (Wave 2, TDD)
- [x] 01-03-PLAN.md — iCloud Drive backup module: better-sqlite3 .backup(), integrity check, 30-day retention, launchd plist (Wave 2, TDD)

### Phase 2: SimpleFIN Data Pipeline
**Goal**: Real bank transactions flow into the database with correct deduplication, rate-limit safety, and full error observability — before any UI exists
**Depends on**: Phase 1
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, ACCT-02
**Success Criteria** (what must be TRUE):
  1. Triggering a sync populates the accounts and transactions tables with correctly typed data (amounts as integer cents)
  2. Running sync twice with the same fixture data produces no duplicate transactions (dedup enforced at DB level via UNIQUE constraint)
  3. A mock fixture mode prevents any live SimpleFIN API calls during development and testing
  4. The server hard-caps SimpleFIN requests at 20/day per account, reserving 4 for manual syncs
  5. Sync failures are written to the sync_log table with timestamp, error message, and account context
  6. Balance snapshots are recorded per account after every successful sync
**Plans**: 4 plans (3 waves)

Plans:
- [ ] 02-01-PLAN.md — SimpleFIN HTTP client: typed response normalization, mock fixture mode, dedup hash generation (Wave 1, TDD)
- [ ] 02-02-PLAN.md — Sync service: layered dedup, INSERT OR IGNORE, rate-limit counter, balance snapshots, sync logging (Wave 2, TDD)
- [ ] 02-03-PLAN.md — Sync scheduler: croner twice-daily auto-sync, post-sync backup trigger (Wave 3)
- [ ] 02-04-PLAN.md — tRPC sync procedures: manual sync trigger, sync status query, Express server wiring (Wave 3)

### Phase 3: Accounts and Transactions UI
**Goal**: Users can see their accounts, balances, and full transaction history in the browser, and control sync from the UI
**Depends on**: Phase 2
**Requirements**: ACCT-01, ACCT-03, ACCT-04, ACCT-05, SYNC-03, SYNC-04
**Success Criteria** (what must be TRUE):
  1. The accounts page lists all synced accounts with current balances; investment accounts show balance only (no transaction drill-down)
  2. The transactions page shows all transactions with columns for date, payee, amount, account, and category
  3. Transactions can be filtered by date range, payee, amount, and category without a page reload
  4. A search box filters transactions by payee or memo text as the user types
  5. The sync status indicator shows last sync time and displays any errors in plain language
  6. Clicking "Sync Now" triggers an immediate sync and updates the status indicator on completion
**Plans**: 4 plans (4 waves)

Plans:
- [ ] 03-01-PLAN.md — React app shell: tRPC client + TanStack Query providers, React Router, Tailwind CSS v4, Layout with navigation (Wave 1)
- [ ] 03-02-PLAN.md — Accounts page: accounts.list tRPC query, grouped account cards, investment balance-only treatment (Wave 2)
- [ ] 03-03-PLAN.md — Transactions page: transactions.list tRPC query, sortable/filterable table, debounced search, category placeholder (Wave 3)
- [ ] 03-04-PLAN.md — Sync controls: SyncStatus indicator, Sync Now button, cache invalidation on sync completion (Wave 4)

### Phase 4: Category Management and Manual Categorization
**Goal**: Users can organize spending into categories, assign categories to transactions by hand, split transactions, and enter manual transactions
**Depends on**: Phase 3
**Requirements**: BUDG-01, CATG-01, CATG-06, TXNR-01
**Success Criteria** (what must be TRUE):
  1. User can create, rename, reorder, and delete category groups and categories
  2. User can click any transaction and assign it a category from a dropdown
  3. User can split a transaction across multiple categories with custom amounts that sum to the transaction total
  4. User can manually enter a transaction with amount, payee, date, category, and account
  5. Category assignments are reflected immediately in the transaction list without a full page reload
**Plans**: 4 plans (3 waves)

Plans:
- [ ] 04-01-PLAN.md — Category service: migration, CRUD, categorization, splits, manual entry (TDD) (Wave 1)
- [ ] 04-02-PLAN.md — Category management UI: groups/categories page with inline rename, drag-to-reorder, delete (Wave 2)
- [ ] 04-03-PLAN.md — Manual categorization UI: category picker on transaction rows, split transaction modal (Wave 2)
- [ ] 04-04-PLAN.md — Manual transaction entry: inline form with validation, dollar-to-cents conversion (Wave 3)

### Phase 5: Categorization Rules Engine
**Goal**: Users can define rules that categorize transactions automatically — retroactively and going forward — with deterministic conflict resolution
**Depends on**: Phase 4
**Requirements**: CATG-02, CATG-03, CATG-04, CATG-05
**Success Criteria** (what must be TRUE):
  1. User can create a rule matching on merchant name (exact or contains), amount range, and/or memo text
  2. After creating a rule, a preview shows all existing transactions it would recategorize before applying
  3. Confirming retroactive application recategorizes all matching historical transactions immediately
  4. All future synced transactions matching any rule are categorized automatically on import
  5. When two rules match the same transaction, the more specific rule wins; ties go to the newer rule — and the transaction detail shows which rule won
**Plans**: TBD

Plans:
- [ ] 05-01: Rules engine service — specificity scoring algorithm, conflict resolution (most-specific wins, ties to newer), rule evaluation on transaction import
- [ ] 05-02: Retroactive rule application — preview diff query, confirm-and-apply mutation, bulk update with single transaction
- [ ] 05-03: Rules management UI — rule list, create/edit form (merchant/amount/memo conditions), specificity explanation display
- [ ] 05-04: Transaction detail — show winning rule name and why it matched, allow manual override

### Phase 6: Transfer Detection
**Goal**: Internal transfers between accounts are identified, confirmed, and excluded from spending totals so reports reflect only real spending
**Depends on**: Phase 5
**Requirements**: CATG-07, CATG-08, CATG-09
**Success Criteria** (what must be TRUE):
  1. After a sync, the app surfaces candidate transfer pairs — transactions with matching amounts on offsetting accounts within a date window — for user review
  2. User can confirm a suggested transfer pair with one click, linking the two transactions
  3. User can manually link any two transactions as a transfer pair without a system suggestion
  4. Confirmed transfers are excluded from all spending totals and category spending reports
  5. User can unlink a confirmed transfer, restoring both transactions to normal spending
**Plans**: TBD

Plans:
- [ ] 06-01: Transfer detection service — offsetting amount matching across accounts, configurable date window, candidate pair generation on post-sync hook
- [ ] 06-02: Transfer management UI — suggested transfers list, confirm/dismiss actions, manual link modal, unlink action on confirmed transfers
- [ ] 06-03: Spending report exclusion — update all spending queries to filter out confirmed transfer transactions

### Phase 7: Budget Engine
**Goal**: The envelope budgeting system correctly allocates money to categories each month, handles rollovers and overspending, and auto-funds on the pay schedule — all server-side with unit-tested math
**Depends on**: Phase 6
**Requirements**: BUDG-02, BUDG-03, BUDG-04, BUDG-05, BUDG-06, BUDG-07
**Success Criteria** (what must be TRUE):
  1. User can set a default monthly allocation amount for any category
  2. On the 15th and last day of each month, budget allocations are auto-populated from defaults (or zero if no default set)
  3. At month end, positive envelope balances roll forward into the next month's starting balance
  4. Overspent categories reduce next month's available-to-budget total, not the category allocation
  5. User can manually override any auto-populated allocation amount at any time
  6. All budget math (allocated, spent, available, rollover) is computed server-side and returned as integer cents
**Plans**: TBD

Plans:
- [ ] 07-01: Budget allocation service — monthly period management (YYYY-MM), default allocation CRUD, available-to-budget calculation
- [ ] 07-02: Rollover logic — positive balance forward, overspending deduction from next month's available-to-budget, unit tests for all boundary scenarios
- [ ] 07-03: Twice-monthly funding scheduler — croner jobs for 15th and last day, idempotent auto-populate from defaults, manual override support
- [ ] 07-04: Budget tRPC procedures — allocations by month, set/override allocation, budget summary (allocated/spent/available per category)

### Phase 8: Budget UI
**Goal**: Users can see and manage the full envelope budget grid — what they allocated, what they spent, and what remains — for any month
**Depends on**: Phase 7
**Requirements**: BUDG-02, BUDG-07
**Success Criteria** (what must be TRUE):
  1. The budget page shows a grid of all categories with allocated, spent, and available columns for the selected month
  2. Available column turns red when a category is overspent
  3. User can click any allocated amount and type a new value to override it; the change saves without leaving the row
  4. User can navigate between months using previous/next controls and see historically accurate data
  5. A top-level "Available to Budget" figure shows unallocated income for the selected month
**Plans**: TBD

Plans:
- [ ] 08-01: Budget grid component — category group accordion, allocated/spent/available columns, overspent highlight, month navigation
- [ ] 08-02: Inline allocation editor — click-to-edit cell, optimistic update, server save with error rollback
- [ ] 08-03: Available-to-budget header — income minus total allocated, real-time update as allocations change

### Phase 9: Dashboard and Reporting
**Goal**: Users have a single landing page showing their financial picture at a glance, and can drill into spending by category and trends over time
**Depends on**: Phase 8
**Requirements**: ACCT-01, REPT-01, REPT-02, REPT-03
**Success Criteria** (what must be TRUE):
  1. The dashboard shows account balances, current month's top spending categories, and a summary of budget progress
  2. User can view a pie or bar chart of spending by category for any date range they select
  3. User can view a line chart of spending over time showing month-over-month patterns
  4. User can view a net worth trend line chart drawn from daily balance snapshots
  5. All charts load from SQL aggregations — no row-level hydration for trend calculations
**Plans**: TBD

Plans:
- [ ] 09-01: Reporting service — spending by category query (date range, exclude transfers), spending over time query (monthly aggregation), net worth query (balance snapshots)
- [ ] 09-02: Spending reports UI — pie/bar chart (Recharts), date range filter, category drill-down
- [ ] 09-03: Trends UI — spending over time line chart, net worth line chart, month labels
- [ ] 09-04: Dashboard landing page — account balances widget, top spending categories widget, budget progress widget, sync status widget

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-03-22 |
| 2. SimpleFIN Data Pipeline | 0/4 | Not started | - |
| 3. Accounts and Transactions UI | 0/4 | Not started | - |
| 4. Category Management | 0/4 | Not started | - |
| 5. Categorization Rules Engine | 0/4 | Not started | - |
| 6. Transfer Detection | 0/3 | Not started | - |
| 7. Budget Engine | 0/4 | Not started | - |
| 8. Budget UI | 0/3 | Not started | - |
| 9. Dashboard and Reporting | 0/4 | Not started | - |
