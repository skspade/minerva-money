# Phase 7: Budget Engine - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

The envelope budgeting system correctly allocates money to categories each month, handles rollovers and overspending, and auto-funds on the pay schedule -- all server-side with unit-tested math. This phase delivers: default allocation CRUD per category, monthly budget period management (YYYY-MM format), twice-monthly auto-funding via croner on the 15th and last day, rollover logic (positive balances forward, overspending deducts from available-to-budget), manual override of allocations, and a budget summary tRPC query returning allocated/spent/available per category as integer cents. No UI is built in this phase -- Phase 8 covers the budget grid.

</domain>

<decisions>
## Implementation Decisions

### Budget Period Model
- Budget periods are represented as `YYYY-MM` strings (e.g., `"2026-03"`) matching the `period` TEXT column on the existing `budget_allocations` table (from 001-initial-schema.sql)
- The `budget_allocations` table already exists with columns: `id`, `category_id`, `period`, `amount` (INTEGER cents), `is_default`, `created_at`, `updated_at`, and a UNIQUE constraint on `(category_id, period)` (from 001-initial-schema.sql)
- A default allocation is a row where `is_default = 1` and `period` is a sentinel value like `"default"` (Claude's Decision: the existing `is_default` column supports this; using a sentinel period value keeps defaults in the same table without requiring a separate table, and the UNIQUE constraint on (category_id, period) prevents duplicate defaults)
- Monthly allocations are rows where `is_default = 0` and `period` is a `YYYY-MM` value (from schema design)

### Default Allocation CRUD
- User can set a default monthly allocation amount for any category (from BUDG-05 and success criteria 1)
- Setting a default upserts a row with `is_default = 1, period = 'default'` for that category (Claude's Decision: upsert via INSERT OR REPLACE on the UNIQUE constraint handles both create and update in a single operation)
- Getting defaults returns all categories with their default amount (0 if no default set) (from success criteria 2 -- "or zero if no default set")
- Deleting a default removes the row, effectively resetting to zero (Claude's Decision: absence of a default row is equivalent to a zero default, keeping the table sparse)

### Auto-Funding Schedule
- On the 15th and last day of each month, budget allocations are auto-populated from defaults (from BUDG-06 and success criteria 2)
- Use `croner` package for scheduling, following the established pattern from `sync-scheduler.ts` (from established pattern)
- Two cron jobs: one for the 15th (`0 0 1 15 * *`), one for the last day of month (Claude's Decision: croner supports `L` for last day of month via `0 0 1 L * *`; if not, run on the 28th-31st and check if it is actually the last day)
- Auto-funding is idempotent: if allocations already exist for the period, they are not overwritten (from success criteria 5 -- manual overrides must persist)
- Auto-populate inserts allocation rows for all categories that have a default, using `INSERT OR IGNORE` on the UNIQUE `(category_id, period)` constraint (Claude's Decision: INSERT OR IGNORE naturally preserves any manually set allocations since they already occupy the UNIQUE slot)
- Categories with no default set get zero allocation (no row inserted) (from success criteria 2 -- "or zero if no default set")
- The funding schedule splits the default amount in half: each paycheck funds 50% of the monthly default (from PROJECT.md Context -- "bi-monthly, equal split")

### Half-Allocation Funding Logic
- Each auto-fund event (15th and last day) allocates half the default amount for that category (from PROJECT.md -- "Pay schedule: bi-monthly (15th and last day of month), equal split")
- First funding event of the month (15th): inserts rows with `amount = floor(default / 2)` for all categories with defaults (Claude's Decision: floor ensures integer cents math is deterministic; the rounding cent goes to the second half)
- Second funding event (last day): sets amount to the full default value by updating `amount = default_amount` for categories not manually overridden (Claude's Decision: setting to full default on the second pass avoids rounding accumulation -- the second half is `default - floor(default/2)`)
- A flag or column tracks whether the first or second funding has occurred for a given period (Claude's Decision: track via a new `funding_step` INTEGER column on `budget_allocations` -- 0 = unfunded, 1 = first half funded, 2 = fully funded; this makes idempotency checks straightforward)

### Manual Override
- User can manually override any auto-populated allocation amount at any time (from BUDG-07 and success criteria 5)
- Override is an upsert on `budget_allocations` for the given `(category_id, period)` (Claude's Decision: same INSERT OR REPLACE pattern used elsewhere; setting the amount directly regardless of auto-populated value)
- Manual overrides are not reverted by subsequent auto-funding runs because INSERT OR IGNORE skips existing rows (from auto-funding idempotency decision above)

### Rollover Logic
- At month end, positive envelope balances roll forward into the next month's starting balance (from BUDG-03 and success criteria 3)
- Overspent categories reduce next month's available-to-budget total, not the category allocation (from BUDG-04 and success criteria 4)
- Rollover is computed, not stored: the budget summary query calculates rollover by summing all prior months' (allocated - spent) for each category (Claude's Decision: computed rollover avoids a separate rollover table and ensures the math is always consistent with actual allocation and spending data; this is the YNAB approach)
- "Spent" for a category in a month = sum of transaction amounts where `category_id = X` and `date` falls within the month, excluding confirmed transfers (from CATG-09 exclusion pattern)
- Split transactions contribute their split amount to the split's category, not the parent transaction's category (Claude's Decision: splits already have per-category amounts in `transaction_splits`; summing from that table is consistent with how splits work)
- Available for a category in a month = allocated + rollover - spent, where rollover = sum of (allocated - spent) for all prior months for that category (Claude's Decision: this is the standard envelope formula; positive rollover means savings, negative rollover means past overspending)

### Available-to-Budget Calculation
- Available-to-budget = total income for the period - total allocated across all categories (Claude's Decision: this is the core YNAB "money available to assign" concept)
- Income is defined as the sum of positive (credit) transaction amounts for the month, excluding confirmed transfers (Claude's Decision: credits represent income/inflow; excluding transfers prevents double-counting internal movements)
- Overspent categories from the prior month reduce this period's available-to-budget (from BUDG-04 and success criteria 4)
- The overspending deduction is: sum of negative category balances (where allocated + rollover - spent < 0) from the prior month (Claude's Decision: only negative balances are deducted; this matches the requirement that overspending reduces available-to-budget, not category allocations)

### Budget Service
- Service layer functions in a new `packages/server/src/budget/` directory (Claude's Decision: follows established feature-based directory pattern from sync/, categories/, rules/, transfers/)
- Service functions accept `db: Database.Database` as first parameter (from established pattern)
- Core functions: `setDefaultAllocation(db, categoryId, amount)`, `getDefaults(db)`, `setAllocation(db, categoryId, period, amount)`, `autoFundPeriod(db, period, step)`, `getBudgetSummary(db, period)` (Claude's Decision: maps to each requirement and success criterion)
- All money values are integer cents throughout (from INFR-04 and success criteria 6)

### Budget tRPC Procedures
- New `budgetRouter` with procedures: `defaults.list`, `defaults.set`, `allocations.byMonth`, `allocations.set`, `summary` (Claude's Decision: maps to the API surface needed by Phase 8 UI)
- `summary` returns per-category data: `{ categoryId, categoryName, groupName, allocated, spent, available, rollover }` all as integer cents (from success criteria 6)
- `summary` also returns the top-level available-to-budget figure (from Phase 8 success criteria -- preparing the data contract)
- Add `budgetRouter` to `appRouter` as `budget: budgetRouter` (from established tRPC router composition pattern)

### Database Migration
- New migration (005) adds `funding_step INTEGER NOT NULL DEFAULT 0` column to `budget_allocations` (Claude's Decision: tracks auto-funding progress per allocation row for idempotency; no other schema changes needed since the base table already exists)

### Testing Strategy
- TDD for the budget service: default CRUD, auto-funding half-split math, rollover computation, overspending deduction, available-to-budget calculation (Claude's Decision: the rollover and overspending math is the core algorithmic complexity and must be thoroughly tested)
- Test cases for: set/get defaults, first-half funding at 15th, second-half funding at month end, rollover of positive balance, overspending reducing next month's available-to-budget, manual override persists through auto-funding, zero default produces no allocation, split transaction spending attribution
- Edge cases: odd-cent defaults (e.g., $15.01 = 1501 cents, half = 750 + 751), first month with no prior history, category with no transactions
- Vitest, consistent with all prior phases (established pattern)

### Claude's Discretion
- Internal naming of budget service functions and helper utilities
- Exact cron expression syntax for last-day-of-month scheduling
- Whether `getBudgetSummary` uses a single complex SQL query or multiple simpler queries composed in TypeScript
- Internal structure of the budget scheduler (separate file vs integrated with sync scheduler)
- Whether the funding_step column uses 0/1/2 or a different encoding
- Order of operations within the auto-funding function

</decisions>

<specifics>
## Specific Ideas

- The `budget_allocations` table already exists in `001-initial-schema.sql` with the exact schema needed for monthly allocations: `category_id`, `period`, `amount`, `is_default`, and UNIQUE on `(category_id, period)` -- no new table required
- Pay schedule is bi-monthly on 15th and last day, with equal split -- this is explicitly stated in PROJECT.md Context and directly maps to BUDG-06
- The `sync-scheduler.ts` file provides the established croner pattern: `new Cron('expression', callback)` with `startSyncScheduler(db)` and `stopSyncScheduler()` lifecycle functions -- the budget scheduler should follow the same pattern
- Confirmed transfers must be excluded from spending calculations using the same LEFT JOIN pattern from `transactions.list` in `trpc-router.ts` (line 183-187): checking `transfer_links` where `confirmed = 1`
- The `transaction_splits` table (from migration 002) stores per-category split amounts -- budget spending queries must sum from both `transactions.amount` (for unsplit transactions) and `transaction_splits.amount` (for split transactions)
- All amounts in the system are already integer cents via the `Cents` branded type and `toCents()` helper in `packages/shared/src/types.ts`
- The existing `listGroupsWithCategories()` in `category-service.ts` returns all category groups with their categories -- useful for building the budget summary response with group/category names

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `budget_allocations` table: already in schema with all needed columns for monthly allocations and defaults
- `listGroupsWithCategories()` in `packages/server/src/categories/category-service.ts`: returns grouped categories for building budget summary responses
- `appRouter` in `packages/server/src/sync/trpc-router.ts`: extend with `budget` sub-router
- `router` and `publicProcedure` from `packages/server/src/sync/trpc.ts`: tRPC primitives for new procedures
- `Cron` from `croner` package: already installed and used in `sync-scheduler.ts` for scheduled jobs
- `createDatabase()` in `packages/server/src/db/connection.ts`: for test database setup
- `Cents` type and `toCents()` in `packages/shared/src/types.ts`: branded type for money values

### Established Patterns
- Feature-based server directory structure: `packages/server/src/sync/`, `packages/server/src/categories/`, `packages/server/src/rules/`, `packages/server/src/transfers/` -- create `packages/server/src/budget/`
- tRPC router composition: sub-routers nested under `appRouter` via `router({ sync, accounts, transactions, categories, rules, transfers })` -- add `budget: budgetRouter`
- Service functions accept `db: Database.Database` as first parameter (from category-service.ts, rules-service.ts, transfer-service.ts)
- Croner scheduler pattern: `startXxxScheduler(db)` and `stopXxxScheduler()` lifecycle functions (from sync-scheduler.ts)
- Migrations use sequential numbering: `001`, `002`, `003`, `004` -- next is `005`
- TDD approach with Vitest for service-layer logic

### Integration Points
- `packages/server/src/sync/trpc-router.ts`: the `appRouter` gains a `budget` sub-router
- `packages/server/src/index.ts`: Express server entry point where the budget scheduler will be initialized alongside the sync scheduler
- `packages/server/migrations/`: new `005-budget-funding-step.sql` migration
- `packages/server/src/sync/trpc.ts`: tRPC context provides `db` which is sufficient for all budget operations -- no context extension needed
- `packages/server/src/categories/category-service.ts`: `listGroupsWithCategories()` provides category data for budget summary

</code_context>

<deferred>
## Deferred Ideas

- Budget grid UI with allocated/spent/available columns (Phase 8 -- BUDG-02, BUDG-07)
- Inline allocation editing in the budget grid (Phase 8)
- Available-to-budget header display (Phase 8)
- Month navigation controls (Phase 8)
- Copy budget allocations from a prior month (v2 -- BWRK-01)
- In-app warnings when approaching category budget limits (v2 -- BWRK-02)
- Budget-aware category spending in dashboard reports (Phase 9 -- REPT-01)
- Goal tracking / savings targets via envelope categories (explicitly out of scope per PROJECT.md)

</deferred>

---

*Phase: 07-budget-engine*
*Context gathered: 2026-03-22 via auto-context*
