# Phase 12: Budget Defaults UI - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Add the missing UI for budget default allocations so users can set defaults and the auto-funding scheduler becomes functional. This phase delivers: a defaults management interface within or alongside the existing BudgetPage where users can view and edit default monthly allocations per category, with changes persisted via the existing `budget.defaults.set` tRPC procedure. The auto-funding scheduler (`budget-scheduler.ts`) and all server-side budget defaults logic already exist -- this phase is purely client-side UI work.

</domain>

<decisions>
## Implementation Decisions

### Defaults UI Location and Layout
- Default allocations are managed from the existing Budget page rather than a separate page (Claude's Decision: defaults are closely related to budget allocations; adding a section or toggle to BudgetPage avoids a new route and keeps budget management in one place)
- Add a "Defaults" column to the existing budget grid, displayed alongside the Allocated/Spent/Available columns (Claude's Decision: showing defaults inline lets users compare their default allocation to the actual allocation for the current month without navigating away)
- The Defaults column uses the same `AllocationCell` click-to-edit pattern already implemented for the Allocated column in `BudgetPage.tsx` (Claude's Decision: reusing the existing editable cell component ensures consistent UX and avoids duplicating click-to-edit logic)
- Default values of zero (no default set) display as a dash or "$0.00" in muted gray text to distinguish from explicitly set defaults (Claude's Decision: visual distinction between "not set" and "set to zero" helps users understand which categories have active defaults)

### Data Fetching
- Fetch defaults via `budget.defaults.list` tRPC query alongside the existing `budget.summary` query (Claude's Decision: both queries are needed on the same page; fetching in parallel via two `useQuery` calls keeps them independently cacheable)
- The defaults list returns `{ categoryId, amount }[]` which maps to categories in the budget grid by `categoryId`
- Merge defaults data into the existing group/category display by matching `categoryId` (Claude's Decision: the budget summary already provides the category list with group structure; defaults are joined client-side by ID)

### Saving Defaults
- User can view and edit default monthly allocations for each budget category (from success criteria 1)
- Saved defaults are persisted via `budget.defaults.set` tRPC procedure (from success criteria 2)
- Editing a default calls `budget.defaults.set` mutation with `{ categoryId, amount }` where amount is in integer cents
- On save success, invalidate the `budget.defaults.list` query to refresh displayed values (Claude's Decision: invalidation ensures consistency; the query is cheap since it returns one row per category)
- Setting a default to zero removes the default via `budget.defaults.delete` mutation (Claude's Decision: the server `deleteDefault` function already exists and removes the row; this keeps the defaults table sparse and means "no default" truly means no row, which is what the auto-funder checks)

### Auto-Funding Integration
- Auto-funding scheduler uses saved defaults to populate allocations (from success criteria 3)
- No server-side changes needed -- `budget-scheduler.ts` already calls `autoFundPeriod()` which reads from `getDefaults()` (from existing code)
- The UI simply provides the missing interface for users to populate the defaults that the scheduler reads (Claude's Decision: this is the core gap -- the scheduler works but has no defaults to read because there was no way to set them)

### Error Handling
- Mutation errors display as a brief error toast above the grid, matching the existing error toast pattern in BudgetPage (from existing `errorMessage` state and toast div at line 254-258 of BudgetPage.tsx)
- Optimistic update not needed for defaults column since defaults rarely change and instant feedback is less critical than for monthly allocations (Claude's Decision: simpler implementation; defaults are set once and rarely adjusted, unlike monthly allocations which users tweak frequently)

### Claude's Discretion
- Whether to add defaults as a new column in the existing grid or as a separate expandable section/panel
- Exact visual treatment of the defaults column header label
- Whether to show a "Set Defaults" button/toggle or always display the defaults column
- Internal state management for tracking which default cell is being edited
- Exact Tailwind classes for the defaults column styling

</decisions>

<specifics>
## Specific Ideas

- The `budget.defaults.list` procedure at line 370 of `trpc-router.ts` returns `{ categoryId, amount }[]` for all categories with a default set
- The `budget.defaults.set` procedure at line 374 accepts `{ categoryId: number, amount: number }` and upserts via `setDefaultAllocation()`
- The `budget.defaults.delete` procedure at line 380 accepts `{ categoryId: number }` and removes the default row
- The existing `AllocationCell` component (lines 76-141 of `BudgetPage.tsx`) handles click-to-edit with dollar input, cents conversion, Enter/Escape/blur handling -- can be reused directly for default editing
- The `autoFundPeriod()` function in `budget-service.ts` line 184 calls `getDefaults(db)` to read all defaults, then inserts allocations using `INSERT OR IGNORE` -- once defaults exist in the DB, the scheduler will automatically pick them up on the next 15th or last-day trigger
- The `BudgetGroup` component (lines 143-199) renders the per-category grid rows -- this is where the defaults column would be added
- The grid currently uses `grid-cols-4` for Category/Allocated/Spent/Available -- adding a Defaults column changes this to `grid-cols-5`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AllocationCell` component in `BudgetPage.tsx`: click-to-edit currency input with dollar-to-cents conversion, Enter/Escape/blur handling -- reuse for default editing
- `budget.defaults.list` tRPC query: returns all category defaults as `{ categoryId, amount }[]`
- `budget.defaults.set` tRPC mutation: upserts a default allocation for a category
- `budget.defaults.delete` tRPC mutation: removes a default allocation
- `formatCurrency()` in `packages/client/src/lib/format.ts`: cents-to-currency display
- `useTRPC()` hook in `packages/client/src/trpc.ts`: typed tRPC client
- `BudgetGroup` component in `BudgetPage.tsx`: renders category rows within a group accordion -- extend with defaults column
- `groupCategories()` helper in `BudgetPage.tsx`: groups categories by group name with subtotals

### Established Patterns
- TanStack Query with `useQuery(trpc.X.queryOptions(...))` for data fetching
- `useMutation(trpc.X.mutationOptions({ onSuccess: invalidate }))` for mutations with cache invalidation
- Click-to-edit pattern: `AllocationCell` shows formatted value, click opens input, Enter/blur saves, Escape cancels
- Error toast: `errorMessage` state with `setTimeout` auto-dismiss after 3 seconds
- Collapsible group accordion with collapse/expand toggle via `collapsedGroups` Set state
- `grid-cols-4` layout for budget grid columns

### Integration Points
- `packages/client/src/pages/BudgetPage.tsx`: primary file to modify -- add defaults data fetching, defaults column to grid, and save mutation
- `BudgetGroup` component props: extend to accept default amounts per category
- `GroupData` interface: may need a `totalDefault` field for group header subtotal
- Grid column headers div (line 296): add "Default" column header
- No server-side changes required -- all tRPC procedures already exist

</code_context>

<deferred>
## Deferred Ideas

- Copy budget allocations from a prior month as a template (v2 -- BWRK-01)
- In-app warnings when approaching category budget limits (v2 -- BWRK-02)
- Bulk-set defaults from current month allocations (not in requirements; could be a convenience but adds complexity)
- Default allocation history or change log (not in requirements)
- VERIFICATION.md for BUDG-05 and BUDG-06 -- can be created after this phase completes

</deferred>

---

*Phase: 12-budget-defaults-ui*
*Context gathered: 2026-03-22 via auto-context*
