# Phase 25: Remaining Pages - Research

**Researched:** 2026-03-23
**Domain:** Mobile responsive CSS — Tailwind breakpoint overrides for 6 remaining pages
**Confidence:** HIGH

## Summary

Phase 25 completes the mobile-friendly UI milestone by making the six remaining pages (Dashboard, Accounts, Reports, Chat, Categories, Rules) render correctly at 375px. The milestone's CSS strategy is established: Tailwind v4 `max-md:` variants for mobile-only overrides, leaving all existing desktop classes untouched. No new libraries are needed — this is pure CSS work using the patterns already in use across Phases 21-24.

The good news: four of the six pages need minimal or no structural changes. DashboardPage already renders `grid-cols-1 md:grid-cols-2` — it is single-column by default on mobile. AccountsPage already uses stacked `space-y-3` cards with `flex items-center justify-between` — it is already mobile-friendly. The main work is in ReportsPage (date filter row overflow, chart labels), ChatPage (safe area inset on the input bar, height calculation), CategoriesPage (drag handle tap targets), and RulesPage (table → card layout on mobile).

**Primary recommendation:** Apply `max-md:` Tailwind overrides in-place on each page file. No new components needed — all six pages can be fixed with targeted class additions. Budget ~2-3 tasks: one for the near-zero-work pages (Dashboard, Accounts), one for the structural changes (RulesPage table → cards), and one for the nuanced fixes (ReportsPage filters, ChatPage height/safe-area, CategoriesPage tap targets).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAGE-01 | Dashboard page displays correctly at 375px (single-column cards, no overflow) | DashboardPage already uses `grid-cols-1 md:grid-cols-2` — already single-column on mobile. Minor audit needed for any overflow. |
| PAGE-02 | Accounts page stacks account cards vertically with no horizontal overflow on mobile | AccountsPage already uses `space-y-3` stacked cards with `flex items-center justify-between` — already mobile-friendly. Minor audit needed. |
| PAGE-03 | Reports page charts render readable at 375px width with simplified axis labels | ReportsPage has a `flex items-center justify-between` header row with two date inputs that will overflow at 375px. Charts use `ResponsiveContainer` and handle width. Pie `outerRadius={120}` may be large at 375px. YAxis currency labels are wide. |
| PAGE-04 | Chat page input bar is fixed above the bottom tab bar on mobile with safe area inset | ChatPage input bar is `border-t bg-white px-4 py-3` — no safe area inset. Height calculation `h-[calc(100vh-56px)]` doesn't account for bottom tab bar (56px) on mobile or safe area. Needs `pb-[env(safe-area-inset-bottom)]` and height recalculation. |
| PAGE-05 | Categories page drag handles meet 44px tap target on mobile | Drag handles are `<button>` with only the `⠿` glyph and no padding — far below 44px. Need `min-h-[44px] min-w-[44px] flex items-center justify-center` on mobile. |
| PAGE-06 | Rules page displays rules as cards instead of table rows on mobile | RulesPage renders a full `<table>` wrapped in `overflow-x-auto` — scrollable but not a card layout. Need mobile card layout using `max-md:hidden` on the table and `md:hidden` on a card list. The `Drawer.Root` for RuleForm on mobile is already implemented (Phase 24). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS v4 | 4.x | Mobile breakpoint overrides | Already in use; `max-md:` variant is the project convention |
| `vaul` | Already installed | Drawer bottom sheets | Already implemented in RulesPage for the RuleForm drawer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Recharts `ResponsiveContainer` | Already in use | Chart width adaptation | Already wrapping all charts — handles width automatically |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `max-md:` overrides | Mobile-first rewrite | Rewriting would risk desktop regression; `max-md:` is safer and established project pattern |
| Custom card component for Rules | Inline JSX card layout | Custom component is over-engineered for one page; inline is fine |

**Installation:** No new packages needed.

## Architecture Patterns

### Pattern 1: Established Project Breakpoint Convention
**What:** The project uses `md:` as the mobile/desktop breakpoint (768px). Mobile-only styles use `max-md:`, desktop-only use `md:`. This matches the `BottomTabBar` (`md:hidden`) and desktop nav (`hidden md:block`) pattern already shipped.

**When to use:** All responsive changes in this phase use `max-md:` for mobile overrides.

```tsx
// Mobile-only override pattern (established in Phase 21-24)
<div className="flex items-center justify-between max-md:flex-col max-md:items-start gap-3">
```

### Pattern 2: Table → Card Pattern for Mobile (RulesPage)
**What:** Hide the table with `hidden md:table` (or `max-md:hidden`) and render a card list with `md:hidden`. Cards surface all the same data as table columns.

**When to use:** RulesPage only — the only remaining page with a full `<table>` on mobile.

```tsx
{/* Desktop table */}
<div className="overflow-x-auto max-md:hidden">
  <table>...</table>
</div>

{/* Mobile card list */}
<div className="md:hidden space-y-3">
  {rules.map(rule => (
    <div key={rule.id} className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="font-medium text-sm">{rule.name}</span>
        <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">Score: {rule.specificityScore}</span>
      </div>
      <p className="text-xs text-gray-600 mb-1">{formatConditions(rule)}</p>
      <p className="text-xs text-gray-500 mb-3">→ {rule.categoryName}</p>
      <div className="flex gap-3 border-t border-gray-100 pt-2">
        <button onClick={() => setEditingRule(rule)} className="text-blue-600 text-sm min-h-[44px] px-2">Edit</button>
        <InlineConfirm ...><button className="text-red-600 text-sm min-h-[44px] px-2">Delete</button></InlineConfirm>
      </div>
    </div>
  ))}
</div>
```

### Pattern 3: ChatPage Height Fix
**What:** The `h-[calc(100vh-56px)]` accounts for the desktop nav height (56px) but on mobile there is no top nav — instead there is a 56px bottom tab bar. The calculation needs updating for mobile.

**When to use:** ChatPage only.

The correct mobile height:
- Desktop: `h-[calc(100vh-56px)]` (56px = top navbar)
- Mobile: `h-[calc(100dvh-56px-env(safe-area-inset-bottom))]` (56px = bottom tab bar)

Using Tailwind with a responsive inline style or a calculated class. Since this uses `dvh` (dynamic viewport height, handles iOS Safari URL bar), the safest approach:

```tsx
// Replace the outer div class
<div className="h-[calc(100dvh-56px)] md:h-[calc(100vh-56px)] -mx-4 -mt-6 flex flex-col">
```

And the input bar gets safe area inset:
```tsx
<div className="border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
```

Note: `LAYOUT-02` (already marked complete) says "Chat input bar respects iPhone safe area insets" — but inspection of the current ChatPage shows no `pb-safe` or `env(safe-area-inset-bottom)` on the input bar. This may have been incomplete.

### Pattern 4: Drag Handle Tap Target (CategoriesPage)
**What:** The `⠿` drag handle buttons have no padding. Apple HIG requires 44x44px minimum tap targets. On mobile, wrap the button content in sufficient padding.

**When to use:** Both `SortableCategory` and `SortableGroup` drag handle buttons.

```tsx
// Before
<button {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600" title="Drag to reorder">
  ⠿
</button>

// After
<button {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 max-md:min-h-[44px] max-md:min-w-[44px] max-md:flex max-md:items-center max-md:justify-center" title="Drag to reorder">
  ⠿
</button>
```

### Pattern 5: ReportsPage Date Filter Row
**What:** The `flex items-center justify-between` header row with two `<input type="date">` and labels will overflow at 375px. Stack vertically on mobile.

```tsx
// Before
<div className="flex items-center justify-between mb-6">
  <h2>Reports</h2>
  <div className="flex items-center gap-3">
    <label>From</label><input />
    <label>To</label><input />
  </div>
</div>

// After
<div className="flex items-center justify-between mb-6 max-md:flex-col max-md:items-start max-md:gap-3">
  <h2>Reports</h2>
  <div className="flex items-center gap-3 max-md:flex-wrap max-md:w-full">
    <label>From</label><input className="max-md:flex-1" />
    <label>To</label><input className="max-md:flex-1" />
  </div>
</div>
```

For the PieChart: `outerRadius={120}` is fine at 375px since the chart is 350px tall and `ResponsiveContainer` controls width. The label text may overflow — consider `outerRadius={80}` on mobile or removing inline labels in favor of the `<Legend />` already present.

### Anti-Patterns to Avoid
- **Hardcoding pixel values in chart dimensions for mobile**: Recharts `ResponsiveContainer width="100%"` handles width. Only override `outerRadius` via conditional props if labels visibly overflow.
- **Using `vh` instead of `dvh` on ChatPage**: iOS Safari's address bar changes `100vh` unpredictably. `100dvh` is the correct unit (supported iOS 15.4+).
- **Adding `pb-safe` class without confirming Tailwind config**: The project uses explicit `env(safe-area-inset-bottom)` in arbitrary values (`pb-[env(safe-area-inset-bottom)]`) rather than a `pb-safe` utility. Check if `pb-safe` is defined in the Tailwind config before using it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-to-dismiss on Rules drawer | Custom touch handler | `vaul` `Drawer.Root` (already in RulesPage) | Already implemented in Phase 24 |
| Chart resizing | Custom resize observer | Recharts `ResponsiveContainer` | Already wrapping all charts |
| Mobile card layout for rules | Custom hook or library | Plain JSX with `md:hidden` / `max-md:hidden` | Simple enough for inline |

**Key insight:** This phase is pure CSS + minimal JSX duplication. No new libraries, no new components, no hooks.

## Common Pitfalls

### Pitfall 1: ChatPage Height Double-Counts Nav
**What goes wrong:** `h-[calc(100vh-56px)]` was written for the desktop 56px top navbar. On mobile, the top navbar is hidden and replaced with a 56px bottom tab bar — the 56px needs to still be subtracted, but from the bottom, not the top.
**Why it happens:** The original height calculation assumed desktop layout.
**How to avoid:** Use `dvh` for mobile height and ensure bottom padding on the message area clears the input bar.
**Warning signs:** Chat input bar overlapping the bottom tab bar; or the message area being too short.

### Pitfall 2: LAYOUT-02 Already Marked Complete but ChatPage Missing Safe Area
**What goes wrong:** `LAYOUT-02` in REQUIREMENTS.md is checked off ("Chat input bar respects iPhone safe area insets"), but the actual ChatPage code has no `env(safe-area-inset-bottom)` on the input bar.
**Why it happens:** The requirement may have been marked complete prematurely, or the implementation was done elsewhere (e.g., on the BottomTabBar, not the Chat input).
**How to avoid:** Verify the Chat input bar actually has the safe area inset applied. The BottomTabBar having it does not help the Chat input (which sits above BottomTabBar and needs its own bottom clearance).
**Warning signs:** On iPhone X+, the Chat input bar's send button sits right at the home indicator.

### Pitfall 3: dnd-kit Drag Handle Touch Interaction with Tap Target Increase
**What goes wrong:** Increasing the drag handle's size to 44px may conflict with `activationConstraint: { distance: 5 }` — a user trying to tap-to-focus an adjacent input might accidentally initiate a drag.
**Why it happens:** The larger touch target increases the chance of the 5px threshold being reached during a normal tap.
**How to avoid:** Keep `distance: 5` as-is. The 44px min-height/width is for accessibility (the visual/touchable area), but `activationConstraint` governs drag initiation — both can coexist safely.
**Warning signs:** Categories unexpectedly reordering on a simple tap.

### Pitfall 4: ReportsPage PieChart Label Overflow
**What goes wrong:** PieChart labels (`label={({ name, percent }) => ...}`) render as SVG text outside the chart bounds. At 375px container width with `outerRadius={120}`, labels on the left and right edges may extend beyond the SVG viewport.
**Why it happens:** Recharts PieChart doesn't clip labels to the container.
**How to avoid:** Two options: (a) reduce `outerRadius` to ~80 on mobile, (b) remove the `label` prop and rely on the `<Legend />` for identification. Option (b) is simpler — the legend already renders category names below the chart.
**Warning signs:** Category names cut off at the sides of the chart on mobile.

### Pitfall 5: DashboardPage Sync Status Date Overflow
**What goes wrong:** The sync status card renders `{new Date(syncStatus.lastSync.startedAt).toLocaleString()}` as a right-aligned `text-sm` next to a label. `toLocaleString()` produces "3/23/2026, 9:45:00 AM" which is long and may cause the `flex justify-between` row to compress the label.
**Why it happens:** Long date strings in `justify-between` flex rows.
**How to avoid:** Dashboard already uses `grid-cols-1` on mobile so cards are full-width — the `flex justify-between` rows inside cards have plenty of space at 375px minus padding. Likely not a problem, but worth verifying during testing.

## Code Examples

### ReportsPage YAxis Width on Mobile
```tsx
// Recharts YAxis with wide currency labels can compress the chart area
// Add width to prevent label truncation
<YAxis tickFormatter={currencyFormatter} width={60} />
```

### ChatPage Safe Area + Height
```tsx
// Outer container
<div className="h-[calc(100dvh-56px)] md:h-[calc(100vh-56px)] -mx-4 -mt-6 flex flex-col">

// Input bar — safe area inset so it clears iPhone home indicator
<div className="border-t border-gray-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
```

Note: The Chat page sits inside `<main className="pb-20 md:pb-6">` which already provides 80px bottom padding on mobile. But the ChatPage uses `-mt-6 -mx-4` to break out of the main padding. The `-mt-6` removes the top padding; `-mx-4` removes side padding. The `pb-20` on `<main>` does NOT apply inside the ChatPage because ChatPage fills the full height itself. The input bar must handle its own safe area.

### CategoriesPage Drag Handle 44px Target
```tsx
<button
  {...attributes}
  {...listeners}
  className="cursor-grab text-gray-400 hover:text-gray-600 max-md:min-h-[44px] max-md:min-w-[44px] max-md:flex max-md:items-center max-md:justify-center"
  title="Drag to reorder"
>
  ⠿
</button>
```

### RulesPage Mobile Card Structure
```tsx
{/* Mobile card list — hidden on desktop */}
<div className="md:hidden space-y-3">
  {rules.map(rule => (
    <div key={rule.id} className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-1">
        <span className="font-medium text-sm">{rule.name}</span>
        <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 ml-2 flex-shrink-0">
          Score: {rule.specificityScore}
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-1">{formatConditions(rule)}</p>
      <p className="text-xs text-gray-400 mb-3">Category: {rule.categoryName}</p>
      <div className="flex gap-3 border-t border-gray-100 pt-2">
        <button
          onClick={() => setEditingRule(rule)}
          className="text-blue-600 text-sm min-h-[44px] px-2"
        >Edit</button>
        <InlineConfirm message={`Delete rule "${rule.name}"?`} onConfirm={() => deleteMut.mutate({ id: rule.id })}>
          <button className="text-red-600 text-sm min-h-[44px] px-2">Delete</button>
        </InlineConfirm>
      </div>
    </div>
  ))}
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `100vh` for full-height layouts | `100dvh` (dynamic viewport height) | iOS 15.4+ / 2022 | Handles iOS Safari address bar correctly |
| `pb-safe` utility class | `pb-[env(safe-area-inset-bottom)]` arbitrary value | Tailwind v3+ | Works without plugin if `viewport-fit=cover` is set |

## Per-Page Assessment

| Page | Current State | Mobile Issues | Work Required |
|------|--------------|---------------|---------------|
| DashboardPage | `grid-cols-1 md:grid-cols-2` stacked cards | Very likely fine. Sync date string may be long but has space. | LOW — verify, likely 0 changes |
| AccountsPage | `space-y-3` stacked cards with `flex justify-between` | Already mobile-friendly | LOW — verify, likely 0 changes |
| ReportsPage | `flex` header row with 2 date inputs; 3 Recharts charts | Date filter row overflows; PieChart labels may overflow | MEDIUM — 2-3 targeted fixes |
| ChatPage | `h-[calc(100vh-56px)]` full-height; input bar no safe area | Height calc wrong on mobile; input bar lacks safe area inset | MEDIUM — 2 targeted fixes |
| CategoriesPage | `⠿` drag handles with no padding | Drag handle tap targets ~16px, need 44px | LOW — add padding to 2 button elements |
| RulesPage | `<table>` in `overflow-x-auto` | Table scrolls horizontally; need card layout on mobile | MEDIUM — add mobile card JSX (Drawer for RuleForm already done) |

## Open Questions

1. **LAYOUT-02 already marked complete for Chat safe area**
   - What we know: LAYOUT-02 is checked in REQUIREMENTS.md; ChatPage has no `env(safe-area-inset-bottom)` on its input bar.
   - What's unclear: Was the safe area inset applied somewhere else? Or was it marked complete prematurely?
   - Recommendation: Treat as unimplemented and add it in this phase. Safe to do — adding `pb-[env(safe-area-inset-bottom)]` has no effect on desktop (evaluates to 0 without `viewport-fit=cover`).

2. **DashboardPage Sync Status date string overflow**
   - What we know: `toLocaleString()` produces a long string in a `flex justify-between` row inside a full-width card at 375px.
   - What's unclear: Whether it actually wraps or compresses badly at 375px minus `p-4` padding (= 343px usable).
   - Recommendation: Verify during manual testing. If overflow occurs, switch to `toLocaleDateString()` + `toLocaleTimeString({ hour: '2-digit', minute: '2-digit' })` separately on two lines.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `packages/client/src/pages/DashboardPage.tsx`, `AccountsPage.tsx`, `ReportsPage.tsx`, `ChatPage.tsx`, `CategoriesPage.tsx`, `RulesPage.tsx`, `components/Layout.tsx`
- `.planning/research/FEATURES.md` — existing mobile analysis by project (HIGH — authored by project team)
- `.planning/REQUIREMENTS.md` — PAGE-01 through PAGE-06 requirements

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — established project decisions (CSS-first, `max-md:`, `vaul`, no JS breakpoint hooks)

### Tertiary (LOW confidence)
- None — all findings based on direct code inspection and established project patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing
- Architecture: HIGH — patterns directly derived from code inspection
- Pitfalls: HIGH — identified from actual code issues (ChatPage height, missing safe area, tiny drag handles, table overflow)

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable — CSS-only work, no rapidly changing APIs)
