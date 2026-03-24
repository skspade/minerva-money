# Phase 23: Budget Cards — Research

**Researched:** 2026-03-23
**Domain:** Mobile card layout for the budget page — stacked category cards with progress bars and tap-to-edit allocation
**Confidence:** HIGH (all findings based on direct codebase inspection + established phase 21/22 patterns)

---

## Summary

Phases 21 (layout shell) and 22 (transaction cards) are complete and verified. The bottom tab bar, `vaul` Drawer sheets, `min-h-dvh`, safe area insets, `pb-20 md:pb-6` content padding, and the `hidden md:block` / `md:hidden` responsive gating pattern are all in production. Phase 23 applies the same pattern to `BudgetPage`.

The current `BudgetPage` renders a `grid-cols-5` table-like layout inside `BudgetGroup` components. This is unreadable at 375px. The fix is to add a mobile card list (`md:hidden`) alongside the existing desktop grid (`hidden md:block`), plus a mobile-friendly month selector (full-width with arrow buttons). A new `BudgetCategoryCard` component in `components/` receives a single `CategorySummary` object and renders: category name, color-coded progress bar (green/yellow/red), spent/budgeted amounts, and remaining. Tapping the card expands inline editing via the existing `AllocationCell` component.

The `availableColor()` function and `groupCategories()` utility already live in `BudgetPage.tsx`. The `AllocationCell` component already handles tap-to-edit with a text input. No new dependencies are needed — this is a pure layout addition using existing Tailwind, React state, and the patterns established in phases 21 and 22.

**Primary recommendation:** Create `BudgetCategoryCard.tsx` as a self-contained presentational component. Modify `BudgetPage.tsx` to: (1) gate the desktop grid with `hidden md:block`, (2) render mobile card groups with `md:hidden`, (3) make the month selector full-width on mobile.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUD-01 | User sees budget categories as stacked cards grouped by category group on mobile, replacing the grid layout | Add `md:hidden` card section alongside `hidden md:block` desktop grid in `BudgetPage`. Use existing `groupCategories()` to produce groups; render group header + `BudgetCategoryCard` per category. Same `data.categories` from existing `useQuery(trpc.budget.summary)`. |
| BUD-02 | Each budget card shows category name, progress bar (color-coded: green/yellow/red), spent/budgeted amounts, and remaining | `BudgetCategoryCard` renders: category name (text), a `<div>` progress bar (width = `Math.min(spent/allocated*100, 100)%`), color coding from existing `availableColor()` logic, and `formatCurrency()` for spent/allocated/available. No new library needed — CSS width on a colored div. |
| BUD-03 | User can tap a budget category card to expand inline editing for the allocation amount | `expandedId` state (categoryId \| null) in `BudgetPage` (same pattern as `expandedId` in `TransactionsPage`). Expanded state renders `AllocationCell` in the card. Pass `onSave` handler from `handleSetAllocation`. |
| BUD-04 | Month selector displays full-width with left/right navigation arrows on mobile | Existing month selector in `BudgetPage` is a flexbox row with `← Month Year →`. On mobile: apply `w-full` and remove the fixed `w-48` on the month label. Use `max-md:flex-col` or a dedicated mobile month-selector row with `justify-between`. Existing `setPeriod` logic is unchanged. |
| BUD-05 | Desktop budget grid layout remains unchanged on screens above 768px | Gate existing desktop markup with `hidden md:block`. The `BudgetGroup` component and all its interior `grid-cols-5` markup stays identical — just wrapped in a responsive visibility container. |
</phase_requirements>

---

## Standard Stack

### Core — No New Dependencies Required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind v4 | ^4.2.2 | `md:hidden` / `hidden md:block` responsive gating, progress bar width via inline style or `w-[X%]` | Already in project; same pattern used in Phase 22 |
| React (useState) | ^19 | `expandedId` (number \| null) for card expand state | Built-in; same pattern as TransactionsPage |
| lucide-react | ^1.0.1 | ChevronDown / ChevronRight expand indicator on cards | Already installed; used in BottomTabBar and MoreSheet |

### No New npm Installs Needed

The entire phase is implementable with existing dependencies. Progress bars are pure CSS (`<div>` with `style={{ width: '...%' }}`). The tap-to-edit interaction reuses the existing `AllocationCell` component verbatim. Group headers on mobile reuse the same `groupCategories()` function.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS width inline style for progress bar | A progress bar library | 0 deps, 2 lines of CSS. Library adds bundle weight for no UX gain. |
| `AllocationCell` reused as-is | New mobile-specific input | `AllocationCell` already has tap-to-edit, focus, blur-to-save, Escape key. Reuse it directly inside `BudgetCategoryCard`. |
| Expand state in `BudgetPage` (`expandedId`) | Expand state inside `BudgetCategoryCard` | Page-level ensures only one card expanded at a time (cleaner UX); matches the TransactionCard pattern. |

**Installation:** None required.

---

## Architecture Patterns

### Recommended File Changes

```
packages/client/src/
├── components/
│   └── BudgetCategoryCard.tsx  # NEW — presentational, receives CategorySummary + handlers
├── pages/
│   └── BudgetPage.tsx          # MODIFY — add md:hidden card section, fix month selector
```

No other files change for this phase.

### Pattern 1: Desktop Grid / Mobile Cards (Conditional DOM)

Same as Phase 22's desktop table / mobile cards split. Both render from the same data; CSS controls which is visible.

```tsx
{/* Desktop grid — hidden on mobile */}
<div className="hidden md:block">
  <div className="grid grid-cols-5 gap-4 px-4 py-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
    <div>Category</div>
    <div className="text-right">Default</div>
    <div className="text-right">Allocated</div>
    <div className="text-right">Spent</div>
    <div className="text-right">Available</div>
  </div>
  <div className="space-y-2">
    {groups.map(group => (
      <BudgetGroup key={group.name} ... />
    ))}
  </div>
</div>

{/* Mobile cards — hidden on desktop */}
<div className="md:hidden space-y-4">
  {groups.map(group => (
    <div key={group.name}>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">
        {group.name}
      </h3>
      <div className="space-y-2">
        {group.categories.map(cat => (
          <BudgetCategoryCard
            key={cat.categoryId}
            cat={cat}
            isExpanded={expandedId === cat.categoryId}
            onToggle={() => setExpandedId(prev => prev === cat.categoryId ? null : cat.categoryId)}
            onSave={cents => handleSetAllocation(cat.categoryId, period, cents)}
          />
        ))}
      </div>
    </div>
  ))}
</div>
```

### Pattern 2: BudgetCategoryCard — Progress Bar + Tap-to-Edit

```tsx
// Source: direct codebase analysis of BudgetPage.tsx + TransactionCard.tsx pattern
export default function BudgetCategoryCard({ cat, isExpanded, onToggle, onSave }) {
  const spentPct = cat.allocated > 0
    ? Math.min((cat.spent / cat.allocated) * 100, 100)
    : 0;

  // Color logic mirrors availableColor() in BudgetPage — but for progress bar fill
  const barColor =
    cat.available < 0 ? 'bg-red-500' :
    cat.available < cat.allocated * 0.2 ? 'bg-yellow-400' :
    'bg-green-500';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-3 min-h-[44px]"
      >
        {/* Row 1: category name + available */}
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{cat.categoryName}</span>
          <span className={`text-sm font-medium ${cat.available < 0 ? 'text-red-600' : cat.available === 0 ? 'text-gray-500' : 'text-green-600'}`}>
            {formatCurrency(cat.available)} left
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${spentPct}%` }}
          />
        </div>
        {/* Row 2: spent / budgeted */}
        <div className="mt-1 text-xs text-gray-500">
          {formatCurrency(cat.spent)} of {formatCurrency(cat.allocated)}
        </div>
      </button>

      {/* Expanded: tap-to-edit allocation */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Allocation</span>
            <AllocationCell value={cat.allocated} onSave={onSave} />
          </div>
        </div>
      )}
    </div>
  );
}
```

### Pattern 3: Mobile Month Selector (Full-Width)

The current month selector is nested inside a `flex items-center justify-between` row alongside the "Budget" heading. On mobile, it should become full-width with arrows on each side of the month label.

```tsx
{/* Mobile month selector — replaces the inline selector on small screens */}
<div className="flex md:hidden items-center justify-between w-full mb-4">
  <button
    onClick={() => setPeriod(getPreviousPeriod(period))}
    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-gray-900"
  >
    ←
  </button>
  <span className="text-lg font-medium">{formatPeriodDisplay(period)}</span>
  <button
    onClick={() => setPeriod(getNextPeriod(period))}
    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-gray-900"
  >
    →
  </button>
</div>

{/* Desktop month selector — unchanged, hidden on mobile */}
<div className="hidden md:flex items-center gap-4">
  <button onClick={() => setPeriod(getPreviousPeriod(period))} className="px-3 py-1 ...">←</button>
  <span className="text-lg font-medium w-48 text-center">{formatPeriodDisplay(period)}</span>
  <button onClick={() => setPeriod(getNextPeriod(period))} className="px-3 py-1 ...">→</button>
</div>
```

### Anti-Patterns to Avoid

- **Modifying `BudgetGroup`:** Do not add mobile rendering inside `BudgetGroup`. It is the desktop-only component. Mobile is handled entirely by `BudgetCategoryCard` in a separate DOM branch.
- **Extracting `availableColor` before phase starts:** The function is already defined at module scope in `BudgetPage.tsx`. `BudgetCategoryCard` needs access to it — either move it to a shared lib (overkill) or accept color logic as a prop/reimplement inline (fine — it's 4 lines).
- **Animating progress bar width:** Tailwind's `transition-all` on the bar width is a polish touch, not a requirement. Do not add animation libraries.
- **Overcomplicating AllocationCell reuse:** `AllocationCell` is a module-scope function inside `BudgetPage.tsx`, not an exported component. To use it in `BudgetCategoryCard`, either: (a) import by moving `AllocationCell` to its own file, or (b) pass an `onSave` callback and let `BudgetCategoryCard` render its own simpler inline input. Option (b) avoids file proliferation. Option (a) is cleaner if `AllocationCell` will be reused again later. Recommended: option (a) — move `AllocationCell` to `components/AllocationCell.tsx` and import in both `BudgetPage` and `BudgetCategoryCard`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom SVG arc, canvas element | `<div>` with `style={{ width: '...%' }}` inside a gray container | 2 lines of HTML/CSS; no library needed for a linear progress bar |
| Tap-to-edit number input | New numeric keyboard input, modal number picker | Existing `AllocationCell` | Already handles focus, select-on-open, blur-to-save, Escape key, cents parsing |
| Color thresholds | JS color interpolation library | Inline ternary on `cat.available` and `cat.allocated` | 3 conditions, matches existing `availableColor()` logic |
| Sheet/drawer for allocation editing | `vaul` Drawer | Inline expand (same as TransactionCard expand) | Inline expand is sufficient; a sheet would add complexity and close/open animation overhead for a simple number input |

**Key insight:** Every complex piece already exists (`AllocationCell`, `groupCategories`, `availableColor`, `formatCurrency`, progress-percentage math). Phase 23 is a layout composition task, not a logic task.

---

## Common Pitfalls

### Pitfall 1: `AllocationCell` Is Not Exported

**What goes wrong:** `AllocationCell` is a module-scope function inside `BudgetPage.tsx`, not exported. Trying to import it into `BudgetCategoryCard.tsx` will fail.

**Why it happens:** The component was written as a page-local helper, not a shared component.

**How to avoid:** Move `AllocationCell` to `packages/client/src/components/AllocationCell.tsx` and update `BudgetPage.tsx` to import from there. This is a small, clean refactor — do it as the first task of the phase.

**Warning signs:** TypeScript import error immediately.

### Pitfall 2: Progress Bar Width at 0% Allocation

**What goes wrong:** If `cat.allocated === 0`, `(cat.spent / cat.allocated) * 100` is `Infinity` or `NaN`. `style={{ width: 'Infinity%' }}` renders as invalid CSS.

**Why it happens:** Unbudgeted categories have `allocated = 0` but may still have `spent > 0`.

**How to avoid:** Guard the calculation: `const spentPct = cat.allocated > 0 ? Math.min((cat.spent / cat.allocated) * 100, 100) : (cat.spent > 0 ? 100 : 0);`

**Warning signs:** Progress bar disappears or renders at full width for unbudgeted categories.

### Pitfall 3: Month Selector Layout Breaking on Narrow Screens

**What goes wrong:** The current month selector has a fixed `w-48` on the month label span. On mobile at 375px, if arrows plus `w-48` plus heading overflow, the row wraps or truncates.

**Why it happens:** Fixed widths don't respect small viewports when inside a flex row with other elements.

**How to avoid:** The mobile selector is a separate DOM element (`flex md:hidden`). It is full-width with `justify-between` — no fixed width needed on the month label. The desktop selector keeps `w-48` unchanged.

### Pitfall 4: `expandedId` Conflicts with Group Collapse State

**What goes wrong:** `BudgetPage` already has `collapsedGroups: Set<string>` state. Adding `expandedId: number | null` state needs to be separate. Conflating them (e.g., using collapse state to also drive card expansion) produces confusing behavior.

**Why it happens:** Developer tries to reuse existing state for a new purpose.

**How to avoid:** Add `expandedId` as a second, independent `useState`. Collapsing a group implicitly hides its cards; no need to reset `expandedId` on group collapse (the hidden cards just don't render).

### Pitfall 5: Forgotten `min-h-[44px]` on Card Toggle Button

**What goes wrong:** The card's tappable area is smaller than 44px, causing mis-taps on iPhone.

**Why it happens:** The category name row with small font is naturally short (24-28px).

**How to avoid:** The outer `<button onClick={onToggle}>` must have `min-h-[44px]`. The `py-3` padding in the example above achieves this.

---

## Code Examples

### Progress Bar — Color-Coded

```tsx
// Pure CSS progress bar, no library
// Source: direct analysis of BudgetPage.tsx availableColor() + CSS best practice

const spentPct = cat.allocated > 0
  ? Math.min((cat.spent / cat.allocated) * 100, 100)
  : cat.spent > 0 ? 100 : 0;

const barColor =
  cat.available < 0 ? 'bg-red-500' :           // over budget → red
  cat.available < cat.allocated * 0.2 ? 'bg-yellow-400' :  // <20% remaining → yellow
  'bg-green-500';                               // comfortable → green

<div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
  <div
    className={`h-full rounded-full ${barColor}`}
    style={{ width: `${spentPct}%` }}
  />
</div>
```

### AllocationCell — Move to Shared Component

```tsx
// packages/client/src/components/AllocationCell.tsx
// Move the existing AllocationCell function from BudgetPage.tsx verbatim
// Change: add export keyword

export function AllocationCell({ value, onSave }: { value: number; onSave: (cents: number) => void }) {
  // ... existing implementation unchanged ...
}
```

Then in `BudgetPage.tsx`:
```tsx
import { AllocationCell } from '../components/AllocationCell';
// Remove the local AllocationCell function
```

### Expand State Pattern (matches Phase 22)

```tsx
// In BudgetPage — same pattern as expandedId in TransactionsPage
const [expandedId, setExpandedId] = useState<number | null>(null);

// In mobile card section:
<BudgetCategoryCard
  cat={cat}
  isExpanded={expandedId === cat.categoryId}
  onToggle={() => setExpandedId(prev => prev === cat.categoryId ? null : cat.categoryId)}
  onSave={cents => handleSetAllocation(cat.categoryId, period, cents)}
/>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `min-h-screen` | `min-h-dvh` | Phase 21 | iOS Safari viewport correct |
| Custom Sheet component | `vaul` Drawer | Phase 21 | Drag-to-dismiss, iOS rubber-banding |
| Inline JS breakpoint hooks | CSS-only `hidden md:block` | Phase 21 | No layout shift, no resize listeners |
| Table row for transactions | `TransactionCard` component | Phase 22 | Readable on 375px |

Phase 23 follows all patterns established in phases 21 and 22 — no new patterns introduced.

---

## Open Questions

1. **Where should `availableColor()` live?**
   - What we know: It is currently a module-scope function in `BudgetPage.tsx`. `BudgetCategoryCard` needs equivalent logic.
   - What's unclear: Whether to export it from `BudgetPage`, move it to `lib/format.ts`, or reimplement inline in the card.
   - Recommendation: Reimplement the 4-line color logic inline in `BudgetCategoryCard` as `barColor` for the progress bar and `availableTextColor` for the remaining amount text. Avoid creating a dependency on `BudgetPage` from a component. If a third consumer appears, move to `lib/format.ts` then.

2. **Should "Available to Budget" summary card show on mobile?**
   - What we know: The `data.availableToBudget` summary card already exists in `BudgetPage` and is not inside a desktop-gated wrapper.
   - What's unclear: Whether the summary card needs mobile-specific layout changes.
   - Recommendation: The summary card is already a simple single-value `p-4 bg-white rounded-lg`. It works fine at 375px with no changes. Leave it unchanged — it renders above both desktop and mobile sections.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection of `packages/client/src/pages/BudgetPage.tsx` — full component tree, `AllocationCell`, `BudgetGroup`, `groupCategories`, `availableColor`, `CategorySummary` interface
- Direct codebase inspection of `packages/client/src/components/TransactionCard.tsx` — expand pattern, min-h-[44px] usage
- Direct codebase inspection of `packages/client/src/components/Layout.tsx` — confirmed `pb-20 md:pb-6` on main, `hidden md:block` nav, `BottomTabBar` placement
- Direct codebase inspection of `packages/client/src/components/MoreSheet.tsx` — confirmed `vaul` Drawer is the sheet primitive in use
- `.planning/phases/22-transaction-cards/22-RESEARCH.md` — confirmed patterns: `md:hidden` / `hidden md:block` gating, `expandedId` state pattern, no new deps
- `packages/client/package.json` — confirmed installed: Tailwind v4 ^4.2.2, React ^19, lucide-react ^1.0.1, vaul ^1.1.2

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` — Budget Page Mobile Data Flow section confirms: `BudgetCategoryCard` (new), `AllocationCell` inline-edit preserved, same `groupCategories()` output
- `.planning/research/FEATURES.md` — confirms progress bar color coding is green/yellow/red and leverages existing `availableColor()` logic

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries directly inspected in package.json; no new dependencies
- Architecture: HIGH — patterns established in phases 21 and 22; direct component tree inspection
- Pitfalls: HIGH — identified from direct code analysis (AllocationCell not exported, division by zero guard, fixed width on month label)

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable patterns; dependencies don't change between phases)
