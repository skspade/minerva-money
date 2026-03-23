# Phase 9: Dashboard and Reporting - Research

**Researched:** 2026-03-22
**Domain:** Data visualization, SQL aggregation, React charting
**Confidence:** HIGH

## Summary

Phase 9 builds a reporting service with SQL aggregation queries and a charting UI using Recharts, plus a dashboard landing page. The codebase already has all the prerequisite data: `balance_snapshots` for net worth, `transactions` with `category_id` for spending, `transfer_links` for exclusion, and `budget_allocations`/`getBudgetSummary` for budget progress. The reporting service follows the established pattern of service functions in a feature directory accepting `db: Database.Database`.

Recharts is a mature React charting library using declarative JSX components (`PieChart`, `BarChart`, `LineChart`) with `ResponsiveContainer` for responsive sizing. It composes well with Tailwind layouts and requires no additional configuration beyond `npm install recharts`.

**Primary recommendation:** Build reports-service.ts with three pure SQL aggregation functions, wire them through a reportsRouter, then build the UI in three layers: ReportsPage (full charts with date range), DashboardPage (summary widgets calling the same endpoints), and navigation updates.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- All chart data loads from SQL aggregations -- no row-level hydration for trend calculations
- Spending by category query: GROUP BY category_id with SUM(amount), excluding confirmed transfers, includes both unsplit and split transactions (dual-query pattern from getSpentForCategory)
- Spending over time query: monthly aggregation SUM(amount) WHERE amount < 0 grouped by strftime('%Y-%m', date), excluding confirmed transfers
- Net worth query: SELECT date, SUM(balance) FROM balance_snapshots GROUP BY date ORDER BY date
- New reportsRouter with procedures: spendingByCategory, spendingOverTime, netWorth
- spendingByCategory accepts { startDate, endDate }, returns { categoryId, categoryName, groupName, total }[]
- spendingOverTime accepts { startDate, endDate }, returns { period, total }[]
- netWorth accepts { startDate?, endDate? }, returns { date, total }[]
- Use Recharts for all charts (explicitly named in roadmap)
- Spending by category: pie chart default with toggle to bar chart
- Spending over time: line chart with month labels
- Net worth: line chart with date labels
- Dashboard at / route (replaces AccountsPage as index)
- Dashboard shows four widgets: account balances, top spending categories, budget progress, sync status
- Date range picker uses two native HTML date inputs
- Default date range: current month start to today
- Net worth defaults to showing all available data
- Reports page at /reports with full charting
- Service layer in packages/server/src/reports/
- Dashboard widgets reuse existing tRPC queries (accounts.list, budget.summary, reports.spendingByCategory)

### Claude's Discretion
- Exact Recharts chart colors, legend placement, and animation configuration
- Internal component decomposition within DashboardPage and ReportsPage
- Whether spending-over-time chart includes a comparison line for the prior period
- Exact widget sizing ratios within the dashboard grid
- Whether the pie chart shows percentages, absolute values, or both in labels
- Loading skeleton vs spinner choice for chart containers
- Whether net worth chart shows individual account lines or only the aggregate total

### Deferred Ideas (OUT OF SCOPE)
- Income vs expense reports (v2 -- ADVR-01)
- Cash flow reports (v2 -- ADVR-02)
- Year-over-year spending comparisons (v2 -- ADVR-03)
- CSV export of transaction data (v2 -- EXPT-01)
- Interactive chart drill-down from category to individual transactions
- Budget allocation recommendations based on spending history
- Customizable dashboard widget layout or widget visibility toggles
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCT-01 | User can view all linked accounts with current balances on the dashboard | Dashboard account balances widget consumes existing `accounts.list` tRPC query; accounts table has id, name, institution, type, balance, last_synced |
| REPT-01 | User can view spending by category as pie/bar charts, filterable by date range | Reports service spendingByCategory SQL aggregation with dual-query pattern (unsplit + split), transfer exclusion; Recharts PieChart/BarChart with toggle; date range inputs |
| REPT-02 | User can view spending trends over time as line charts showing month-over-month patterns | Reports service spendingOverTime monthly aggregation query; Recharts LineChart with month labels on XAxis |
| REPT-03 | User can view net worth trend as a line chart over time | Reports service netWorth query from balance_snapshots table (UNIQUE on account_id, date, indexed); Recharts LineChart with date labels |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.x (latest) | React charting (pie, bar, line) | Declarative JSX components, SVG-based, works with React 19, widely adopted |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ResponsiveContainer | (recharts) | Responsive chart sizing | Wrap every chart for fluid width |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | chart.js + react-chartjs-2 | Canvas-based, more performant for large datasets but less React-idiomatic |
| recharts | visx | Lower-level D3 primitives, more control but more code |

**Installation:**
```bash
cd packages/client && npm install recharts
```

## Architecture Patterns

### Recommended Project Structure
```
packages/server/src/reports/
├── reports-service.ts       # SQL aggregation functions
└── reports-service.test.ts  # Unit tests

packages/client/src/pages/
├── DashboardPage.tsx        # Landing page with widgets
└── ReportsPage.tsx          # Full charting with date range
```

### Pattern 1: SQL Aggregation Service (no ORM)
**What:** Pure SQL queries using better-sqlite3 prepare/all pattern
**When to use:** All reporting queries
**Example:**
```typescript
export function getSpendingByCategory(
  db: Database.Database,
  startDate: string,
  endDate: string,
): { categoryId: number; categoryName: string; groupName: string; total: number }[] {
  // Dual query: unsplit transactions + split transactions
  // Both exclude confirmed transfers via NOT EXISTS subquery
  // Return absolute values (Math.abs) for display
}
```

### Pattern 2: tRPC Router Composition
**What:** New reportsRouter added to appRouter, following existing pattern
**When to use:** All new API endpoints
**Example:**
```typescript
const reportsRouter = router({
  spendingByCategory: publicProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(({ ctx, input }) => {
      return getSpendingByCategory(ctx.db, input.startDate, input.endDate);
    }),
});
// Add to appRouter: reports: reportsRouter
```

### Pattern 3: Recharts Declarative Composition
**What:** Compose charts from JSX components with ResponsiveContainer wrapper
**When to use:** All chart rendering
**Example:**
```tsx
<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie data={data} dataKey="total" nameKey="categoryName" cx="50%" cy="50%" outerRadius={120} label>
      {data.map((entry, index) => (
        <Cell key={entry.categoryId} fill={COLORS[index % COLORS.length]} />
      ))}
    </Pie>
    <Tooltip formatter={(value) => formatCurrency(value as number)} />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

### Pattern 4: Dashboard Widget Cards
**What:** Reuse existing card pattern (bg-white rounded-lg border border-gray-200) with widget-specific content
**When to use:** All dashboard widgets
**Example from BudgetPage:**
```tsx
<div className="p-4 bg-white rounded-lg border border-gray-200">
  <div className="text-sm text-gray-500 uppercase tracking-wide font-medium mb-1">Widget Title</div>
  {/* Widget content */}
</div>
```

### Anti-Patterns to Avoid
- **Row-level hydration for charts:** Never SELECT * FROM transactions and aggregate in JS. Always use SQL GROUP BY/SUM.
- **Separate dashboard endpoints:** Don't create dashboard-specific queries. Reuse reports procedures with current-month parameters.
- **Hard-coded chart dimensions:** Always use ResponsiveContainer, never fixed width/height on chart components.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pie/bar/line charts | Custom SVG rendering | Recharts components | Animation, tooltips, legends, responsive sizing built-in |
| Responsive charts | Window resize listeners | ResponsiveContainer | Uses ResizeObserver, handles all edge cases |
| Currency formatting in tooltips | Inline formatting | formatCurrency from lib/format.ts | Already exists, consistent with rest of app |
| Date period math | Custom date parsing | Reuse getCurrentPeriod/formatPeriodDisplay patterns from BudgetPage | Already proven in the codebase |

## Common Pitfalls

### Pitfall 1: ResponsiveContainer needs a sized parent
**What goes wrong:** Chart renders at 0x0 because ResponsiveContainer inherits from parent
**Why it happens:** Parent div has no explicit height
**How to avoid:** Always wrap ResponsiveContainer in a div with explicit height (e.g., `style={{ height: 300 }}` or Tailwind `h-72`)
**Warning signs:** Chart is invisible or console warnings about 0 dimensions

### Pitfall 2: Recharts data must be plain objects
**What goes wrong:** Chart doesn't render or shows wrong data
**Why it happens:** Passing class instances or nested objects as data
**How to avoid:** Ensure tRPC response is serialized to plain objects (which it is by default)

### Pitfall 3: Transfer exclusion in aggregation queries
**What goes wrong:** Transfers inflate spending totals
**Why it happens:** Forgetting the NOT EXISTS (transfer_links) subquery
**How to avoid:** Copy the exact transfer exclusion pattern from getSpentForCategory in budget-service.ts
**Warning signs:** Spending totals seem doubled or include transfer amounts

### Pitfall 4: Split transaction handling
**What goes wrong:** Split transactions counted twice or not at all
**Why it happens:** Not using the dual-query pattern (unsplit + split)
**How to avoid:** Query unsplit transactions (no splits exist) separately from transaction_splits, then combine. Pattern established in getSpentForCategory.

### Pitfall 5: Integer cents in chart labels
**What goes wrong:** Chart shows "150000" instead of "$1,500.00"
**Why it happens:** Forgetting to use formatCurrency in Tooltip formatter
**How to avoid:** Always pass formatCurrency to Tooltip formatter prop and custom labels

## Code Examples

### Spending by Category SQL (dual-query with transfer exclusion)
```typescript
// Unsplit transactions for all categories
const unsplit = db.prepare(`
  SELECT t.category_id, c.name AS category_name, cg.name AS group_name,
    COALESCE(SUM(ABS(t.amount)), 0) AS total
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN category_groups cg ON c.group_id = cg.id
  WHERE t.date >= ? AND t.date < ?
    AND t.amount < 0
    AND t.category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
    AND NOT EXISTS (
      SELECT 1 FROM transfer_links tl
      WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1
    )
  GROUP BY t.category_id
`).all(startDate, endDate);

// Split transactions
const splits = db.prepare(`
  SELECT ts.category_id, c.name AS category_name, cg.name AS group_name,
    COALESCE(SUM(ABS(ts.amount)), 0) AS total
  FROM transaction_splits ts
  JOIN transactions t ON ts.transaction_id = t.id
  LEFT JOIN categories c ON ts.category_id = c.id
  LEFT JOIN category_groups cg ON c.group_id = cg.id
  WHERE t.date >= ? AND t.date < ?
    AND ts.amount < 0
    AND NOT EXISTS (
      SELECT 1 FROM transfer_links tl
      WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1
    )
  GROUP BY ts.category_id
`).all(startDate, endDate);
// Merge unsplit + splits by categoryId
```

### Net Worth Query
```typescript
const rows = db.prepare(`
  SELECT date, SUM(balance) AS total
  FROM balance_snapshots
  WHERE date >= ? AND date <= ?
  GROUP BY date
  ORDER BY date ASC
`).all(startDate, endDate);
```

### Monthly Spending Over Time Query
```typescript
const rows = db.prepare(`
  SELECT strftime('%Y-%m', t.date) AS period, COALESCE(SUM(ABS(t.amount)), 0) AS total
  FROM transactions t
  WHERE t.date >= ? AND t.date < ?
    AND t.amount < 0
    AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
    AND NOT EXISTS (
      SELECT 1 FROM transfer_links tl
      WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1
    )
  GROUP BY strftime('%Y-%m', t.date)
  ORDER BY period ASC
`).all(startDate, endDate);
// Also query splits and merge by period
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts 1.x class components | Recharts 2.x functional/hooks | 2022 | Use functional component patterns |
| Fixed-size charts | ResponsiveContainer standard | Recharts 2.x | Always wrap in ResponsiveContainer |

## Open Questions

1. **Recharts version compatibility with React 19**
   - What we know: Recharts 2.x is widely used with React 18. The project uses React 19.
   - What's unclear: Whether latest recharts has any React 19 incompatibilities
   - Recommendation: Install latest recharts, test basic render. If issues, pin to last known working version.

## Sources

### Primary (HIGH confidence)
- Context7 /recharts/recharts - PieChart, BarChart, LineChart, ResponsiveContainer, Tooltip, Cell patterns
- Codebase: packages/server/src/budget/budget-service.ts - getSpentForCategory dual-query pattern, transfer exclusion SQL
- Codebase: packages/server/migrations/001-initial-schema.sql - balance_snapshots table schema
- Codebase: packages/server/src/sync/trpc-router.ts - appRouter composition, router/publicProcedure patterns
- Codebase: packages/client/src/pages/BudgetPage.tsx - UI patterns, card layout, period navigation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Recharts explicitly chosen in context, verified via Context7
- Architecture: HIGH - All patterns exist in codebase, extending established conventions
- Pitfalls: HIGH - Derived from known SQL patterns and Recharts documentation

**Research date:** 2026-03-22
**Valid until:** 2026-04-22
