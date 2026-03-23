# Phase 8: Budget UI - Research

**Researched:** 2026-03-22
**Status:** Complete
**Discovery Level:** 0 (pure internal work, established patterns only)

## Research Question

What do I need to know to PLAN the Budget UI phase well?

## Key Findings

### Existing API Surface (from Phase 7)

The complete budget API already exists in `packages/server/src/sync/trpc-router.ts`:

- `budget.summary` query: accepts `{ period: "YYYY-MM" }`, returns `{ categories: BudgetCategorySummary[], availableToBudget: number }`
- `budget.allocations.set` mutation: accepts `{ categoryId: number, period: string, amount: number }`, upserts allocation
- `budget.allocations.byMonth` query: accepts `{ period: "YYYY-MM" }`, returns manual allocations
- `budget.defaults.list` query: returns default allocations per category

### BudgetCategorySummary Type (from budget-service.ts)

```typescript
interface BudgetCategorySummary {
  categoryId: number;
  categoryName: string;
  groupName: string;
  allocated: number;   // integer cents
  spent: number;       // integer cents (absolute value of negative transactions)
  available: number;   // allocated + rollover - spent (integer cents)
  rollover: number;    // integer cents
}
```

### Established UI Patterns

**Data fetching:** `useQuery(trpc.X.queryOptions(...))` with TanStack Query.

**Mutations:** `useMutation(trpc.X.mutationOptions({ onSuccess: invalidate }))` with `queryClient.invalidateQueries()`.

**Page structure:** Page files in `packages/client/src/pages/XxxPage.tsx`. Use Tailwind CSS. Loading state as `<p className="text-gray-500">Loading...</p>`. Error state as `<p className="text-red-600">Error: ...</p>`.

**Routing:** Routes in `packages/client/src/app.tsx` inside `<Route element={<Layout />}>`. Navigation links in `packages/client/src/components/Layout.tsx`.

**InlineEdit pattern:** `CategoriesPage.tsx` has `InlineEdit` component with focus, Enter to save, Escape to cancel, blur to save. This pattern applies to click-to-edit allocation cells.

**Collapsible groups:** `CategoriesPage.tsx` uses `collapsed` state per group with toggle button (`collapsed ? '>' : 'v'`).

**Currency formatting:** `formatCurrency()` in `packages/client/src/lib/format.ts` converts integer cents to formatted USD string.

### No New Dependencies Required

All UI patterns use existing libraries: React, TanStack Query, Tailwind CSS, react-router. No new npm packages needed.

### File Ownership Analysis

- `packages/client/src/pages/BudgetPage.tsx` - NEW (primary deliverable)
- `packages/client/src/app.tsx` - MODIFY (add route)
- `packages/client/src/components/Layout.tsx` - MODIFY (add nav link)

Only `app.tsx` and `Layout.tsx` overlap with existing files. Both are small additions (one line each).

## Risks and Mitigations

1. **Optimistic update complexity:** The available-to-budget header needs to update when an allocation changes. Mitigation: Invalidate the `budget.summary` query on mutation success rather than manually computing deltas client-side. The query is cheap (server-side computation).

2. **Currency input parsing:** Users type dollar amounts but the API expects cents. Mitigation: Parse input as float, multiply by 100, round to nearest integer before sending.

## RESEARCH COMPLETE
