# Phase 12: Budget Defaults UI - Research

**Researched:** 2026-03-22
**Domain:** React UI — extending existing BudgetPage with defaults column
**Confidence:** HIGH

## Summary

Phase 12 is a focused client-side UI task. All server infrastructure exists: `budget.defaults.list`, `budget.defaults.set`, and `budget.defaults.delete` tRPC procedures are fully implemented and tested. The `autoFundPeriod()` scheduler already reads defaults via `getDefaults()`. The only missing piece is a UI for users to set those defaults.

The existing `BudgetPage.tsx` (321 lines) has a clean component structure: `AllocationCell` (click-to-edit), `BudgetGroup` (category rows within collapsible groups), and the main `BudgetPage` component. Adding a defaults column means: (1) widen the grid from `grid-cols-4` to `grid-cols-5`, (2) fetch defaults via `useQuery`, (3) add a mutation for `budget.defaults.set` / `budget.defaults.delete`, and (4) render a `DefaultCell` (reusing `AllocationCell` pattern) per category row.

**Primary recommendation:** Add a "Default" column to the existing budget grid, reusing the `AllocationCell` click-to-edit pattern. Fetch defaults via a parallel `useQuery` call and save via `useMutation`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Default allocations managed from existing Budget page (no separate page/route)
- Add "Defaults" column to existing budget grid alongside Allocated/Spent/Available
- Defaults column uses same AllocationCell click-to-edit pattern
- Default values of zero display as dash or "$0.00" in muted gray
- Fetch defaults via `budget.defaults.list` tRPC query (parallel useQuery)
- Defaults list returns `{ categoryId, amount }[]`, merged client-side by categoryId
- Editing calls `budget.defaults.set` mutation with `{ categoryId, amount }` in integer cents
- On save success, invalidate `budget.defaults.list` query
- Setting default to zero removes it via `budget.defaults.delete`
- No server-side changes needed
- Error toast using existing errorMessage pattern
- No optimistic updates for defaults

### Claude's Discretion
- Whether to add defaults as a new column in existing grid or as a separate expandable section/panel
- Exact visual treatment of defaults column header label
- Whether to show a "Set Defaults" button/toggle or always display the defaults column
- Internal state management for tracking which default cell is being edited
- Exact Tailwind classes for defaults column styling

### Deferred Ideas (OUT OF SCOPE)
- Copy budget allocations from a prior month as a template (v2 -- BWRK-01)
- In-app warnings when approaching category budget limits (v2 -- BWRK-02)
- Bulk-set defaults from current month allocations
- Default allocation history or change log
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUDG-05 | User can set default monthly allocation per category | AllocationCell reuse for defaults column; budget.defaults.set mutation exists |
| BUDG-06 | App auto-populates envelope allocations on 15th and last day using defaults | autoFundPeriod() already reads getDefaults(); UI just needs to let users populate them |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Already in use |
| TanStack Query | 5.x | Data fetching/caching | Already in use via `useQuery`/`useMutation` |
| tRPC | 11.x | Type-safe API client | Already in use via `useTRPC()` |
| Tailwind CSS | 4.x | Styling | Already in use throughout BudgetPage |

### Supporting
No new libraries needed. Everything required is already installed and in use.

## Architecture Patterns

### Existing BudgetPage Structure
```
BudgetPage.tsx
├── AllocationCell        # Click-to-edit currency input (lines 76-141)
├── BudgetGroup           # Group accordion with category rows (lines 143-199)
├── BudgetPage            # Main component with data fetching (lines 202-321)
└── Helper functions      # getCurrentPeriod, groupCategories, etc.
```

### Pattern: Parallel Queries
The page already uses `useQuery(trpc.budget.summary.queryOptions({ period }))`. Add a second query for defaults:
```typescript
const { data: defaults } = useQuery(trpc.budget.defaults.list.queryOptions());
```
Defaults are period-independent (they apply globally), so no period parameter needed.

### Pattern: Defaults Map for O(1) Lookup
Build a Map from the defaults array for efficient lookup per category:
```typescript
const defaultsMap = new Map(
  (defaults ?? []).map(d => [d.categoryId, d.amount])
);
```

### Pattern: Save-or-Delete on Zero
When saving a default, check if amount is zero. If zero, call delete instead of set:
```typescript
const handleSetDefault = (categoryId: number, amount: number) => {
  if (amount === 0) {
    deleteDefaultMut.mutate({ categoryId });
  } else {
    setDefaultMut.mutate({ categoryId, amount });
  }
};
```

### Anti-Patterns to Avoid
- **Separate route/page for defaults:** Adds navigation complexity. Defaults are tightly coupled to budget categories — keep them inline.
- **Optimistic updates for defaults:** CONTEXT.md explicitly says no optimistic updates. Keep it simple with invalidation.
- **Fetching defaults per-group or per-category:** One query returns all defaults. Don't split into multiple queries.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Click-to-edit input | New editable component | Existing `AllocationCell` | Already handles focus, Enter/Escape/blur, dollar-to-cents conversion |
| Currency formatting | Manual number formatting | Existing `formatCurrency()` | Consistent with rest of app |
| Cache invalidation | Manual state sync | TanStack Query `invalidateQueries` | Already used for allocation saves |

## Common Pitfalls

### Pitfall 1: Grid Column Misalignment
**What goes wrong:** Changing `grid-cols-4` to `grid-cols-5` in one place but missing another creates visual misalignment.
**Why it happens:** The grid class appears in three places: column headers (line 296), group header row (line 159), and category rows (line 181).
**How to avoid:** Search for ALL `grid-cols-4` in BudgetPage.tsx and update every instance. There are exactly 3.
**Warning signs:** Columns don't line up between header, group summary, and category rows.

### Pitfall 2: Defaults Query Key Mismatch
**What goes wrong:** Invalidating the wrong query key after mutation doesn't refresh displayed defaults.
**Why it happens:** Using `trpc.budget.summary.queryKey()` instead of `trpc.budget.defaults.list.queryKey()` for invalidation.
**How to avoid:** Invalidate `trpc.budget.defaults.list` query key specifically on default mutation success.

### Pitfall 3: Missing Group-Level Default Total
**What goes wrong:** Group header shows totals for Allocated/Spent/Available but not for Defaults, leaving the column blank at group level.
**Why it happens:** `GroupData` interface only has `totalAllocated`, `totalSpent`, `totalAvailable`.
**How to avoid:** Add `totalDefault` to `GroupData` and compute it in `groupCategories()` or compute inline from the defaults map.

### Pitfall 4: Zero vs Unset Ambiguity
**What goes wrong:** Displaying "$0.00" for categories with no default set looks like they have a $0 default.
**Why it happens:** `defaultsMap.get(categoryId)` returns `undefined` for unset, but the cell needs to distinguish this from an explicitly-set $0 (which shouldn't happen since setting to $0 deletes the default, but the visual distinction matters).
**How to avoid:** Show "---" or muted placeholder for unset defaults (categoryId not in map). Since setting to $0 deletes the row, there's no ambiguity: missing from map = no default.

## Code Examples

### Adding Defaults Query
```typescript
const { data: defaults } = useQuery(
  trpc.budget.defaults.list.queryOptions(),
);
const defaultsMap = new Map(
  (defaults ?? []).map(d => [d.categoryId, d.amount])
);
```

### Set Default Mutation
```typescript
const setDefaultMut = useMutation(
  trpc.budget.defaults.set.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.budget.defaults.list.queryKey() });
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setTimeout(() => setErrorMessage(null), 3000);
    },
  }),
);

const deleteDefaultMut = useMutation(
  trpc.budget.defaults.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.budget.defaults.list.queryKey() });
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setTimeout(() => setErrorMessage(null), 3000);
    },
  }),
);
```

### Default Cell in Category Row
```typescript
<div className="text-right text-sm">
  <AllocationCell
    value={defaultsMap.get(cat.categoryId) ?? 0}
    onSave={cents => handleSetDefault(cat.categoryId, cents)}
  />
</div>
```

## Open Questions

1. **Group-level default total display**
   - What we know: Group headers show subtotals for Allocated/Spent/Available
   - What's unclear: Should group header show sum of defaults for that group?
   - Recommendation: Yes, show `totalDefault` in group header for consistency. Compute from defaults map by summing amounts for categories in each group.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `BudgetPage.tsx` (321 lines) — full component structure verified
- Codebase inspection: `trpc-router.ts` — `budgetDefaultsRouter` at line 369 with list/set/delete procedures
- Codebase inspection: `budget-service.ts` — `getDefaults()`, `setDefaultAllocation()`, `deleteDefault()` functions verified
- Codebase inspection: `budget-scheduler.ts` — `autoFundPeriod()` reads from `getDefaults()` confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - extending existing patterns, no new patterns needed
- Pitfalls: HIGH - all identified from direct code inspection

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable — no external dependency changes expected)
