# Phase 22: Transaction Cards — Research

**Researched:** 2026-03-24
**Domain:** Mobile card layout for transaction list, collapsible filter panel, tap-to-change category, TOUCH-02 (16px form inputs)
**Confidence:** HIGH

---

## Summary

Phase 21 (Layout Foundation) is fully verified and shipped. The bottom tab bar, `MoreSheet` (using `vaul` `Drawer`), `min-h-dvh`, safe area insets, and `pb-20 md:pb-6` content padding are all in place. Phase 22 can build on this foundation without touching any layout primitives.

The core work is: (1) add a `TransactionCard` component that renders a single transaction as a mobile card, (2) modify `TransactionsPage` to render `<table>` on `md:` and up and the card list below `md:`, (3) wrap the existing filter bar in a collapsible panel with a filter-count badge on mobile, and (4) apply `text-base` (16px) minimum font size to all form inputs to prevent iOS auto-zoom (TOUCH-02).

The `CategoryPicker` is currently a bare `<select>` element. On iOS, a `<select>` renders as a native picker — this is already mobile-friendly for the tap-to-categorize interaction required by TXN-02. The card's category badge should be a tappable affordance that focuses the underlying `<select>`, rather than a separate picker UI.

**Primary recommendation:** Build `TransactionCard.tsx` as a self-contained presentational component accepting props from `TransactionsPage`. The page adds a `hidden md:block` gate on the table and a `md:hidden` gate on the card list. Filter collapse is a simple `useState` boolean in the page — no new library needed.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TXN-01 | User sees transactions as stacked cards (not table) on mobile, showing merchant, amount, date, account, and category | `TransactionCard` component with `md:hidden` gate. Same `filtered` array from existing `useMemo`. Card layout: payee + amount (top row), date + account + category badge (bottom row). |
| TXN-02 | User can tap a transaction card's category badge to change category via CategoryPicker | `CategoryPicker` is already a `<select>`. Card renders the select visually as a styled badge; tapping it opens iOS native picker. Pass `onChange` from existing `updateCategoryMut`. |
| TXN-03 | User can tap a transaction card to expand and view memo, splits, and notes | Local `expandedId` state in `TransactionsPage` (or in card via `useState`). Expanded section shows memo, split count/button, rule name. Card toggles expand on body tap. |
| TXN-04 | Filters collapse into a "Filter" button on mobile with active filter count badge | `filterSheetOpen` boolean state in `TransactionsPage`. Count active filters (non-empty filter fields). Render filters inside a collapsible `div` or a simple inline panel — does not need a full `Sheet` primitive. |
| TXN-05 | Desktop transaction table remains unchanged on screens above 768px | Gate existing `<div className="overflow-x-auto"><table>` with `hidden md:block`. No changes to table markup or sorting logic. |
| TOUCH-02 | Form inputs use 16px minimum font size on mobile to prevent iOS auto-zoom | Add `text-base` class (or `max-md:text-base`) to all `<input>` and `<select>` elements in `TransactionsPage` filter bar. Also applies to `CategoryPicker` select. iOS auto-zooms inputs with font-size < 16px. |
</phase_requirements>

---

## Standard Stack

### Core — No New Dependencies Required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind v4 | ^4.2.2 | `md:hidden` / `hidden md:block` responsive gating, card layout classes | Already in project; `max-md:` variants handle mobile-only overrides |
| React (useState) | ^19 | `expandedId`, `filterSheetOpen` local state | Built-in |
| lucide-react | already installed | Filter icon, chevron expand/collapse indicator | Already used in `BottomTabBar` and `MoreSheet` |
| vaul | already installed | NOT needed for filter panel — simple inline collapse is sufficient | vaul already available if a true sheet is needed |

### No New npm Installs Needed

The entire phase is implementable with existing dependencies. The filter panel can be a simple conditional `div` — a full `Sheet`/`Drawer` is overkill for filter controls that live in the same page context.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline filter collapse (`useState` + `div`) | `vaul` Drawer sheet | Drawer adds slide-up animation but overkill for filter inputs; inline is simpler and faster |
| Native `<select>` for CategoryPicker on card | Custom popover/dropdown | Native `<select>` already gives iOS native picker for free; custom picker adds ~100 lines for no UX gain on mobile |
| Expand state in card component | Expand state in page (`expandedId`) | Page-level state allows only one card expanded at a time (better UX); card-level state allows multiple open simultaneously |

---

## Architecture Patterns

### Recommended File Changes

```
packages/client/src/
├── components/
│   ├── TransactionCard.tsx     # NEW — pure presentational, receives txn + handlers as props
│   └── CategoryPicker.tsx      # MODIFY — add text-base class for TOUCH-02
├── pages/
│   └── TransactionsPage.tsx    # MODIFY — card list, filter collapse, TOUCH-02 on inputs
```

No other files need to change for this phase.

### Pattern 1: Desktop Table / Mobile Cards (Conditional DOM)

```tsx
{/* Desktop table — hidden on mobile */}
<div className="hidden md:block overflow-x-auto">
  <table className="w-full border-collapse">
    {/* existing thead/tbody unchanged */}
  </table>
</div>

{/* Mobile cards — hidden on desktop */}
<div className="md:hidden space-y-2">
  {filtered.map(txn => (
    <TransactionCard
      key={txn.id}
      txn={txn}
      isExpanded={expandedId === txn.id}
      onToggle={() => setExpandedId(prev => prev === txn.id ? null : txn.id)}
      onCategoryChange={categoryId => updateCategoryMut.mutate({ transactionId: txn.id, categoryId })}
      onSplitClick={() => setSplitTransactionId(txn.id)}
    />
  ))}
</div>
```

**Source:** Architecture pattern documented in `.planning/research/ARCHITECTURE.md` — Pattern 3 (Conditional Layout with Tailwind Responsive Prefixes). HIGH confidence.

### Pattern 2: TransactionCard Component

Card has two visual states — collapsed (default) and expanded.

**Collapsed card shows:**
- Row 1: `payee` (bold, truncated with `truncate`) + `amount` (right-aligned, red if negative)
- Row 2: `date` (short format) + `accountName` + `CategoryPicker` as badge

**Expanded section (below collapsed, visible when `isExpanded`):**
- `memo` (if present)
- Split button or split count (if `splitCount > 0`)
- Rule name attribution (if `ruleName` present)

```tsx
// packages/client/src/components/TransactionCard.tsx
import CategoryPicker from './CategoryPicker';
import { formatCurrency } from '../lib/format';

interface TransactionCardProps {
  txn: {
    id: string;
    payee: string;
    amount: number;
    date: string;
    accountName: string;
    categoryId: number | null;
    memo: string | null;
    splitCount: number;
    ruleName: string | null;
    isTransfer: boolean;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onCategoryChange: (categoryId: number | null) => void;
  onSplitClick: () => void;
}

export default function TransactionCard({
  txn, isExpanded, onToggle, onCategoryChange, onSplitClick
}: TransactionCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Tappable body — toggles expand */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 min-h-[44px] flex flex-col gap-1"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900 truncate flex-1 mr-2">
            {txn.payee}
            {txn.isTransfer && (
              <span className="ml-2 text-xs font-normal text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                Transfer
              </span>
            )}
          </span>
          <span className={`text-sm font-medium shrink-0 ${txn.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(txn.amount)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{new Date(txn.date + 'T00:00:00').toLocaleDateString()}</span>
          <span>·</span>
          <span className="truncate">{txn.accountName}</span>
        </div>
      </button>

      {/* Category picker row — separate tap zone */}
      <div className="px-4 pb-3">
        {txn.splitCount > 0 ? (
          <button
            onClick={onSplitClick}
            className="text-sm text-blue-600 min-h-[44px] flex items-center"
          >
            Split ({txn.splitCount})
          </button>
        ) : (
          <CategoryPicker
            value={txn.categoryId}
            onChange={onCategoryChange}
            className="text-base w-full"
          />
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-100 text-sm text-gray-600 space-y-1">
          {txn.memo && <p><span className="font-medium">Memo:</span> {txn.memo}</p>}
          {txn.ruleName && (
            <p className="text-xs text-gray-400">Rule: {txn.ruleName}</p>
          )}
          {txn.splitCount === 0 && (
            <button
              onClick={onSplitClick}
              className="text-xs text-gray-500 hover:text-blue-600 min-h-[44px] flex items-center"
            >
              Split transaction
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

### Pattern 3: Collapsible Filter Bar

The filter bar on mobile collapses to a single row with a "Filter" button showing active filter count. The count is computed from how many filter fields are non-empty.

```tsx
// In TransactionsPage.tsx

const activeFilterCount = [dateFrom, dateTo, debouncedSearch, amountMin, amountMax, categoryFilter]
  .filter(v => v !== '').length;

// In JSX:
{/* Mobile filter toggle */}
<div className="md:hidden flex items-center justify-between mb-4">
  <button
    onClick={() => setFilterPanelOpen(prev => !prev)}
    className="flex items-center gap-2 px-3 min-h-[44px] text-sm border border-gray-300 rounded-md"
  >
    <Filter size={16} />
    Filters
    {activeFilterCount > 0 && (
      <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
        {activeFilterCount}
      </span>
    )}
  </button>
</div>

{/* Filter controls: always visible on desktop, collapsible on mobile */}
<div className={`flex flex-wrap items-end gap-4 mb-4 ${!filterPanelOpen ? 'hidden md:flex' : 'flex'}`}>
  {/* existing filter inputs — add text-base to each */}
</div>
```

### Pattern 4: TOUCH-02 — Preventing iOS Auto-Zoom

iOS Safari auto-zooms any focused `<input>` or `<select>` with computed `font-size` less than 16px. The current filter inputs use `text-sm` (14px) and `CategoryPicker` uses `text-sm`.

**Fix:** Add `text-base` (16px) to all `<input>` and `<select>` elements when on mobile. Use `max-md:text-base` to avoid changing desktop appearance, or simply upgrade all inputs to `text-base` (16px is acceptable on desktop too).

Current offending elements:
- Search input: `text-sm` in `TransactionsPage`
- Date inputs: `text-sm`
- Amount inputs: `text-sm`
- Category select: `text-sm`
- `CategoryPicker` component: `text-sm` hardcoded in its className

The simplest fix: change `text-sm` to `text-base` on `CategoryPicker`'s `<select>` and pass `className="text-base"` to it from `TransactionCard`. Add `text-base` to all filter inputs in `TransactionsPage`.

### Anti-Patterns to Avoid

- **Do not use `overflow-x-auto` on the table as the mobile "fix"** — the table stays desktop-only (`hidden md:block`). The card list is the mobile replacement.
- **Do not put expand state inside `TransactionCard`** — page-level `expandedId` allows only one expanded at a time, which is cleaner UX.
- **Do not create a `vaul` Drawer for the filter panel** — a simple `useState` + conditional `div` is sufficient; Drawer adds unnecessary animation overhead for an inline filter form.
- **Do not add a custom category picker popover** — the native `<select>` (iOS picker) is the correct approach for mobile; `CategoryPicker` already renders a `<select>`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Category selection on mobile | Custom popover/sheet category picker | `<select>` (already in `CategoryPicker`) | iOS renders `<select>` as a native picker — exactly what users expect; zero lines of extra code |
| Filter collapse animation | CSS transition with complex animation | Plain `hidden` / `flex` toggle | At this scale, instant show/hide is fine; no user has complained about this pattern in the existing desktop app |
| Active filter badge | Third-party badge library | Inline `<span>` with Tailwind | Single element, 2 classes |

**Key insight:** The `CategoryPicker` component's native `<select>` is already the best possible mobile category picker. The tap-to-change behavior is free — iOS handles it.

---

## Common Pitfalls

### Pitfall 1: CategoryPicker font-size Causes iOS Auto-Zoom

**What goes wrong:** `CategoryPicker` has `text-sm` (14px) hardcoded. Even if all filter inputs are upgraded to `text-base`, tapping the category picker in a card triggers iOS zoom.

**How to avoid:** `CategoryPicker` accepts a `className` prop. Pass `className="text-base"` from `TransactionCard`. Also update the default class inside `CategoryPicker` from `text-sm` to `text-base`, or make the default safe for mobile.

**Warning signs:** The iOS simulator zooms the viewport when the category select is tapped on the transaction card.

### Pitfall 2: Category Badge vs. Select — Tap Zone Confusion

**What goes wrong:** The card body (`onToggle`) and the category picker are both tappable. If the category `<select>` sits inside the `<button onClick={onToggle}>`, iOS may fire the button click before the select gets focus, causing an unexpected expand instead of the picker opening.

**How to avoid:** Keep the category picker **outside** the tappable `<button>` body. Place it in its own `div` below the main tap target. This way the body button handles expand/collapse and the select handles categorization — no event bubbling conflicts.

**Warning signs:** Tapping the category select expands/collapses the card instead of opening the picker.

### Pitfall 3: `expandedId` State Causes Stale Closures After Category Change

**What goes wrong:** When `updateCategoryMut` succeeds and TanStack Query invalidates, `TransactionsPage` re-renders. If `expandedId` was set to a transaction ID and that transaction is re-fetched, the expanded state persists correctly — but if the component key changes, expand state resets.

**How to avoid:** Use `txn.id` (string, stable across re-renders) as the `expandedId` value. Do not use array index. The `transactions.list` query returns the same IDs after cache invalidation.

### Pitfall 4: Filter Count Badge Counts Empty Strings Wrongly

**What goes wrong:** `categoryFilter` defaults to `''` (all categories). If `amountMin` is `'0'`, that's technically non-empty but the user hasn't meaningfully filtered. The badge count might show `1` even when the user considers filters "clear."

**How to avoid:** Count filters as active only when they have semantically non-default values: `dateFrom !== ''`, `dateTo !== ''`, `search !== ''`, `amountMin !== ''`, `amountMax !== ''`, `categoryFilter !== ''`. The `'0'` edge case for amounts is acceptable — `'0'` is a valid filter the user typed.

### Pitfall 5: Truncated Payee Loses Information

**What goes wrong:** `truncate` on the payee hides long merchant names. The user can't see the full name in the collapsed view.

**How to avoid:** The expand interaction (TXN-03) is the correct solution — tapping the card reveals full details. The collapsed card prioritizes scannability (show truncated name); the expanded card can show full payee. This is the intended UX per the phase description.

---

## Code Examples

### Active Filter Count Computation

```tsx
// Source: derived from TransactionsPage filter state fields
const activeFilterCount = [
  dateFrom,
  dateTo,
  debouncedSearch,
  amountMin,
  amountMax,
  categoryFilter,
].filter(v => v !== '').length;
```

### TransactionCard Props Type (inferred from existing `filtered` array)

From `TransactionsPage`, the `transactions.list` query returns items with:
- `id: string`
- `payee: string`
- `amount: number` (integer cents)
- `date: string` (YYYY-MM-DD)
- `accountName: string`
- `categoryId: number | null`
- `categoryName: string | null`
- `memo: string | null`
- `splitCount: number`
- `ruleName: string | null`
- `isTransfer: boolean`

All of these are available in `filtered` — no new queries needed for `TransactionCard`.

### TOUCH-02: Filter Input Fix

```tsx
// Before (causes iOS auto-zoom):
<input className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm ..." />

// After (prevents iOS auto-zoom):
<input className="w-full px-3 py-2 border border-gray-300 rounded-md text-base ..." />
// OR add max-md:text-base to keep text-sm on desktop:
<input className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm max-md:text-base ..." />
```

### CategoryPicker with text-base

```tsx
// CategoryPicker.tsx — change default class from text-sm to text-base:
className={`text-base border border-gray-300 rounded px-1 py-0.5 ... ${className ?? ''}`}
// OR accept text-base from caller via className prop
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `overflow-x-auto` table on mobile | Card list (`md:hidden` / `hidden md:block`) | No horizontal scroll trap; clean 375px layout |
| Native `<select>` for category on desktop (small, mouse-friendly) | Same `<select>` on mobile (iOS renders as native picker) | Zero extra code; iOS picker is the correct UX |
| `text-sm` form inputs | `text-base` on mobile | Prevents iOS viewport zoom on input focus |

---

## Phase 21 Foundation — What's Already Done

This is critical context for the planner:

| What Phase 21 shipped | Impact on Phase 22 |
|-----------------------|--------------------|
| `BottomTabBar` (fixed bottom nav) | No action needed — cards render above it; `pb-20 md:pb-6` in Layout.tsx already clears the tab bar |
| `MoreSheet` using `vaul` Drawer | Pattern established for sheets; filter panel does NOT need vaul |
| `min-h-dvh` on Layout root | iOS viewport height issue resolved |
| `overflow-x-hidden` on Layout root | No horizontal scroll at page level |
| `pb-safe` on BottomTabBar | Safe area insets handled |
| `lucide-react` installed | `Filter`, `ChevronDown`, `ChevronUp` icons available for filter panel UI |

---

## Open Questions

1. **Should `TransactionCard` expand on any body tap, or only on a dedicated expand button?**
   - What we know: TXN-03 says "tapping a transaction card expands it"
   - What's unclear: Whether the category picker area should also trigger expand, or only the card body excluding the picker
   - Recommendation: Tap the card body (above the category row) expands; the category row stays as a separate interaction. This avoids event conflict (Pitfall 2 above).

2. **Should filters persist when the filter panel is collapsed on mobile?**
   - What we know: Active filter count badge shows when filters are active
   - What's unclear: Whether collapsing the panel clears filters or preserves them
   - Recommendation: Collapsing the panel PRESERVES active filters (badge shows count). User must explicitly clear each filter to remove them. This matches desktop behavior where filters persist until changed.

3. **Empty state message on mobile card view**
   - What we know: Desktop shows "No transactions match your filters." as a `<p>` below the table area
   - What's unclear: Whether the empty state needs a different treatment on mobile
   - Recommendation: Reuse the same `<p>` message — it renders fine in the card list context.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `TransactionsPage.tsx`, `CategoryPicker.tsx`, `Layout.tsx`, `BottomTabBar.tsx`, `MoreSheet.tsx` — all read directly
- `.planning/research/ARCHITECTURE.md` — Pattern 3 (Conditional Layout with Tailwind Responsive Prefixes), anti-patterns 2 and 4
- `.planning/research/FEATURES.md` — Feature table: "Transaction card layout (not table)", "Touch-friendly filter controls", "Inline category picker"
- `.planning/research/PITFALLS.md` — Pitfall 3 (Table-to-Card Conversion), Pitfall 2 (Touch Targets Below 44px)
- `.planning/phases/21-layout-foundation/21-VERIFICATION.md` — confirms Phase 21 all 11 requirements passed

### Secondary (MEDIUM confidence)
- Apple Human Interface Guidelines: 16px minimum font size to prevent iOS auto-zoom — well-documented iOS Safari behavior
- iOS Safari `<select>` native picker behavior — standard iOS web behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing Tailwind v4 + React + lucide-react cover everything
- Architecture: HIGH — patterns documented in prior research and verified in Phase 21 implementation
- Pitfalls: HIGH — directly derived from codebase inspection (CategoryPicker `text-sm`, event bubbling structure)

**Research date:** 2026-03-24
**Valid until:** 2026-04-23 (stable — no fast-moving dependencies)
