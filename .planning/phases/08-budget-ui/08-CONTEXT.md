# Phase 8: Budget UI - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can see and manage the full envelope budget grid -- what they allocated, what they spent, and what remains -- for any month. This phase delivers: a budget page with a category group accordion grid showing allocated/spent/available columns per category, inline click-to-edit allocation overrides with optimistic updates, month navigation with previous/next controls, overspent highlighting (red available column), and a top-level "Available to Budget" figure. No server-side changes are expected -- Phase 7 already delivers the complete budget tRPC API.

</domain>

<decisions>
## Implementation Decisions

### Budget Grid Layout
- The budget page shows a grid of all categories with allocated, spent, and available columns for the selected month (from success criteria 1)
- Categories are grouped by category group using a collapsible accordion pattern (Claude's Decision: matches the CategoriesPage group accordion pattern already in the codebase; users expect categories organized by group)
- Each group header row shows the group name and group subtotals for allocated, spent, and available (Claude's Decision: group-level subtotals give a quick summary without expanding every group)
- The grid uses a table-like layout with consistent column widths across all groups (Claude's Decision: tabular data reads best in a table; consistent columns allow vertical scanning of numbers)
- All money values are displayed using the existing `formatCurrency()` helper which converts integer cents to dollar format

### Overspent Highlighting
- Available column turns red when a category is overspent (available < 0) (from success criteria 2)
- Red styling applies to both the text color and a subtle background tint on the available cell (Claude's Decision: combining text and background color makes overspending unmissable without being garish)
- Positive available balances display in green text, zero in default gray (Claude's Decision: green/red visual language is universal for positive/negative money values)

### Inline Allocation Editing
- User can click any allocated amount and type a new value to override it; the change saves without leaving the row (from success criteria 3 and BUDG-07)
- Click-to-edit pattern: clicking the allocated cell replaces it with a currency input field that auto-focuses and selects the current value (Claude's Decision: follows the InlineEdit pattern already established in CategoriesPage for click-to-rename)
- Input accepts dollar values (e.g., "150.00") and converts to integer cents before sending to the server (Claude's Decision: users think in dollars, not cents; the conversion is invisible to them)
- Enter key or blur saves the value; Escape cancels editing and restores the original value (from CategoriesPage InlineEdit pattern)
- Optimistic update: the grid immediately reflects the new allocation while the mutation runs in the background (Claude's Decision: instant feedback is essential for rapid budget adjustments across many categories)
- On mutation error, the value reverts to the server value and a brief error toast appears (Claude's Decision: rollback on error prevents showing stale data; toast avoids modal interruption)
- The save calls `budget.allocations.set` mutation with `{ categoryId, period, amount }` (from existing tRPC API)

### Month Navigation
- User can navigate between months using previous/next controls and see historically accurate data (from success criteria 4)
- Navigation displays the current month as "March 2026" format with left/right arrow buttons (Claude's Decision: human-readable month name is clearer than YYYY-MM; arrows are the standard navigation affordance)
- The selected period is stored as a `YYYY-MM` string in component state, defaulting to the current month on page load (Claude's Decision: matches the budget_allocations period format; no URL routing needed for a single-page budget view)
- Clicking previous/next changes the period and re-fetches the budget summary via `budget.summary` query with the new period (from existing tRPC API)
- TanStack Query caches prior month data, so navigating back to a recently viewed month is instant (Claude's Decision: leverages the existing caching layer without any extra work)

### Available to Budget Header
- A top-level "Available to Budget" figure shows unallocated income for the selected month (from success criteria 5)
- Displayed prominently above the budget grid as a large number (Claude's Decision: this is the single most important number on the budget page; it needs visual priority)
- The value comes from the `availableToBudget` field returned by `budget.summary` query (from existing tRPC API)
- Positive values display in green (money still to assign), negative in red (over-allocated), zero in neutral (Claude's Decision: same green/red pattern as category available amounts for visual consistency)
- Updates in real-time as the user edits allocations via optimistic recalculation (Claude's Decision: subtracting the allocation delta from available-to-budget gives instant feedback without waiting for a server round-trip)

### Data Fetching Strategy
- The budget page makes a single `budget.summary` query for the selected period, which returns both the per-category breakdown and available-to-budget figure (from existing tRPC API shape)
- After an allocation mutation succeeds, invalidate the `budget.summary` query to refresh all derived values (Claude's Decision: invalidation is simpler than manually recalculating rollover/spent on the client; the query is cheap)
- Loading state shows a skeleton grid with placeholder rows (Claude's Decision: skeleton loaders feel faster than a spinner and preserve layout stability)
- Error state shows a clear error message with a retry action (Claude's Decision: consistent with error handling in other pages like CategoriesPage)

### Page Integration
- New `/budget` route added to `App.tsx` alongside existing routes (from established routing pattern)
- "Budget" navigation link added to `Layout.tsx` navbar (from established navigation pattern)
- New `BudgetPage.tsx` in `packages/client/src/pages/` (from established page file convention)

### Claude's Discretion
- Exact spacing and padding within the budget grid cells
- Whether group subtotals include rollover as a visible column or only allocated/spent/available
- Skeleton loader placeholder count and animation style
- Exact shade of red/green for overspent/positive highlighting
- Whether the month navigation also supports a month picker dropdown or only arrow buttons
- Internal component decomposition within BudgetPage (single file vs extracted sub-components)
- Whether the error toast uses a third-party library or a simple timeout-based div

</decisions>

<specifics>
## Specific Ideas

- The `budget.summary` tRPC procedure already returns `{ categories: BudgetCategorySummary[], availableToBudget: number }` where each category has `categoryId`, `categoryName`, `groupName`, `allocated`, `spent`, `available`, `rollover` -- all as integer cents. No new server endpoints needed.
- The `budget.allocations.set` mutation accepts `{ categoryId, period, amount }` and upserts the allocation -- this is the exact API the inline editor needs.
- The `InlineEdit` component in `CategoriesPage.tsx` provides the click-to-edit pattern with focus, Enter/Escape/blur handling -- the allocation editor can follow this pattern but adapted for currency input.
- The `CategoriesPage` already renders category groups as collapsible accordions with group headers -- the budget grid uses the same grouping structure but adds numeric columns.
- The `formatCurrency()` helper in `packages/client/src/lib/format.ts` converts cents to formatted USD strings -- reuse directly for all money display.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `budget.summary` tRPC query: returns complete budget data for a period (categories with allocated/spent/available/rollover + availableToBudget)
- `budget.allocations.set` tRPC mutation: upserts an allocation for a category/period pair
- `formatCurrency()` in `packages/client/src/lib/format.ts`: cents-to-currency formatting
- `useTRPC()` hook in `packages/client/src/trpc.ts`: typed tRPC client for queries and mutations
- `InlineEdit` component pattern in `CategoriesPage.tsx`: click-to-edit with focus/Enter/Escape/blur handling
- `Layout.tsx`: app shell with navigation bar -- add Budget link
- `App.tsx`: React Router routes -- add `/budget` route

### Established Patterns
- Page files in `packages/client/src/pages/` named `XxxPage.tsx` (AccountsPage, TransactionsPage, CategoriesPage, RulesPage, TransfersPage)
- TanStack Query with `useQuery(trpc.X.queryOptions(...))` for data fetching
- `useMutation(trpc.X.mutationOptions({ onSuccess: invalidate }))` for mutations with cache invalidation
- `queryClient.invalidateQueries({ queryKey: trpc.X.queryKey() })` for cache invalidation after mutations
- Tailwind CSS for all styling -- no CSS modules or styled-components
- Loading states as `<p className="text-gray-500">Loading...</p>`, error states as `<p className="text-red-600">Error: ...</p>`
- Collapsible group accordion in CategoriesPage with collapse/expand toggle

### Integration Points
- `packages/client/src/app.tsx`: add `<Route path="budget" element={<BudgetPage />} />` inside the Layout route
- `packages/client/src/components/Layout.tsx`: add Budget NavLink to the navigation bar
- `packages/client/src/pages/BudgetPage.tsx`: new page component (primary deliverable)
- `packages/client/src/lib/format.ts`: reuse `formatCurrency()` for all money display

</code_context>

<deferred>
## Deferred Ideas

- Default allocation management UI (setting/editing per-category defaults) -- could be added to the budget page later but is not in Phase 8 success criteria; defaults are set server-side via auto-funding
- Copy budget allocations from a prior month as a template (v2 -- BWRK-01)
- In-app warnings when approaching category budget limits (v2 -- BWRK-02)
- Budget progress summary widget on the dashboard (Phase 9 -- REPT-01)
- Drag-to-reorder categories within the budget grid (not in requirements; category ordering is managed on the CategoriesPage)
- Spending breakdown drill-down from budget grid to filtered transaction list (not in Phase 8 success criteria; useful but out of scope)

</deferred>

---

*Phase: 08-budget-ui*
*Context gathered: 2026-03-22 via auto-context*
