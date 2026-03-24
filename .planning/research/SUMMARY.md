# Project Research Summary

**Project:** Minerva Money v2.2 Mobile-Friendly UI
**Domain:** Mobile-responsive web UI retrofit — React + Tailwind v4 on iPhone (375–430px)
**Researched:** 2026-03-23
**Confidence:** HIGH

## Executive Summary

Minerva Money v2.2 is a targeted mobile retrofit of an existing desktop-first React SPA. The app has 9 complete pages, all built with custom Tailwind components and no component library. The goal is to make every page fully functional on iPhone (375–430px) without introducing heavy new dependencies or rewriting existing components. Research confirms this is a well-understood domain with clear patterns: bottom tab navigation, card layouts for tabular data, safe area insets, and bottom sheets for modals are the established solutions used by Monarch Money, YNAB, and every major mobile budgeting app.

The recommended approach is CSS-first responsiveness using Tailwind v4's `max-md:` variant to add mobile overrides without touching existing desktop classes. Only two new runtime dependencies are needed: `vaul` for bottom sheets (drag-to-dismiss, iOS rubber-banding) and `lucide-react` for tab bar icons. All other mobile behavior — safe area insets, responsive breakpoints, 44px touch targets, scroll lock — is handled with utility classes and a few lines of CSS in `app.css`.

The primary risk is scope: this milestone spans 9 pages, multiple modals, and a complete navigation overhaul. The dependency chain is clear (Layout foundation must come before page conversions), and the most common pitfalls (content hidden behind the fixed tab bar, `100vh` iOS breaks, modal/keyboard interaction) are all preventable with known patterns. Testing on an actual iOS device or Xcode simulator with the software keyboard open is required for ChatPage and all form modals before shipping.

## Key Findings

### Recommended Stack

The core stack (React 19, React Router v7, Vite 6, Tailwind CSS v4, tRPC, TanStack Query, Recharts, better-sqlite3) is unchanged. v2.2 adds exactly two new client packages. See [STACK.md](./STACK.md) for full detail.

**Core technologies:**
- `vaul@^1.1.2`: Bottom sheet primitive — handles iOS rubber-banding, drag-to-dismiss, snap points. Explicitly supports React 19 in peerDependencies. Unstyled — integrates directly with existing Tailwind classes.
- `lucide-react@^0.577.0`: Tab bar icons — tree-shakeable SVG icons, zero runtime deps, idiomatic Tailwind pairing.
- CSS `env(safe-area-inset-*)` via `@layer utilities` in `app.css`: iPhone notch and home indicator clearance — two custom utilities, no plugin package needed. Requires `viewport-fit=cover` in `index.html`.

### Expected Features

See [FEATURES.md](./FEATURES.md) for full prioritization matrix and competitor analysis.

**Must have (table stakes — v2.2 launch):**
- Bottom tab bar (5 primary tabs: Dashboard, Transactions, Budget, Accounts, More) — mobile apps universally use bottom nav; top nav is thumb-hostile on iPhone
- Transaction card layout replacing the `<table>` — tables require horizontal scroll below 600px; unacceptable at 375px
- Budget mobile card view replacing `grid-cols-5` — numbers in 5-column grid are unreadable on small screens
- 44px minimum tap targets on all interactive elements — Apple HIG requirement; current `py-1` buttons are ~24px
- Safe area insets on bottom tab bar and Chat input bar — without these, content overlaps iPhone home indicator
- Viewport meta updated to `viewport-fit=cover` — required for `env(safe-area-inset-*)` to have effect
- Full-screen sheet behavior for SplitModal and ManualTransactionForm on mobile
- "More" overflow bottom sheet linking to: Categories, Rules, Transfers, Reports, Chat
- All desktop behavior preserved behind `md:` breakpoint — zero regression on desktop

**Should have (v2.2+):**
- Full-screen sheets for RuleForm and ManualLinkModal — lower-frequency actions, not blocking launch
- Filter controls collapse toggle on Transactions and Reports — quality-of-life improvement
- Sync status badge on Dashboard tab icon

**Defer (v3+):**
- PWA / installable — service worker caching is incompatible with live financial data on a LAN server
- Swipe-to-reveal on transaction cards — high effort, low return vs tap-to-expand
- Virtualized transaction list — only needed above ~1000 visible rows

### Architecture Approach

All mobile changes live in the client package. The server, tRPC API, and data layer are entirely unchanged. The architecture uses CSS-only responsive visibility (no JS breakpoint hooks) to avoid layout shift: both desktop nav and mobile tab bar render in the DOM, with CSS controlling which is visible. New components (`Sheet`, `BottomTabBar`, `TransactionCard`, `BudgetCategoryCard`) are presentation-only and consume existing tRPC data without adding new queries. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the component responsibility table and build order.

**Major components:**
1. `Layout.tsx` (modify) — add `BottomTabBar`, adjust `<main>` padding-bottom, convert `min-h-screen` to `min-h-dvh`
2. `BottomTabBar.tsx` (new) — 5 primary tabs + "More" trigger, active state via `useLocation`, 44px targets
3. `Sheet.tsx` (new) — ~20-line generic bottom sheet primitive: backdrop, slide-up panel, body scroll lock, close-on-navigate
4. `TransactionCard.tsx` (new) — mobile card for a single transaction; primary/secondary info hierarchy
5. `BudgetCategoryCard.tsx` (new) — stacked card with progress bar, available amount, and tap-to-edit allocation

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for all 10 pitfalls with warning signs and recovery strategies.

1. **Content hidden behind fixed tab bar** — Add `pb-20` (or `pb-safe`) to `Layout.tsx` `<main>` as the very first step, before converting any page. Use `dvh` not `vh` for the main content area so Safari's dynamic toolbar is accounted for.
2. **iOS `100vh` / `h-screen` viewport breaks** — Replace all `min-h-screen`, `h-screen`, and `100vh` with `min-h-dvh` / `h-dvh` in `Layout.tsx` and `ChatPage.tsx` before shipping. Test ChatPage specifically with iOS simulator keyboard open.
3. **Desktop navbar and bottom tab bar both visible on mobile** — Apply `max-md:hidden` to the entire top `<nav>` in the same commit that adds `BottomTabBar`. Do not patch nav links individually.
4. **Modals clipped or unusable with iOS keyboard open** — Convert modals to `fixed inset-x-0 bottom-0 max-h-[90svh] overflow-y-auto` bottom sheet pattern. Always add body scroll lock (`overflow-hidden` on `document.body`). Use `svh` not `vh` for max-height.
5. **"More" sheet stays open after navigation** — Use `useLocation()` in a `useEffect` to reset sheet state on every route change. Build this into the initial `Sheet` implementation, not as a later fix.

## Implications for Roadmap

Based on the dependency chain in ARCHITECTURE.md and pitfall prevention order from PITFALLS.md:

### Phase 1: Layout Foundation
**Rationale:** All subsequent page work depends on a correct navigation shell and safe viewport behavior. Fixing `dvh`, safe area insets, and tab bar padding here prevents regression across every page in later phases.
**Delivers:** Working bottom tab bar on mobile, desktop nav preserved, no content clipped, no iOS viewport breaks.
**Addresses:** Bottom tab bar, "More" sheet, safe area insets, viewport meta tag (`viewport-fit=cover`).
**Avoids:** Pitfall 1 (content behind tab bar), Pitfall 5 (iOS `vh` breaks), Pitfall 8 (More sheet close-on-navigate), Pitfall 9 (dual navbars).

### Phase 2: Transaction Card Layout
**Rationale:** Transactions is the most-used page. Converting the table to cards is the highest-value mobile change after navigation. The existing filter and sort logic is unchanged — only the render layer differs.
**Delivers:** Mobile card list for transactions; desktop table unchanged; filter controls accessible on mobile.
**Uses:** `max-md:hidden` / `md:hidden` pattern; `TransactionCard` component.
**Implements:** Pattern 3 from ARCHITECTURE.md — conditional layout with Tailwind responsive prefixes.
**Avoids:** Pitfall 3 (horizontal scroll trap from `overflow-x-auto`), Pitfall 2 (touch targets below 44px).

### Phase 3: Budget Mobile View
**Rationale:** Second highest-value page. The `grid-cols-5` row layout is completely unreadable on mobile without this phase.
**Delivers:** Stacked category cards with progress bars; inline allocation editing via bottom sheet on mobile; desktop grid unchanged.
**Uses:** `BudgetCategoryCard` component, existing `AllocationCell` logic, existing `groupCategories()` and `availableColor()` helpers.
**Avoids:** Pitfall 10 (budget inline table editing unusable on mobile — replaced with bottom sheet pattern).

### Phase 4: Modal / Sheet Conversions
**Rationale:** Modal usability on mobile depends on the `Sheet` primitive from Phase 1. Once Phase 1 is complete, individual modals can be converted in parallel; they are independent of each other.
**Delivers:** SplitModal, ManualTransactionForm, ManualLinkModal all usable on mobile with keyboard open.
**Uses:** `vaul` or the custom `Sheet` primitive; `svh` viewport units; body scroll lock pattern.
**Avoids:** Pitfall 4 (modals not full-screen or broken when iOS keyboard opens).

### Phase 5: Remaining Pages (Minor Fixes)
**Rationale:** ChatPage height fix, RulesPage card list, and minor touch target/spacing work on Accounts, Reports, Transfers, and Categories. These are lower-risk and lower-value individually and can be sequenced in any order.
**Delivers:** All 9 pages fully functional at 375px.
**Addresses:** ChatPage height fix for bottom tab bar, Recharts mobile props, drag handle tap targets, date control stacking on Reports.
**Avoids:** Pitfall 6 (Recharts unreadable at 375px — overlapping labels, tiny bars), Pitfall 5 (chat input hidden by keyboard).

### Phase Ordering Rationale

- Phase 1 is the dependency anchor: `Sheet.tsx` and `Layout.tsx` changes must exist before modals or the "More" sheet can be built on any page.
- Phases 2 and 3 are the highest user-value changes and should be verified on device before moving to modals — they surface any remaining padding or spacing issues in the Layout foundation.
- Phase 4 modals are independent of each other and can be done in any order once Phase 1 is complete.
- Phase 5 is low-risk cleanup that can be done in any order and shipped incrementally.

### Research Flags

Phases requiring care during implementation:
- **Phase 1 (ChatPage height):** `h-[calc(100vh-56px)]` in ChatPage must be converted to inherit height from Layout's padding context rather than an explicit viewport calculation. Requires testing with the iOS simulator keyboard open.
- **Phase 4 (modal + keyboard):** The iOS keyboard + `fixed` positioning interaction needs device testing. Simulator testing is acceptable but real device verification is recommended for SplitModal and ManualTransactionForm before the phase closes.
- **Phase 5 (Recharts):** Chart mobile props require a `useIsMobile()` hook reading `window.matchMedia` — the only JS breakpoint hook in the project. CSS-only approach is insufficient for passing conditional props to Recharts components.

Phases with standard, mechanical patterns:
- **Phase 2 (transaction cards):** Well-documented card layout pattern; existing filter logic and tRPC query are completely unchanged.
- **Phase 3 (budget cards):** `AllocationCell` and `groupCategories()` need no changes; only the wrapping layout differs.
- **Phase 1 (safe area insets):** Pure CSS — two utilities in `app.css` plus one meta tag attribute change.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct codebase inspection + official package docs; vaul React 19 peerDep confirmed in v1.1.1+ release notes |
| Features | HIGH | Pattern validated against Monarch Money and YNAB mobile apps; aligned with Apple HIG |
| Architecture | HIGH | All component files read and analyzed; component responsibilities confirmed against existing code |
| Pitfalls | HIGH | Each pitfall traced to a specific existing code pattern in the repo; iOS Safari behavior documented in official WebKit blog and MDN |

**Overall confidence:** HIGH

### Gaps to Address

- **iOS keyboard + modal interaction:** Behavior when the iOS keyboard opens inside a full-screen bottom sheet cannot be fully verified without running on device. Mark SplitModal and ManualTransactionForm for device testing before Phase 4 closes.
- **Recharts mobile tick density:** The exact `interval` and font-size values for readable mobile charts need tuning against real data. Research identifies the approach (`useIsMobile()` + conditional props); exact values require live testing at 375px.
- **Tab bar height constant:** 56px is assumed based on typical HIG bottom bar height. Actual rendered height may vary with content. Define as a CSS custom property (`--tab-bar-height`) in `app.css` via Tailwind v4's `@theme` directive during Phase 1 so it is a single-source change if adjustment is needed.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: all `packages/client/src/` files — component structure, Tailwind classes, existing modal patterns, ChatPage height calculation
- [vaul npm / GitHub](https://github.com/emilkowalski/vaul) — React 19 peerDep confirmed in v1.1.1+ release notes
- [Tailwind CSS v4 docs](https://tailwindcss.com/docs) — CSS-first config, `@layer utilities`, `max-md:` variants, `min-h-dvh`
- [Apple Human Interface Guidelines: Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — 44pt minimum tap targets, safe area insets, bottom tab bar patterns
- [WebKit blog: new viewport units (dvh/svh/lvh)](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) — iOS Safari toolbar behavior and correct viewport unit usage

### Secondary (MEDIUM confidence)
- Monarch Money and YNAB mobile app analysis — navigation patterns, card layouts, bottom sheet usage for forms
- [MDN: env(safe-area-inset-bottom)](https://developer.mozilla.org/en-US/docs/Web/CSS/env) — iOS notch and home indicator inset handling
- [React Router v7 useLocation](https://reactrouter.com/en/main/hooks/use-location) — close-on-navigate pattern for sheets and drawers
- [Recharts ResponsiveContainer docs](https://recharts.org/en-US/api/ResponsiveContainer) — confirms container-only responsiveness; chart content props must be set explicitly

### Tertiary (LOW confidence)
- Community post-mortems on React + Tailwind mobile retrofits — pitfall patterns around iOS Safari and fixed positioning; anecdotal but consistent across multiple sources

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
