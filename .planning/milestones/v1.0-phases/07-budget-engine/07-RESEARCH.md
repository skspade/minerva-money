# Phase 7: Budget Engine - Research

**Researched:** 2026-03-22
**Domain:** Envelope budgeting math, scheduled jobs, SQLite query design
**Confidence:** HIGH

## Summary

Phase 7 builds the server-side budget engine: default allocation CRUD, twice-monthly auto-funding with half-split math, rollover computation, overspending deductions, and budget summary queries. The existing `budget_allocations` table from migration 001 provides the foundation. A new migration adds `funding_step` for idempotent auto-funding tracking.

The core algorithmic challenge is the rollover and available-to-budget computation. This is best done as computed values from allocation and transaction history rather than stored state, ensuring consistency. The cron scheduling follows the established `sync-scheduler.ts` pattern using `croner`.

**Primary recommendation:** Build the budget service with pure functions operating on `better-sqlite3`, TDD the math (especially half-split rounding and multi-month rollover chains), and keep the scheduler thin.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Budget periods as `YYYY-MM` strings on existing `budget_allocations` table
- Default allocations use `is_default = 1` with `period = 'default'` sentinel
- Auto-funding on 15th and last day via croner, idempotent with INSERT OR IGNORE
- Each funding event allocates half the default: first half = `floor(default/2)`, second half = `default - floor(default/2)`
- `funding_step` INTEGER column tracks funding progress (0/1/2)
- Rollover is computed, not stored: sum of (allocated - spent) across prior months
- Available-to-budget = total income - total allocated - prior month overspending deduction
- Income = sum of positive transaction amounts excluding confirmed transfers
- Manual overrides persist through auto-funding via INSERT OR IGNORE
- Service in `packages/server/src/budget/` directory
- New migration 005 for `funding_step` column

### Claude's Discretion
- Internal naming of budget service functions and helper utilities
- Exact cron expression syntax for last-day-of-month scheduling
- Whether `getBudgetSummary` uses a single complex SQL query or multiple simpler queries
- Internal structure of the budget scheduler (separate file vs integrated)
- Whether funding_step uses 0/1/2 or different encoding
- Order of operations within auto-funding function

### Deferred Ideas (OUT OF SCOPE)
- Budget grid UI (Phase 8)
- Inline allocation editing (Phase 8)
- Available-to-budget header display (Phase 8)
- Month navigation controls (Phase 8)
- Copy budget from prior month (v2 -- BWRK-01)
- Budget limit warnings (v2 -- BWRK-02)
- Budget-aware spending reports (Phase 9)
- Goal tracking / savings targets (out of scope)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUDG-02 | User can allocate money to envelope categories for each monthly period | Budget service `setAllocation()` + tRPC `allocations.set` procedure |
| BUDG-03 | Unspent envelope balances roll forward to next month automatically | Computed rollover in `getBudgetSummary()` via cumulative (allocated - spent) |
| BUDG-04 | Overspent categories deduct from next month's available-to-budget | Available-to-budget calculation subtracts prior month negative balances |
| BUDG-05 | User can set default monthly allocation per category | `setDefaultAllocation()` upserts `is_default=1, period='default'` row |
| BUDG-06 | App auto-populates allocations on 15th and last day using defaults | Croner scheduler + `autoFundPeriod()` with half-split math |
| BUDG-07 | User can manually override any auto-populated allocation | `setAllocation()` upserts on UNIQUE(category_id, period), auto-fund skips via INSERT OR IGNORE |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (installed) | Database operations | Already used throughout project |
| croner | (installed) | Cron scheduling | Already used in sync-scheduler.ts |
| @trpc/server | (installed) | API procedures | Already used for all server routes |
| zod | (installed) | Input validation | Already used for tRPC input schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (installed) | Testing | All unit tests for budget math |

**No new packages needed.** Everything required is already installed.

## Architecture Patterns

### Project Structure
```
packages/server/src/budget/
  budget-service.ts        # All budget business logic
  budget-service.test.ts   # TDD tests for budget math
  budget-scheduler.ts      # Croner jobs for auto-funding
  budget-scheduler.test.ts # Scheduler tests
```

### Pattern 1: Service Function Signature
**What:** All service functions take `db: Database.Database` as first parameter
**When to use:** Every budget service function
**Example:**
```typescript
import type Database from 'better-sqlite3';

export function setDefaultAllocation(db: Database.Database, categoryId: number, amount: number): void {
  db.prepare(`
    INSERT INTO budget_allocations (category_id, period, amount, is_default)
    VALUES (?, 'default', ?, 1)
    ON CONFLICT(category_id, period) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')
  `).run(categoryId, amount);
}
```

### Pattern 2: Upsert via ON CONFLICT
**What:** INSERT OR REPLACE / ON CONFLICT for idempotent writes
**When to use:** Default setting, allocation setting, auto-funding
**Why:** The UNIQUE(category_id, period) constraint enables clean upsert patterns

### Pattern 3: Computed Values Over Stored State
**What:** Rollover and available amounts computed from allocation + transaction history
**When to use:** Budget summary queries
**Why:** Avoids stale data, no separate rollover table to maintain, always consistent

### Pattern 4: Scheduler Lifecycle
**What:** `startBudgetScheduler(db)` / `stopBudgetScheduler()` matching sync-scheduler pattern
**When to use:** Server startup/shutdown in index.ts

### Anti-Patterns to Avoid
- **Storing rollover amounts:** Computed rollover avoids data inconsistency when transactions are recategorized or allocations changed retroactively
- **Running auto-fund on every request:** Use scheduled cron, not request-triggered logic
- **Floating-point money:** All amounts are integer cents; division for half-split must use `Math.floor()`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom timer logic | croner `new Cron()` | Handles timezone, DST, month boundaries |
| Last day of month | Manual day calculation | croner `L` flag or `new Date(year, month + 1, 0).getDate()` | Leap years, varying month lengths |
| Input validation | Manual checks | zod schemas in tRPC | Consistent with project patterns |

## Common Pitfalls

### Pitfall 1: Integer Division Rounding
**What goes wrong:** Half of an odd-cent amount loses a cent (1501 / 2 = 750.5)
**Why it happens:** JavaScript division produces floats
**How to avoid:** First half = `Math.floor(default / 2)`, second half = `default - Math.floor(default / 2)`. This guarantees first + second = default.
**Warning signs:** Budget summary showing 1 cent less than allocated

### Pitfall 2: Auto-Fund Overwriting Manual Overrides
**What goes wrong:** Auto-fund replaces a manually set allocation
**Why it happens:** Using INSERT OR REPLACE instead of INSERT OR IGNORE for auto-funding
**How to avoid:** Auto-fund uses INSERT OR IGNORE -- if a row already exists for (category_id, period), it is skipped entirely. Manual overrides use ON CONFLICT DO UPDATE.
**Warning signs:** User-set allocations reverting after the 15th or month end

### Pitfall 3: Rollover Computation Performance
**What goes wrong:** Computing all-time rollover for every category gets slow
**Why it happens:** Summing all historical months for every category on every request
**How to avoid:** For v1, keep it simple -- the query scans budget_allocations + transactions filtered by category and date. With SQLite and realistic data volumes (months, not decades), this is fast enough. Optimize only if profiling shows issues.

### Pitfall 4: Transfer Exclusion in Spending
**What goes wrong:** Confirmed transfers counted as spending, inflating budget usage
**Why it happens:** Forgetting to exclude confirmed transfers from spending sums
**How to avoid:** LEFT JOIN transfer_links and filter `WHERE tl.confirmed IS NULL OR tl.confirmed = 0`, matching the existing pattern in trpc-router.ts lines 183-187

### Pitfall 5: Split Transaction Double-Counting
**What goes wrong:** A split transaction's parent amount AND split amounts both counted
**Why it happens:** Summing from `transactions` table without checking for splits
**How to avoid:** For transactions with splits, sum from `transaction_splits` by category. For unsplit transactions, use `transactions.amount`. The query must handle both cases.

### Pitfall 6: Last Day of Month Cron
**What goes wrong:** Cron fires on the 28th, 29th, 30th, 31st -- or doesn't fire at all on shorter months
**Why it happens:** No standard cron expression for "last day of month"
**How to avoid:** Check if croner supports `L` day-of-month. If not, schedule for the 28th and check `new Date(year, month + 1, 0).getDate() === today` to only proceed on the actual last day.

## Code Examples

### Budget Summary Query (per-category)
```typescript
// Compute allocated, spent, and rollover for a given period
function getCategoryBudget(db: Database.Database, categoryId: number, period: string) {
  // Allocated for this period
  const allocation = db.prepare(`
    SELECT COALESCE(amount, 0) AS amount
    FROM budget_allocations
    WHERE category_id = ? AND period = ? AND is_default = 0
  `).get(categoryId, period) as { amount: number } | undefined;

  const allocated = allocation?.amount ?? 0;

  // Spent: sum of transactions in this period's month, excluding confirmed transfers
  // Handle split transactions separately
  const [year, month] = period.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-31`; // SQLite BETWEEN is inclusive, 31 is safe

  const spent = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN (SELECT COUNT(*) FROM transaction_splits ts WHERE ts.transaction_id = t.id) > 0
        THEN (SELECT COALESCE(SUM(ts.amount), 0) FROM transaction_splits ts WHERE ts.transaction_id = t.id AND ts.category_id = ?)
        ELSE CASE WHEN t.category_id = ? THEN t.amount ELSE 0 END
      END
    ), 0) AS total
    FROM transactions t
    WHERE t.date BETWEEN ? AND ?
    AND t.amount < 0
    AND NOT EXISTS (
      SELECT 1 FROM transfer_links tl
      WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id)
      AND tl.confirmed = 1
    )
  `).get(categoryId, categoryId, startDate, endDate) as { total: number };

  // Rollover: sum of (allocated - spent) for all prior periods
  // This is a simplified example; actual implementation should query all prior periods
  return { allocated, spent: Math.abs(spent.total), rollover: 0 /* computed from history */ };
}
```

### Auto-Fund Implementation Pattern
```typescript
export function autoFundPeriod(db: Database.Database, period: string, step: 1 | 2): number {
  const defaults = db.prepare(`
    SELECT category_id, amount FROM budget_allocations
    WHERE is_default = 1 AND period = 'default'
  `).all() as { category_id: number; amount: number }[];

  let funded = 0;
  for (const def of defaults) {
    const halfAmount = step === 1
      ? Math.floor(def.amount / 2)
      : def.amount; // Second step sets to full amount

    const result = db.prepare(`
      INSERT OR IGNORE INTO budget_allocations (category_id, period, amount, is_default, funding_step)
      VALUES (?, ?, ?, 0, ?)
    `).run(def.category_id, period, halfAmount, step);

    if (result.changes > 0) funded++;

    // For step 2, update rows that are still at step 1 (not manually overridden)
    if (step === 2) {
      db.prepare(`
        UPDATE budget_allocations
        SET amount = ?, funding_step = 2, updated_at = datetime('now')
        WHERE category_id = ? AND period = ? AND funding_step = 1
      `).run(def.amount, def.category_id, period);
    }
  }
  return funded;
}
```

## Sources

### Primary (HIGH confidence)
- Project codebase: `001-initial-schema.sql` -- budget_allocations table schema
- Project codebase: `sync-scheduler.ts` -- croner scheduling pattern
- Project codebase: `trpc-router.ts` -- transfer exclusion pattern, appRouter composition
- Project codebase: `category-service.ts` -- service function patterns
- Project codebase: `transfer-service.ts` -- service module structure

### Secondary (MEDIUM confidence)
- Croner `L` (last day) support: documented in croner README, needs verification during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in project
- Architecture: HIGH -- follows established project patterns exactly
- Pitfalls: HIGH -- derived from concrete codebase analysis and envelope budgeting domain knowledge

**Research date:** 2026-03-22
**Valid until:** 2026-04-22
