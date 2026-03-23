# Phase 9: Dashboard and Reporting - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users have a single landing page showing their financial picture at a glance, and can drill into spending by category and trends over time. This phase delivers: a reporting service with SQL aggregation queries for spending-by-category, spending-over-time, and net worth trends; a charting UI with Recharts for pie/bar and line charts with date range selection; and a dashboard landing page showing account balances, top spending categories, budget progress summary, and sync status.

</domain>

<decisions>
## Implementation Decisions

### Reporting Service (SQL Aggregations)
- All chart data loads from SQL aggregations -- no row-level hydration for trend calculations (from success criteria 5)
- Spending by category query: `GROUP BY category_id` with `SUM(amount)` for a user-selected date range, excluding confirmed transfers (from REPT-01 and CATG-09 exclusion pattern)
- Spending by category includes both unsplit transactions and transaction_splits amounts, following the same dual-query pattern used in `getSpentForCategory` in `budget-service.ts`
- Spending over time query: monthly aggregation of total spending (`SUM(amount) WHERE amount < 0`) grouped by `strftime('%Y-%m', date)`, excluding confirmed transfers (from REPT-02)
- Net worth query: `SELECT date, SUM(balance) FROM balance_snapshots GROUP BY date ORDER BY date` to produce daily total net worth from existing balance snapshots (from REPT-03 and ACCT-02)
- Service layer functions in a new `packages/server/src/reports/` directory (Claude's Decision: follows established feature-based directory pattern from sync/, budget/, transfers/, etc.)
- Service functions accept `db: Database.Database` as first parameter (from established pattern)

### tRPC Router Structure
- New `reportsRouter` with procedures: `spendingByCategory`, `spendingOverTime`, `netWorth` (Claude's Decision: one procedure per chart type keeps the API surface clean and cache-friendly)
- `spendingByCategory` accepts `{ startDate: string, endDate: string }` and returns `{ categoryId, categoryName, groupName, total }[]` (from REPT-01 -- filterable by date range)
- `spendingOverTime` accepts `{ startDate: string, endDate: string }` and returns `{ period: string, total: number }[]` as monthly aggregations (from REPT-02)
- `netWorth` accepts `{ startDate?: string, endDate?: string }` and returns `{ date: string, total: number }[]` as daily snapshots (from REPT-03)
- Add `reportsRouter` to `appRouter` as `reports: reportsRouter` (from established tRPC router composition pattern)
- Dashboard-specific queries reuse the reports procedures with current-month date range rather than creating separate dashboard endpoints (Claude's Decision: avoids duplicating query logic; the dashboard calls the same endpoints with pre-set parameters)

### Charting Library
- Use Recharts for all charts (from ROADMAP plan 09-02 -- "Recharts" explicitly mentioned)
- Recharts installed as a dependency in `packages/client/` (Claude's Decision: Recharts is React-native, lightweight, and uses SVG -- matches the Tailwind-based custom component approach)
- Spending by category rendered as a pie chart by default with a toggle to bar chart (from REPT-01 -- "pie or bar chart")
- Spending over time rendered as a line chart with month labels on x-axis (from REPT-02)
- Net worth rendered as a line chart with date labels on x-axis (from REPT-03)
- All charts use the `formatCurrency` helper for tooltip and label formatting (from established pattern)

### Date Range Selection
- User can select any date range for spending-by-category and spending-over-time charts (from success criteria 2 and 3)
- Date range picker uses two native HTML date inputs (start and end) consistent with the transactions page filter pattern (Claude's Decision: reuses the existing date filtering UX rather than introducing a new date picker library)
- Default date range: current month start to today (Claude's Decision: most users want to see current month spending at a glance; they can expand as needed)
- Net worth chart defaults to showing all available data points (Claude's Decision: net worth is most useful as a long-term trend without date restriction by default)

### Dashboard Landing Page
- Dashboard is the app's landing page at `/` route (from ROADMAP -- "landing page"; currently `/` maps to AccountsPage)
- Dashboard shows four widgets: account balances, top spending categories, budget progress summary, and sync status (from success criteria 1)
- Account balances widget: list of all accounts with current balances, grouped by type, reusing `accounts.list` tRPC query (from ACCT-01)
- Top spending categories widget: top 5 categories by spend for the current month, using `reports.spendingByCategory` with current month date range (Claude's Decision: top 5 provides a quick glance without overwhelming; full drill-down is on the reports page)
- Budget progress widget: shows total allocated, total spent, and available-to-budget for the current month, using `budget.summary` tRPC query (from success criteria 1 -- "summary of budget progress")
- Sync status widget reuses the existing `SyncStatus` component already in the Layout navbar (Claude's Decision: displaying a more detailed version on the dashboard provides context without duplicating the component logic)
- Each widget links to its detailed page (accounts, reports, budget) for drill-down (Claude's Decision: dashboard is a summary hub; links drive users to full detail pages)

### Dashboard Layout
- Responsive grid layout: 2 columns on desktop, 1 column on mobile (Claude's Decision: personal finance dashboard needs to be scannable; two-column grid balances density and readability)
- Account balances and budget progress in the top row; top spending categories and sync status in the second row (Claude's Decision: money overview first, then activity details -- prioritizes the most actionable information)
- Each widget is a card with white background, border, and consistent padding following the existing card patterns in BudgetPage and AccountsPage (from established Tailwind styling pattern)

### Reports Page
- A dedicated `/reports` page provides full charting capabilities with date range selection (Claude's Decision: separating the dashboard summary from the full reports page keeps the dashboard clean while providing deep drill-down)
- Reports page contains three chart sections: spending by category, spending over time, and net worth (from REPT-01, REPT-02, REPT-03)
- Category drill-down: clicking a category segment in the pie/bar chart could filter the view (Claude's Decision: deferred to Claude's Discretion as the core requirement is viewing, not interactive drill-down)

### Routing and Navigation
- Dashboard route at `/` replaces the current AccountsPage as the index route (Claude's Decision: the dashboard is the natural landing page for a budgeting app; accounts page moves to `/accounts` only)
- Add "Dashboard" and "Reports" NavLinks to the Layout navigation bar (Claude's Decision: dashboard needs direct access; reports is a new top-level section)
- New `DashboardPage.tsx` and `ReportsPage.tsx` in `packages/client/src/pages/` (from established page file convention)

### Claude's Discretion
- Exact Recharts chart colors, legend placement, and animation configuration
- Internal component decomposition within DashboardPage and ReportsPage
- Whether spending-over-time chart includes a comparison line for the prior period
- Exact widget sizing ratios within the dashboard grid
- Whether the pie chart shows percentages, absolute values, or both in labels
- Loading skeleton vs spinner choice for chart containers
- Whether net worth chart shows individual account lines or only the aggregate total

</decisions>

<specifics>
## Specific Ideas

- The `balance_snapshots` table has a UNIQUE constraint on `(account_id, date)` and an index on `(account_id, date)` -- net worth queries can efficiently aggregate across all accounts by date
- Balance snapshots are recorded per account after every sync via `INSERT OR REPLACE INTO balance_snapshots` in `sync-service.ts` (line 141) -- the data source for net worth trends is already populated
- The existing `getSpentForCategory` in `budget-service.ts` demonstrates the dual-query pattern for unsplit and split transactions with transfer exclusion -- the reports service should follow the same pattern for consistency
- ROADMAP plan 09-01 specifies: "spending by category query (date range, exclude transfers), spending over time query (monthly aggregation), net worth query (balance snapshots)"
- ROADMAP plan 09-02 specifies: "pie/bar chart (Recharts), date range filter, category drill-down"
- ROADMAP plan 09-03 specifies: "spending over time line chart, net worth line chart, month labels"
- ROADMAP plan 09-04 specifies: "account balances widget, top spending categories widget, budget progress widget, sync status widget"
- The `formatCurrency()` helper in `packages/client/src/lib/format.ts` converts integer cents to formatted USD strings -- reuse for all chart labels and tooltips
- Investment accounts are already typed as `type: 'investment'` in the accounts table -- they contribute to net worth via balance snapshots but their transactions are excluded from spending reports (from ACCT-03)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getSpentForCategory()` in `packages/server/src/budget/budget-service.ts`: demonstrates the SQL pattern for summing spending with transfer exclusion and split handling -- reuse this pattern for reporting queries
- `getAvailableToBudget()` in `packages/server/src/budget/budget-service.ts`: income and allocation totals useful for the budget progress widget
- `getBudgetSummary()` in `packages/server/src/budget/budget-service.ts`: returns per-category allocated/spent/available -- the budget progress widget can call the existing `budget.summary` tRPC procedure
- `accounts.list` tRPC query in `trpc-router.ts`: returns all accounts with balance, type, institution -- the dashboard account balances widget consumes this directly
- `formatCurrency()` in `packages/client/src/lib/format.ts`: cents-to-currency formatting for all chart labels
- `SyncStatus` and `SyncButton` components: reuse on dashboard for sync status widget
- `formatPeriodDisplay()` in `BudgetPage.tsx`: formats `YYYY-MM` to "Month Year" -- could be extracted to a shared utility for chart axis labels
- `appRouter` in `packages/server/src/sync/trpc-router.ts`: extend with `reports` sub-router
- `router` and `publicProcedure` from `packages/server/src/sync/trpc.ts`: tRPC primitives for new procedures

### Established Patterns
- Feature-based server directory: `packages/server/src/sync/`, `packages/server/src/budget/`, `packages/server/src/transfers/`, `packages/server/src/rules/`, `packages/server/src/categories/` -- create `packages/server/src/reports/`
- tRPC router composition: sub-routers nested under `appRouter` -- add `reports: reportsRouter`
- Service functions accept `db: Database.Database` as first parameter
- Page files in `packages/client/src/pages/` named `XxxPage.tsx`
- TanStack Query with `useQuery(trpc.X.queryOptions(...))` for data fetching
- Tailwind CSS utility classes for all styling with white card containers (`bg-white rounded-lg border border-gray-200`)
- Transfer exclusion via `NOT EXISTS (SELECT 1 FROM transfer_links tl WHERE ... AND tl.confirmed = 1)` subquery pattern

### Integration Points
- `packages/server/src/sync/trpc-router.ts`: the `appRouter` gains a `reports` sub-router
- `packages/client/src/app.tsx`: add `/reports` route and change the index route from AccountsPage to DashboardPage
- `packages/client/src/components/Layout.tsx`: add Dashboard and Reports NavLinks to the navigation bar
- `packages/client/src/pages/DashboardPage.tsx`: new dashboard page (primary deliverable)
- `packages/client/src/pages/ReportsPage.tsx`: new reports page with full charting
- `packages/client/package.json`: add `recharts` dependency

</code_context>

<deferred>
## Deferred Ideas

- Income vs expense reports (v2 -- ADVR-01)
- Cash flow reports (v2 -- ADVR-02)
- Year-over-year spending comparisons (v2 -- ADVR-03)
- CSV export of transaction data (v2 -- EXPT-01)
- Interactive chart drill-down from category to individual transactions (not in v1 requirements)
- Budget allocation recommendations based on spending history (not in requirements)
- Customizable dashboard widget layout or widget visibility toggles (not in requirements; fixed layout is sufficient for single user)

</deferred>

---

*Phase: 09-dashboard-and-reporting*
*Context gathered: 2026-03-22 via auto-context*
