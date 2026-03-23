# Phase 13: Transaction Filter Completion - Research

**Researched:** 2026-03-22
**Domain:** React client-side filtering UI
**Confidence:** HIGH

## Summary

Phase 13 adds two missing filter controls (amount range and category dropdown) to the existing TransactionsPage. The page already has a working filter bar with date range and payee/memo search, plus a `useMemo`-based client-side filtering pipeline. The new filters slot into the same pattern with no new libraries, no server changes, and no architectural decisions.

The `categoryGroups` data is already fetched on the page (line 16), and the `CategoryPicker` component provides the exact `<optgroup>` rendering pattern. The filtered `useMemo` block (lines 96-137) already chains filter conditions before sorting -- adding amount and category conditions is mechanical.

**Primary recommendation:** Add state variables, filter conditions, and UI inputs to TransactionsPage.tsx. No other files need modification.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Amount range filter: two numeric inputs (min/max), dollar values converted to integer cents, both bounds optional, compare absolute value of amount
- Category filter: dropdown select reusing CategoryPicker `<optgroup>` pattern, "All Categories" default, "Uncategorized" option
- All filtering client-side using existing `useMemo` pattern
- New state: `amountMin`, `amountMax` (string), `categoryFilter` (number | null | 'uncategorized')
- Inputs placed in existing flex-wrap filter bar
- Amount inputs use `type="number"` with `step="0.01"`

### Claude's Discretion
- Exact width proportions of filter inputs
- Whether amount inputs have labels or rely on placeholder text alone
- Exact Tailwind spacing classes
- Whether to add a "Clear filters" button

### Deferred Ideas (OUT OF SCOPE)
- Server-side filtering/pagination
- Saved filter presets
- Multi-category selection
- Account filter dropdown
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCT-04 | User can view transaction list with filtering by date, payee, amount, and category | Date and payee filters exist. This phase adds amount range and category filters to complete the requirement. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | existing | Component state and rendering | Already in use |
| @tanstack/react-query | existing | Data fetching (categoryGroups already loaded) | Already in use |

### Supporting
No new libraries needed. All functionality uses native HTML form elements and existing React patterns.

### Alternatives Considered
None -- the context locks all decisions to existing patterns.

## Architecture Patterns

### Pattern 1: Client-Side Filter Chain
**What:** Multiple filter conditions applied sequentially in a single `useMemo` block
**When to use:** When all data is already loaded client-side
**Example (existing pattern at TransactionsPage lines 96-137):**
```typescript
const filtered = useMemo(() => {
  if (!transactions) return [];
  let result = [...transactions];

  // Each filter condition narrows the result
  if (dateFrom) result = result.filter(t => t.date >= dateFrom);
  if (dateTo) result = result.filter(t => t.date <= dateTo);
  if (debouncedSearch) { /* search filter */ }

  // Amount range filter (new)
  // Category filter (new)

  result.sort(/* ... */);
  return result;
}, [transactions, dateFrom, dateTo, debouncedSearch, /* new deps */]);
```

### Pattern 2: String State for Numeric Inputs
**What:** Store input value as string, convert to number only for comparison
**When to use:** Numeric inputs where empty string is valid (no filter applied)
**Why:** Avoids NaN issues when input is cleared. Empty string = no filter.

### Anti-Patterns to Avoid
- **Parsing on every keystroke with parseInt/parseFloat before storing:** Store as string, parse only in the useMemo filter logic
- **Filtering on signed amount value:** Users think in dollar magnitudes. Use `Math.abs()` so -$50 and +$50 both match a $50 filter

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grouped category dropdown | Custom dropdown component | Native `<select>` with `<optgroup>` | Matches existing CategoryPicker pattern, accessible by default |
| Dollar-to-cents conversion | Custom currency parser | `Math.round(parseFloat(value) * 100)` | Simple multiplication, already the project convention |

## Common Pitfalls

### Pitfall 1: Floating Point Cents Conversion
**What goes wrong:** `parseFloat("19.99") * 100` = `1998.9999999999998`, not `1999`
**Why it happens:** IEEE 754 floating point
**How to avoid:** Use `Math.round(parseFloat(value) * 100)` to snap to nearest integer cent
**Warning signs:** Filter misses transactions by 1 cent

### Pitfall 2: Forgetting useMemo Dependencies
**What goes wrong:** Filter doesn't update when new state changes
**Why it happens:** Missing state variables in useMemo dependency array
**How to avoid:** Add `amountMin`, `amountMax`, `categoryFilter` to the useMemo deps array

### Pitfall 3: Category Filter Type Confusion
**What goes wrong:** Can't distinguish "all categories" from "uncategorized" from specific category
**Why it happens:** Using `null` for both "no filter" and "uncategorized"
**How to avoid:** Use distinct sentinel values: `''` for all/no filter, `'uncategorized'` for null categoryId, numeric string for specific category ID

## Code Examples

### Amount Range Filter Logic
```typescript
const [amountMin, setAmountMin] = useState('');
const [amountMax, setAmountMax] = useState('');

// Inside useMemo filter chain:
if (amountMin) {
  const minCents = Math.round(parseFloat(amountMin) * 100);
  result = result.filter(t => Math.abs(t.amount) >= minCents);
}
if (amountMax) {
  const maxCents = Math.round(parseFloat(amountMax) * 100);
  result = result.filter(t => Math.abs(t.amount) <= maxCents);
}
```

### Category Filter Logic
```typescript
const [categoryFilter, setCategoryFilter] = useState('');

// Inside useMemo filter chain:
if (categoryFilter === 'uncategorized') {
  result = result.filter(t => t.categoryId === null);
} else if (categoryFilter !== '') {
  const catId = parseInt(categoryFilter, 10);
  result = result.filter(t => t.categoryId === catId);
}
```

### Category Filter Dropdown
```typescript
<select
  value={categoryFilter}
  onChange={e => setCategoryFilter(e.target.value)}
  className="px-2 py-2 border border-gray-300 rounded-md text-sm"
>
  <option value="">All Categories</option>
  <option value="uncategorized">Uncategorized</option>
  {categoryGroups?.map(group => (
    <optgroup key={group.id} label={group.name}>
      {group.categories.map(cat => (
        <option key={cat.id} value={cat.id}>{cat.name}</option>
      ))}
    </optgroup>
  ))}
</select>
```

## State of the Art

No changes -- this uses standard React patterns that have been stable for years.

## Open Questions

None. The context decisions and existing codebase provide complete guidance.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `packages/client/src/pages/TransactionsPage.tsx` (current filter implementation)
- Direct codebase inspection: `packages/client/src/components/CategoryPicker.tsx` (category dropdown pattern)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, existing patterns only
- Architecture: HIGH - extending a working pattern with two more conditions
- Pitfalls: HIGH - well-known JavaScript/React issues with documented solutions

**Research date:** 2026-03-22
**Valid until:** indefinite (no external dependencies to go stale)
