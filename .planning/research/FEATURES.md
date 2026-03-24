# Feature Research

**Domain:** Mobile-friendly UI for personal budgeting web app (375-430px iPhone)
**Researched:** 2026-03-23
**Confidence:** HIGH

## Context

This is a subsequent milestone on an existing app (Minerva Money v2.1). The desktop
UI is complete across 9 pages: Dashboard, Accounts, Transactions, Budget, Categories,
Rules, Transfers, Reports, Chat. The task is targeted mobile breakpoint overrides —
not a rewrite. Every feature below must work against the **existing tRPC API and
React component tree**; new components supplement existing pages rather than replace them.

Key existing constraints that shape mobile design:
- Layout.tsx: horizontal desktop navbar with 9 links; needs replacement with bottom tab bar on mobile
- TransactionsPage: full `<table>` layout — unreadable below 600px
- BudgetPage: `grid-cols-5` row layout — collapses illegibly on small screens
- CategoriesPage: drag-and-drop reorder via `@dnd-kit` — touch drag is already handled by dnd-kit's PointerSensor
- ChatPage: full-height flex column with input bar — near-ideal for mobile with minor adjustments
- ReportsPage: Recharts with fixed heights (300-350px) — ResponsiveContainer already handles width

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that make a mobile web app feel usable. Missing any of these makes the app
feel broken or frustrating on iPhone.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bottom tab bar navigation | Mobile apps universally use bottom nav; top nav is thumb-hostile on iPhone | MEDIUM | Replace horizontal desktop navbar with fixed bottom bar on mobile (`sm:hidden` + `hidden sm:flex` split). 5 primary tabs + "More" sheet for overflow routes. Tabs: Dashboard, Transactions, Budget, Chat + More |
| 44px minimum tap targets | Apple HIG requirement; smaller targets cause frequent mis-taps | LOW | Apply `min-h-[44px] min-w-[44px]` to all interactive elements on mobile. Existing buttons use `py-1`/`py-1.5` — need padding bumps at mobile breakpoints |
| Transaction card layout (not table) | Tables require horizontal scroll below ~600px; unacceptable on 375px | MEDIUM | Replace `<table>` with stacked card list on mobile. Each card: payee + amount on top row, account + date + category on second row. Same data, different DOM structure behind a breakpoint switch |
| Full-screen modals / bottom sheets | Desktop modals centered at 50% feel wrong on iPhone; full-screen sheets feel native | MEDIUM | SplitModal, ManualTransactionForm, RuleForm, ManualLinkModal — add `sm:max-w-lg` to keep desktop behavior, use `fixed inset-0` on mobile |
| Touch-friendly filter controls | Date pickers, dropdowns, and number inputs are fine on mobile — but filter bar wraps badly at 375px | LOW | Collapse filter controls behind a toggle button on mobile. Show active filter count as a badge on the toggle |
| Budget category progress bars | Numbers in a 5-column grid are unreadable on mobile | MEDIUM | Replace `grid-cols-5` with stacked cards: category name + progress bar (spent/allocated) + available amount. Inline tap-to-edit for allocation amount |
| Readable Recharts charts | Charts at full desktop width scroll or overflow on 375px | LOW | ResponsiveContainer already handles width. Reduce `outerRadius` on PieChart for mobile. Simplify XAxis tick density. No code change needed for LineChart/BarChart |
| Sticky/fixed input bar (Chat) | Chat input must stay above keyboard when soft keyboard opens on iOS | LOW | ChatPage already uses `border-t bg-white` fixed bar. Needs `pb-safe` (safe area inset) for iPhone notch/home bar area |
| Viewport meta tag | Without proper viewport tag, browser renders at desktop width | LOW | Check `packages/client/index.html` for `<meta name="viewport" content="width=device-width, initial-scale=1.0">` — likely already present from Vite scaffold |
| No horizontal scroll on main content | Content wider than viewport breaks layout on iOS Safari | LOW | Remove `max-w-6xl` constraint from main area on mobile (or make it `100%`). Ensure `overflow-x-hidden` on body |

### Differentiators (Competitive Advantage)

Features that make this specific budgeting app shine on mobile. Aligned with core
value: "see where every dollar goes."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "More" overflow bottom sheet | Keeps tab bar clean (5 items) while all 9 routes remain accessible | LOW | A slide-up sheet listing Accounts, Categories, Rules, Transfers, Reports with tap-to-navigate. State-driven, no routing needed for the sheet itself |
| Inline category picker on transaction card | Tap a card to open category selector without navigating away | LOW | CategoryPicker is already a reusable component. Mobile transaction card can show a tap-to-categorize area inline, same as desktop table cell |
| Budget progress bar with color coding | Visual feedback on envelope spending is the core value on mobile | LOW | Green = under budget, red = over budget. Progress bar is 100% CSS. Leverages existing `availableColor()` logic in BudgetPage |
| Swipe-to-reveal action on transaction cards | Swipe left to expose "Split" or "Categorize" action | HIGH | High implementation effort. dnd-kit does not have native swipe-to-reveal. Would require a custom touch event handler. NOT recommended for v1 — use tap-to-expand instead |
| Safe area insets (iPhone notch + home bar) | Without `env(safe-area-inset-*)`, content hides behind hardware chrome | LOW | Add `pb-[env(safe-area-inset-bottom)]` to bottom tab bar. Add `viewport-fit=cover` to meta tag. Pure CSS, no JS |
| Sync status in bottom tab bar | Show a subtle dot/badge on the tab bar when sync is running or failed | LOW | SyncStatus component already exists in the navbar. Reuse it as a small badge on the Dashboard tab icon |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Swipe navigation between pages | Feels native; iOS apps use it | Requires gesture disambiguation with page scroll. Easy to accidentally trigger. Complex state coordination with React Router. Significant implementation effort for low gain | Bottom tab bar navigation is sufficient and universally understood |
| Pull-to-refresh | Mobile convention for data refresh | iOS Safari has its own pull-to-refresh that conflicts; requires `overscroll-behavior: none` and custom detection. Fragile on web | Manual "Sync Now" button in the "More" sheet or on Dashboard is cleaner |
| Pinch-to-zoom on charts | Charts are small on mobile | Recharts does not support it out of the box. Implementing zooming in Recharts requires significant additional library or custom code | Scrollable chart area + date range selector is sufficient |
| Convert to PWA (installable) | "Add to Home Screen" + offline support | Service worker caching with live financial data is complex and error-prone. Stale cache can show wrong balances. No offline capability is possible anyway (server is on LAN) | Responsive web app accessed via Safari bookmark is sufficient for single-user home use |
| Drag-to-reorder on mobile (Categories) | dnd-kit PointerSensor works on touch | PointerSensor with `activationConstraint: { distance: 5 }` is already configured and handles touch. The real problem is tiny drag handles (⠿ glyph) — tap target is too small | Increase drag handle tap target to 44px on mobile. No library changes needed |
| Bottom sheet with snap points (fancy) | Native iOS bottom sheet feel | Significantly more complex than a simple modal. Requires touch velocity tracking, snap point math, animation. No existing library in the stack handles this | Simple slide-up fixed panel with overlay dismiss is sufficient |
| Infinite scroll on transactions | Mobile convention for long lists | Adds complexity to filtering + sort state. Current list is bounded (90-day sync window, ~hundreds of transactions). Not needed at this scale | Current render-all approach is fine. Virtualization only needed above ~1000 visible rows |

---

## Feature Dependencies

```
Bottom tab bar navigation
    replaces-on-mobile --> Layout.tsx desktop navbar
    requires --> Mobile breakpoint detection (Tailwind sm: prefix)
    contains --> "More" overflow sheet
        links-to --> Accounts, Categories, Rules, Transfers, Reports pages

Transaction card layout
    replaces-on-mobile --> <table> in TransactionsPage
    shares-data --> same tRPC query (transactions.list)
    contains --> CategoryPicker (already reusable)
    contains --> Split button (opens SplitModal)
    requires --> SplitModal as full-screen sheet on mobile

Budget mobile cards
    replaces-on-mobile --> grid-cols-5 BudgetGroup in BudgetPage
    shares-logic --> groupCategories(), availableColor() (already exported)
    contains --> AllocationCell (already exists, needs touch-friendly min-height)
    requires --> inline tap-to-edit (AllocationCell already handles this)

Full-screen sheets (mobile modals)
    applies-to --> SplitModal, ManualTransactionForm, RuleForm, ManualLinkModal, ManualLinkModal
    requires --> Tailwind breakpoint overrides on existing modal containers
    conflicts --> fixed positioning + iOS keyboard (needs testing)

Safe area insets
    required-by --> Bottom tab bar (home bar overlap)
    required-by --> Chat input bar (home bar overlap)
    requires --> viewport-fit=cover in index.html meta tag
```

### Dependency Notes

- **Tab bar requires safe area insets:** The bottom tab bar sits exactly where iPhone's home indicator lives. Without `pb-[env(safe-area-inset-bottom)]`, the home bar overlaps the last tab. This is a must-have pairing.
- **Transaction cards share the filter state:** The existing filter controls (search, date, category, amount) operate on the `filtered` array in TransactionsPage. Mobile cards consume the same filtered output — the filter logic does not change, only the render.
- **AllocationCell is already touch-compatible:** The click-to-edit pattern works on mobile (tap fires click). The input that appears is a standard `<input type="text">` which iOS keyboards handle. No changes to the component logic needed — only the wrapping card layout changes.
- **dnd-kit PointerSensor already handles touch:** CategoriesPage drag-to-reorder works on mobile without changes. The only mobile fix needed is enlarging the drag handle tap target from the current tiny glyph to a 44px area.
- **ChatPage is nearly mobile-ready:** The full-height flex column layout already works on mobile. The two fixes needed are safe area insets on the input bar and ensuring the example question buttons wrap cleanly at 375px.

---

## MVP Definition

### Launch With (v2.2 — this milestone)

- [ ] Bottom tab bar: 5 primary tabs (Dashboard, Transactions, Budget, Chat, More) — core navigation on mobile
- [ ] "More" bottom sheet: links to Accounts, Categories, Rules, Transfers, Reports + Sync button
- [ ] Transaction card layout: replace table with stacked cards on mobile, same filter/sort controls behind a collapsible toggle
- [ ] Budget mobile view: stacked category cards with progress bars replacing grid-cols-5
- [ ] Full-screen sheet behavior for modals on mobile: SplitModal, ManualTransactionForm
- [ ] 44px tap targets on all interactive elements (buttons, nav items, allocation cells)
- [ ] Safe area insets on bottom tab bar and Chat input bar
- [ ] Viewport meta tag confirmed present (`width=device-width, initial-scale=1.0, viewport-fit=cover`)
- [ ] Desktop layout fully preserved (all mobile changes behind `sm:` breakpoint)

### Add After Validation (v2.2+)

- [ ] Full-screen sheet for RuleForm and ManualLinkModal — lower frequency actions, can follow after core pages
- [ ] Filter controls collapse on mobile for Transactions and Reports — quality-of-life, not blocking
- [ ] Sync status badge on Dashboard tab icon — nice visual polish

### Future Consideration (v3+)

- [ ] PWA manifest / installable — requires service worker strategy compatible with live financial data; revisit if user wants home screen shortcut
- [ ] Swipe-to-reveal actions on transaction cards — high effort, low return vs tap-to-expand
- [ ] Virtualized transaction list — only needed if sync history grows beyond ~1000 visible rows

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Bottom tab bar navigation | HIGH | MEDIUM | P1 |
| Transaction card layout | HIGH | MEDIUM | P1 |
| Budget mobile card view | HIGH | MEDIUM | P1 |
| 44px tap targets | HIGH | LOW | P1 |
| Safe area insets | HIGH | LOW | P1 |
| Viewport meta tag (viewport-fit=cover) | HIGH | LOW | P1 |
| Full-screen sheets for modals | MEDIUM | MEDIUM | P1 |
| "More" overflow sheet | MEDIUM | LOW | P1 |
| Filter controls collapse toggle | MEDIUM | LOW | P2 |
| Sync badge on tab bar | LOW | LOW | P2 |
| Swipe-to-reveal on transaction cards | LOW | HIGH | P3 |
| PWA / installable | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

Reference: how Monarch Money, YNAB, and Copilot handle these problems on mobile.

| Feature | Monarch Money | YNAB | Our Approach |
|---------|--------------|------|--------------|
| Navigation | Bottom tab bar (5 tabs) | Bottom tab bar (4 tabs) | Bottom tab bar, 5 tabs + "More" sheet |
| Transaction list | Card list with payee/amount/category | Card list, swipe to categorize | Card list, tap to categorize inline |
| Budget view | Category rows with progress bars, grouped | Envelope cards with available amount | Stacked category cards with progress bar + available |
| Forms / modals | Full-screen sheets, bottom slide-up | Full-screen sheets | Full-screen on mobile, centered on desktop |
| Charts | Responsive, simplified on mobile, tap for detail | Limited charts, mostly numbers | Recharts ResponsiveContainer (already responsive) |
| Filter controls | Hidden behind a filter icon/button | Minimal filters | Collapsible filter bar on mobile |
| Chat / AI | Not applicable | Not applicable | Full-height layout already works |

**Key takeaway:** Both major competitors use bottom tab bar + card layouts — these are table stakes for mobile budgeting. Progress bars on budget categories are universal. Swipe actions (YNAB) are a differentiator but complex to implement correctly.

---

## Implementation Notes

### Tailwind Breakpoint Strategy

All mobile changes should use the `sm:` prefix (640px) to isolate mobile from desktop:
- Mobile-first: write mobile styles first, override at `sm:` for desktop
- Or: add mobile overrides using `max-sm:` (Tailwind v3.2+) to avoid rewriting desktop styles

Since the entire existing codebase is desktop-first, using `max-sm:` override classes is lower risk — it leaves all existing classes untouched and adds mobile-only overrides.

### Bottom Tab Bar Placement

The current Layout.tsx renders a `<nav>` at the top and `<main>` below it. Mobile layout requires:
1. `<main>` padding-bottom to clear the fixed bottom bar (e.g., `pb-16`)
2. Bottom tab bar as `fixed bottom-0 left-0 right-0 z-50` (above content, below modals)
3. Safe area inset padding on the bar itself

The desktop navbar stays untouched behind `hidden max-sm:hidden` / `sm:flex` classes.

### iOS Safari Quirks Relevant to This App

- **100vh problem:** `h-[calc(100vh-56px)]` in ChatPage may not account for iOS Safari's URL bar. Use `dvh` (dynamic viewport height) or `100svh` as a fallback. Both are well-supported in iOS 15.4+.
- **Input zoom:** iOS Safari auto-zooms inputs with `font-size < 16px`. Set `text-base` (16px) on all mobile form inputs to prevent this.
- **Safe area insets:** Only apply when `viewport-fit=cover` is set in the meta tag. Without it, `env(safe-area-inset-bottom)` evaluates to 0.
- **Scroll bounce:** `-webkit-overflow-scrolling: touch` is deprecated; the default is already momentum scrolling in modern iOS Safari.

### Existing Components Already Mobile-Friendly

These require no changes or only minor tweaks:
- **SyncButton** — single button, easily meets 44px
- **SyncStatus** — text only, no interaction
- **CategoryPicker** — uses `<select>` which iOS renders as a native picker
- **InlineConfirm** — popover on hover; on mobile, consider always-visible or tap-to-show
- **ChatPage messages** — bubble layout with `max-w-[80%]` works well on small screens
- **DashboardPage** — already uses `grid-cols-1 md:grid-cols-2`; mobile is already single column

---

## Sources

- Monarch Money mobile app (iOS) — navigation and transaction list patterns
- YNAB mobile app (iOS) — budget envelope cards and transaction categorization
- Apple Human Interface Guidelines — minimum tap target size (44pt), safe area insets, bottom tab bar patterns
- Tailwind CSS documentation — `max-sm:` modifier, safe area utilities
- MDN — `env(safe-area-inset-bottom)`, `viewport-fit=cover`, `dvh` unit
- Existing codebase: all files in `packages/client/src/` reviewed directly

---
*Feature research for: Mobile-friendly UI (Minerva Money v2.2)*
*Researched: 2026-03-23*
