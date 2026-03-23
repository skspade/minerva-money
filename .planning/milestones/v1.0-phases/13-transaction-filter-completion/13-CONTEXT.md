# Phase 13: Transaction Filter Completion - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Complete ACCT-04 by adding amount range and category dropdown filters to TransactionsPage so users can filter transactions by all four criteria (date range, payee/memo, amount range, category). This is a gap closure phase that adds two missing filter controls to an existing, fully functional transactions page. The date range and payee/memo search filters already work.

</domain>

<decisions>
## Implementation Decisions

### Amount Range Filter
- Two numeric inputs (min and max) for filtering by transaction amount (from ACCT-04 and success criteria 1)
- Values entered in dollars and converted to integer cents for comparison against `txn.amount` (from INFR-04 integer cents constraint)
- Both bounds are optional: min-only, max-only, or both together (Claude's Decision: matches how amount range works in the existing rules engine and provides maximum flexibility)
- Filter compares absolute value of transaction amount so both debits and credits are filterable by magnitude (Claude's Decision: users think in dollar amounts regardless of sign; filtering on absolute value is more intuitive for a personal finance tool)
- Inputs placed in the existing filter bar alongside the date range and search inputs (from success criteria 3 -- all filters work together)

### Category Filter
- A dropdown select that filters transactions to show only those assigned to a specific category (from ACCT-04 and success criteria 2)
- Reuse the existing `CategoryPicker` component pattern with `<optgroup>` for category groups (Claude's Decision: the CategoryPicker already renders grouped categories in a select element; reusing the same markup ensures visual consistency)
- Add an "All Categories" default option that shows all transactions (no filter applied) (Claude's Decision: the filter should be opt-in, not forcing users to always select a category)
- Add an "Uncategorized" option to filter for transactions with no category assigned (Claude's Decision: users need to find uncategorized transactions to clean them up)
- Filter placed in the existing filter bar alongside other filter controls (from success criteria 3)

### Client-Side Filtering Integration
- All filtering is client-side using the existing `useMemo` filtered array pattern in TransactionsPage (from Phase 3 decision -- "Fetch all transactions and filter client-side")
- Amount range filter added as additional conditions in the existing `filtered` useMemo block alongside date and search filters
- Category filter added as an additional condition in the same `filtered` useMemo block
- New state variables: `amountMin`, `amountMax` (string state for input values), `categoryFilter` (number | null | 'uncategorized') (Claude's Decision: string state for amount inputs avoids NaN issues with empty inputs; special 'uncategorized' sentinel distinguishes "no filter" from "show uncategorized")

### Filter Bar Layout
- Extend the existing `flex flex-wrap items-end gap-4 mb-4` filter bar with the new controls (Claude's Decision: adding to the existing flex-wrap container ensures filters reflow naturally on smaller screens)
- Amount inputs use `type="number"` with step="0.01" for dollar entry and placeholder text "Min" / "Max" (Claude's Decision: number input with step provides native browser validation and increment controls)
- Category dropdown styled consistently with the existing date and search inputs using the same Tailwind classes

### Claude's Discretion
- Exact width proportions of filter inputs within the flex container
- Whether amount inputs have labels or rely on placeholder text alone
- Exact Tailwind spacing classes between new filter elements
- Whether to add a "Clear filters" button for convenience

</decisions>

<specifics>
## Specific Ideas

- TransactionsPage already has a working filter bar at lines 170-198 with search input, date-from, and date-to controls -- the new filters extend this bar
- The `filtered` useMemo at line 96-137 already filters by `dateFrom`, `dateTo`, and `debouncedSearch` and then sorts -- amount and category filters are additional conditions before the sort
- The `CategoryPicker` component at `packages/client/src/components/CategoryPicker.tsx` fetches `categories.groups.list` and renders `<optgroup>` with `<option>` elements -- the category filter dropdown can follow this exact structure with added "All" and "Uncategorized" options
- Transaction amounts are integer cents (e.g., -12345 for -$123.45) -- dollar input values must be multiplied by 100 for comparison
- The `categoryGroups` data is already fetched in TransactionsPage at line 16 via `trpc.categories.groups.list.queryOptions()` -- no additional data fetching needed for the category filter

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CategoryPicker` in `packages/client/src/components/CategoryPicker.tsx`: renders a grouped category `<select>` element. The filter dropdown follows the same `<optgroup>` pattern but with "All Categories" and "Uncategorized" options prepended.
- `categoryGroups` query already loaded in TransactionsPage line 16: no additional tRPC call needed for the category filter data.
- `formatCurrency()` in `packages/client/src/lib/format.ts`: available if amount filter labels need currency formatting.

### Established Patterns
- Client-side filtering via `useMemo` with state-driven filter conditions (TransactionsPage lines 96-137)
- Tailwind-styled form inputs with consistent class pattern: `px-2 py-2 border border-gray-300 rounded-md text-sm`
- State managed with `useState` hooks at the top of the component
- Filter bar uses `flex flex-wrap items-end gap-4 mb-4` container layout

### Integration Points
- `packages/client/src/pages/TransactionsPage.tsx`: the only file that needs modification -- add state, filter logic, and filter UI elements
- No server-side changes needed -- all filtering is client-side against the existing `transactions.list` query response

</code_context>

<deferred>
## Deferred Ideas

- Server-side filtering/pagination for large transaction sets (not needed for single-user app with manageable transaction volume)
- Saved filter presets or bookmarkable filter URLs (not in requirements)
- Multi-category filter selection (single category filter is sufficient for ACCT-04)
- Account filter dropdown (not listed in ACCT-04 filter criteria)

</deferred>

---

*Phase: 13-transaction-filter-completion*
*Context gathered: 2026-03-22 via auto-context*
