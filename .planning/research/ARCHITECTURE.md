# Architecture Research

**Domain:** Mobile-friendly UI — bottom tab bar, card layouts, mobile sheets/modals, responsive navigation on React + Tailwind v4
**Researched:** 2026-03-23
**Confidence:** HIGH (all findings based on direct codebase inspection)

---

## Standard Architecture

### System Overview (Client Layer, v2.2 Mobile UI)

```
┌─────────────────────────────────────────────────────────────┐
│                    app.tsx (BrowserRouter)                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Layout.tsx  ← MODIFY                 │    │
│  │                                                      │    │
│  │  ┌──────────────────┐  ┌────────────────────────┐   │    │
│  │  │  TopNav (desktop) │  │  BottomTabBar (mobile) │   │    │
│  │  │  hidden on mobile │  │  hidden on desktop     │   │    │
│  │  └──────────────────┘  └────────────────────────┘   │    │
│  │                                                      │    │
│  │  <main> <Outlet />  ← pages render here             │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Pages: Dashboard | Accounts | Transactions | Budget         │
│         Categories | Rules | Transfers | Reports | Chat      │
└─────────────────────────────────────────────────────────────┘
                              │
                     tRPC + TanStack Query
                              │
                    Express :3001 (unchanged)
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `Layout.tsx` | Shell: top nav (desktop), bottom tab bar (mobile), main content padding | MODIFY |
| `BottomTabBar` (new) | 5 primary tabs + "More" sheet trigger, active state, 44px tap targets | NEW |
| `MoreSheet` (new) | Bottom sheet listing overflow pages (Categories, Rules, Transfers, Reports, Chat) | NEW |
| `Sheet` (new) | Generic bottom sheet primitive: backdrop, slide-up panel, scroll lock | NEW |
| `TransactionCard` (new) | Mobile card layout for a single transaction row with swipe/tap category picker | NEW |
| `BudgetCategoryCard` (new) | Mobile stacked card: category name, progress bar, allocated/spent/available | NEW |
| `TransactionsPage` | Table on desktop, card list on mobile; filter bar collapses to sheet on mobile | MODIFY |
| `BudgetPage` | 5-column grid on desktop, stacked cards on mobile; inline edit becomes sheet on mobile | MODIFY |
| `DashboardPage` | Already uses `grid-cols-1 md:grid-cols-2` — minor touch target and spacing fixes | MINOR |
| `AccountsPage` | Already card-based — add tap target sizing and padding adjustments | MINOR |
| `ReportsPage` | Date range controls stack on mobile; charts use `ResponsiveContainer` (already) | MINOR |
| `ChatPage` | Height calc must account for bottom tab bar height; input bar fixed above tab bar | MODIFY |
| `CategoriesPage` | DnD works on desktop only; no mobile drag needed (existing pattern fine) | MINOR |
| `RulesPage` | Table → card list on mobile; RuleForm becomes full-screen sheet on mobile | MODIFY |
| `ManualLinkModal` | `grid-cols-2` → stacked on mobile; `max-w-4xl` → full-screen sheet | MODIFY |
| `SplitModal` | Already `max-w-lg mx-4` — adjust to full-screen sheet below sm breakpoint | MODIFY |
| `ManualTransactionForm` | Inline form → full-screen sheet on mobile | MODIFY |

---

## Recommended Project Structure

```
packages/client/src/
├── components/
│   ├── Layout.tsx              # MODIFY — add BottomTabBar, mobile padding
│   ├── BottomTabBar.tsx        # NEW — primary nav for mobile
│   ├── Sheet.tsx               # NEW — reusable bottom sheet primitive
│   ├── MoreSheet.tsx           # NEW — overflow page links (uses Sheet)
│   ├── TransactionCard.tsx     # NEW — mobile transaction row
│   ├── BudgetCategoryCard.tsx  # NEW — mobile budget row
│   ├── CategoryPicker.tsx      # existing — no changes needed
│   ├── InlineConfirm.tsx       # existing — no changes needed
│   ├── ManualLinkModal.tsx     # MODIFY — stacked layout + full-screen on mobile
│   ├── ManualTransactionForm.tsx  # MODIFY — sheet on mobile
│   ├── RetroactivePreview.tsx  # existing — minor touch target fixes
│   ├── RuleForm.tsx            # MODIFY — full-screen sheet on mobile
│   ├── SplitModal.tsx          # MODIFY — full-screen sheet on mobile
│   ├── SyncButton.tsx          # existing — 44px tap target
│   └── SyncStatus.tsx          # existing — no changes needed
├── pages/
│   ├── DashboardPage.tsx       # MINOR — spacing only
│   ├── AccountsPage.tsx        # MINOR — padding/tap targets
│   ├── TransactionsPage.tsx    # MODIFY — card layout + filter sheet on mobile
│   ├── BudgetPage.tsx          # MODIFY — stacked card layout on mobile
│   ├── CategoriesPage.tsx      # MINOR — tap targets on drag handles
│   ├── RulesPage.tsx           # MODIFY — card list + rule form as sheet
│   ├── TransfersPage.tsx       # MINOR — stacked pair layout on mobile
│   ├── ReportsPage.tsx         # MINOR — stack date controls vertically
│   └── ChatPage.tsx            # MODIFY — bottom inset for tab bar
├── lib/
│   └── format.ts               # existing — no changes
├── styles/
│   └── app.css                 # existing — no changes (Tailwind v4 via @import)
├── app.tsx                     # existing — no changes
├── main.tsx                    # existing — no changes
└── trpc.ts                     # existing — no changes
```

### Structure Rationale

- **New components in `components/`:** Sheet, BottomTabBar, MoreSheet are generic UI primitives reused across pages — belong with other shared components, not inside page files.
- **TransactionCard and BudgetCategoryCard in `components/`:** Extracted from page files to keep page components focused on data fetching and layout logic, not rendering details.
- **No new directories:** The existing flat structure is appropriate for this codebase size. No `mobile/` subdirectory needed — components are responsive, not mobile-exclusive.

---

## Architectural Patterns

### Pattern 1: CSS-Only Responsive Visibility (No JS for Breakpoints)

**What:** Use Tailwind's `hidden` / `block` / `flex` utilities with `sm:` / `md:` prefixes to show/hide entire navigation components. No JavaScript `useWindowSize` hook, no resize listeners.

**When to use:** Switching between structurally different layouts (top nav vs bottom tab bar). The DOM contains both; CSS controls which is visible.

**Trade-offs:** Both components render on every device. This is acceptable — they are small. The benefit is zero layout shift or flash of wrong navigation on load.

**Example (in Layout.tsx):**
```tsx
{/* Desktop navigation — hidden on mobile */}
<nav className="hidden md:flex bg-gray-900 text-white ...">
  {/* existing NavLinks */}
</nav>

{/* Mobile bottom tab bar — hidden on desktop */}
<BottomTabBar className="flex md:hidden fixed bottom-0 left-0 right-0 z-40" />
```

### Pattern 2: Bottom Sheet Primitive

**What:** A generic `Sheet` component with a backdrop overlay and a slide-up panel. Used for: the "More" overflow menu, mobile filter panel on Transactions, mobile RuleForm, and replacing fixed-position center modals on small screens.

**When to use:** Any interaction that would be a modal on desktop becomes a bottom sheet on mobile. Center modals with `fixed inset-0 flex items-center justify-center` are fine on desktop but cramped on phones.

**Trade-offs:** One extra component to build and test. Payoff is consistent mobile UX across all overlay interactions.

**Example (Sheet.tsx):**
```tsx
export function Sheet({ open, onClose, children }: SheetProps) {
  return open ? (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  ) : null;
}
```

### Pattern 3: Conditional Layout with Tailwind Responsive Prefixes

**What:** A single component renders both desktop and mobile markup, using responsive prefixes to switch between them. No separate mobile component files.

**When to use:** TransactionCard and table rows — both represent the same data, just laid out differently. Keeps data logic (filtering, sorting, mutation) in one place.

**Trade-offs:** More conditional classes in JSX. Acceptable complexity for 9 pages. Alternative (separate MobileTransactionList / DesktopTable components) adds indirection without much benefit at this scale.

**Example (TransactionsPage — conceptual):**
```tsx
{/* Table: visible on md and up */}
<div className="hidden md:block overflow-x-auto">
  <table>...</table>
</div>

{/* Card list: visible below md */}
<div className="md:hidden space-y-2">
  {filtered.map(txn => <TransactionCard key={txn.id} txn={txn} ... />)}
</div>
```

### Pattern 4: Mobile-First Tap Targets (44px minimum)

**What:** All interactive elements get `min-h-[44px] min-w-[44px]` or equivalent padding so they meet Apple's HIG touch target guidelines. Applied via Tailwind utilities, not a wrapper component.

**When to use:** Every `<button>`, `<a>`, `<select>`, and clickable `<div>` that appears on mobile. Especially: NavLink items, AllocationCell click target, category picker rows, split/edit/delete action buttons.

**Trade-offs:** Slightly more padding on desktop — acceptable since these are functional UI elements, not decorative.

### Pattern 5: Scroll Lock for Overlays

**What:** When a Sheet or modal opens, prevent body scroll via `document.body.style.overflow = 'hidden'`. Restore on close. Important on iOS Safari where momentum scroll bleeds through overlays.

**When to use:** Any `position: fixed` overlay (Sheet, modals). Implemented inside the Sheet primitive so all Sheet consumers get it automatically.

**Example (in Sheet.tsx useEffect):**
```tsx
useEffect(() => {
  if (open) {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }
}, [open]);
```

---

## Data Flow

### Responsive State Flow

No new global state is needed. Responsive behavior is handled entirely by CSS breakpoints. The one exception: sheet open/close state lives as local `useState` in the component that triggers it.

```
User taps "More" tab (mobile)
  → MoreSheet open state: false → true (local useState in Layout)
  → Sheet renders with backdrop + overflow page links
  → User taps a link → navigate → Sheet closes (onClose)
```

```
User taps filter icon (mobile, TransactionsPage)
  → filterSheetOpen: false → true (local useState in TransactionsPage)
  → Sheet renders with existing filter inputs
  → User applies filters → Sheet closes
  → filtered list re-renders via existing useMemo (no changes needed)
```

### ChatPage Height Fix

ChatPage uses `h-[calc(100vh-56px)]` to subtract the top nav height (56px). On mobile, with a fixed bottom tab bar (~56px), this must become:

```
Desktop: h-[calc(100vh-56px)]          (subtract top nav only)
Mobile:  h-[calc(100vh-56px-56px)]     (subtract top nav + bottom tab bar)
```

In Tailwind v4 with responsive classes:
```tsx
<div className="h-[calc(100vh-56px)] md:h-[calc(100vh-56px)]">
```

The mobile variant needs `pb-14` on the outer container OR use CSS env variables for safe area insets on iPhone with home indicator. The cleanest approach: add `pb-14` (56px bottom padding = tab bar height) to Layout's `<main>` only when below `md:` breakpoint, then let ChatPage use `h-full` within that space.

### Budget Page Mobile Data Flow

BudgetPage's existing data model is unchanged. The `BudgetGroup` component renders a `grid-cols-5` table row on desktop. On mobile, `BudgetCategoryCard` renders the same `CategorySummary` data as a stacked card with a progress bar. The `AllocationCell` inline-edit interaction is preserved — on mobile it triggers a number input that opens the native keyboard.

```
BudgetPage
  → useQuery(budget.summary) → data.categories → groupCategories()
  → Desktop: BudgetGroup (grid-cols-5)
  → Mobile: stacked cards via BudgetCategoryCard
    → progress bar: (spent / allocated) * 100%
    → inline AllocationCell (unchanged behavior, bigger tap target)
```

---

## Scaling Considerations

This is a single-user personal app. Mobile responsiveness has no scaling implications — all logic stays client-side, server is unchanged.

| Concern | Approach |
|---------|----------|
| CSS bundle size | Tailwind v4 purges unused utilities — no concern |
| JS bundle size | No new dependencies needed (Sheet is ~20 lines) |
| Render performance | Card list renders all filtered transactions — same as table, no virtualization needed for personal finance data volumes |

---

## Anti-Patterns

### Anti-Pattern 1: Using a JS Breakpoint Hook for Nav Switching

**What people do:** `const isMobile = useWindowSize().width < 768` to conditionally render BottomTabBar.

**Why it's wrong:** Causes layout shift on initial render (server/hydration mismatch or flash of wrong nav). Adds a resize listener. Unnecessary complexity.

**Do this instead:** CSS-only with `hidden md:flex` / `flex md:hidden`. Both components are in the DOM; only one is visible. Zero JS overhead.

### Anti-Pattern 2: Creating Separate Mobile Page Files

**What people do:** `TransactionsMobilePage.tsx` alongside `TransactionsPage.tsx`.

**Why it's wrong:** Duplicates data-fetching logic, TanStack Query subscriptions, mutation handlers. Two files to keep in sync whenever server types change.

**Do this instead:** One page file with responsive layout — hidden/visible table vs card list via Tailwind classes. Extract only the pure presentation into `TransactionCard` / `BudgetCategoryCard` components.

### Anti-Pattern 3: Fixed Pixel Heights That Ignore Tab Bar

**What people do:** Leave `h-[calc(100vh-56px)]` on ChatPage unchanged.

**Why it's wrong:** On mobile, the fixed bottom tab bar (56px) sits above the bottom of the viewport. The chat input bar ends up behind the tab bar, inaccessible.

**Do this instead:** Layout's `<main>` adds `pb-14 md:pb-0` (padding-bottom matches tab bar height on mobile, none on desktop). ChatPage uses `h-full` instead of an explicit viewport calculation, inheriting the correct space from Layout.

### Anti-Pattern 4: `overflow-x-auto` Tables on Mobile Without an Alternative

**What people do:** Wrap `<table>` in `overflow-x-auto` and call it "responsive."

**Why it's wrong:** On a 375px iPhone, a 5-column transaction table with `overflow-x-auto` requires horizontal scrolling that feels broken and hides data. The category picker dropdown in the last column is especially difficult to use.

**Do this instead:** Render a card list on mobile. The table remains for desktop (where it works well). `TransactionCard` shows date, payee, amount, and category in a tappable card format. This is what the milestone specifically calls for.

### Anti-Pattern 5: Tailwind v4 Custom Config for One-Off Values

**What people do:** Add `theme.extend` with custom spacing for tab bar height in a config file.

**Why it's wrong:** Tailwind v4 uses `@import "tailwindcss"` with no config file. Adding a `tailwind.config.js` just for one value is overkill.

**Do this instead:** Use arbitrary values inline (`h-[56px]`, `pb-14`) for the tab bar height. If the value is used in 3+ places, define a CSS custom property in `app.css` via Tailwind v4's `@theme` directive:
```css
@import "tailwindcss";
@theme {
  --tab-bar-height: 56px;
}
```
Then use `h-[var(--tab-bar-height)]` in components.

---

## Integration Points

### Layout.tsx — Primary Integration Surface

Layout.tsx is the single file that ties navigation to all pages. Every mobile navigation change goes through here. The current structure:

```
<div className="min-h-screen bg-gray-50">
  <nav>  ← becomes desktop-only (hidden md:flex)
    <div className="mx-auto max-w-6xl ...">
      [9 NavLinks] + SyncStatus + SyncButton
    </div>
  </nav>
  <main className="mx-auto max-w-6xl px-4 py-6">
    <Outlet />    ← all pages render here
  </main>
</div>
```

After modification:
```
<div className="min-h-screen bg-gray-50">
  <nav className="hidden md:flex ...">   ← desktop only
    [unchanged NavLinks] + SyncStatus + SyncButton
  </nav>
  <main className="mx-auto max-w-6xl px-4 py-6 pb-14 md:pb-6">
    <Outlet />
  </main>
  <BottomTabBar className="flex md:hidden fixed bottom-0 ..." />
</div>
```

### Bottom Tab Bar — 5 Primary + More

The 9 pages map to tabs as:

| Tab | Page | Icon suggestion |
|-----|------|-----------------|
| Dashboard | `/` | Home |
| Transactions | `/transactions` | List |
| Budget | `/budget` | Chart bar |
| Accounts | `/accounts` | Credit card |
| More | (sheet) | Ellipsis |

"More" sheet contains: Categories, Rules, Transfers, Reports, Chat.

Tab selection state: use React Router's `useLocation` to derive active tab — same approach as existing NavLink `isActive` prop. No new state needed.

### SyncButton / SyncStatus on Mobile

Currently in the desktop top nav. On mobile (with no top nav visible), these need a home. Options:
1. Include SyncButton in the "More" sheet footer
2. Add a small sync indicator in the page header of DashboardPage
3. Keep them only on desktop nav (sync runs automatically; manual sync is rarely needed)

Recommended: Option 3 for simplicity. The sync indicator in the Dashboard card already shows last sync time. If needed later, the "More" sheet can include a sync button.

### ChatPage Height Calculation

Current: `<div className="h-[calc(100vh-56px)] -mx-4 -mt-6 flex flex-col">`

The `56px` is the desktop nav height. On mobile, the bottom tab bar is also `~56px`. The fix is to move height management to Layout so ChatPage doesn't need to know about navigation geometry.

After fix: ChatPage uses `h-full -mx-4 -mt-6 flex flex-col`, and Layout's `<main>` provides the correct height context via `min-h-[calc(100vh-56px)] md:min-h-[calc(100vh-56px)]` with `pb-14 md:pb-0`.

### Existing Modals — Sheet Conversion

Three existing modals use `fixed inset-0 ... flex items-center justify-center`:

| Modal | Current | Mobile treatment |
|-------|---------|-----------------|
| `SplitModal` | `max-w-lg mx-4` centered | Convert to Sheet on mobile: `items-end sm:items-center` |
| `ManualLinkModal` | `max-w-4xl` centered | Convert to full-screen sheet on mobile (the 2-col layout stacks) |
| `ManualTransactionForm` | Inline expanded form | Keep inline on desktop, render as Sheet on mobile |

Conversion pattern using Tailwind v4:
```tsx
{/* Before: always centered */}
<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
  <div className="bg-white rounded-lg w-full max-w-lg mx-4 p-6">

{/* After: bottom sheet on mobile, centered on sm+ */}
<div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
  <div className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-lg p-6">
```

This approach requires no new `Sheet` component for these modals — just changing the flex alignment and border radius. The generic `Sheet` is only needed for BottomTabBar's "More" sheet and the Transactions filter panel.

---

## Build Order (Considering Dependencies)

Dependencies flow from primitives to consumers. Build in this order to avoid implementing pages before the primitives they depend on:

```
Phase 1 — Foundation (no dependencies on app code)
  1. Sheet.tsx — generic bottom sheet primitive
  2. BottomTabBar.tsx — uses Sheet for MoreSheet trigger
  3. Modify Layout.tsx — add BottomTabBar, adjust main padding

Phase 2 — High-Value Pages (most-used on mobile)
  4. TransactionCard.tsx — new presentation component
  5. Modify TransactionsPage.tsx — card list + filter sheet
  6. Modify BudgetPage.tsx + BudgetCategoryCard.tsx — stacked cards

Phase 3 — Modal Conversions (parallel, no dependencies between them)
  7. Modify SplitModal.tsx — bottom sheet on mobile
  8. Modify ManualLinkModal.tsx — stacked + full-screen on mobile
  9. Modify ManualTransactionForm.tsx — sheet trigger on mobile

Phase 4 — Remaining Pages (smaller changes)
  10. Modify ChatPage.tsx — height fix for tab bar
  11. Modify RulesPage.tsx — card list + RuleForm as sheet
  12. DashboardPage.tsx — spacing/tap targets (minor)
  13. AccountsPage.tsx — tap target padding (minor)
  14. ReportsPage.tsx — stack date controls on mobile (minor)
  15. TransfersPage.tsx — stack pair layout on mobile (minor)
  16. CategoriesPage.tsx — drag handle tap targets (minor)
```

Phase 1 is the dependency anchor. All navigation and overlay behavior depends on Sheet and Layout changes. Phases 2-4 are otherwise independent and can be sequenced by priority.

---

## Sources

- Direct codebase inspection: all component files read and analyzed (HIGH confidence)
- Tailwind v4 documentation: `@import "tailwindcss"`, `@theme` directive, arbitrary values (HIGH confidence)
- Apple Human Interface Guidelines: 44×44pt minimum tap target (HIGH confidence)
- Project milestone definition (PROJECT.md): target features and page list confirmed

---

*Architecture research for: v2.2 Mobile-Friendly UI — React + Tailwind v4 responsive navigation and layouts*
*Researched: 2026-03-23*
