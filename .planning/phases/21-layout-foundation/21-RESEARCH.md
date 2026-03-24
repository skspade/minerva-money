# Phase 21: Layout Foundation - Research

**Researched:** 2026-03-23
**Domain:** Mobile navigation shell — bottom tab bar, "More" bottom sheet, iOS viewport/safe-area fixes, Layout.tsx restructure, Tailwind v4 responsive utilities
**Confidence:** HIGH

---

## Summary

Phase 21 is the foundation for all v2.2 mobile work. It touches exactly one shared file (`Layout.tsx`) plus `index.html`, adds two new components (`BottomTabBar`, `MoreSheet`), and adds two CSS utilities to `app.css`. Every subsequent phase (22–25) depends on this foundation being correct.

The technical stack is already decided: Tailwind v4 CSS-first responsive classes (`max-md:` / `md:`) handle nav visibility without JavaScript; `lucide-react` provides tab bar icons; `vaul` handles the "More" bottom sheet with iOS drag-to-dismiss and scroll lock. The viewport meta tag needs `viewport-fit=cover` and `min-h-screen` must become `min-h-dvh`.

The highest-risk items are: (1) safe area inset padding stacking correctly when both the tab bar's own `pb-safe` and `<main>`'s bottom padding are applied; (2) the "More" sheet closing automatically on navigation via a `useLocation` effect; (3) touch targets meeting 44px on the tab bar items.

**Primary recommendation:** Restructure `Layout.tsx` first (viewport, `dvh`, main padding, nav visibility), then build `BottomTabBar` + `MoreSheet` as separate components, and treat `index.html` and `app.css` as surgical one-line changes.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | Bottom tab bar with 5 tabs (Dashboard, Transactions, Budget, Chat, More) visible on screens below 768px | CSS-only `md:hidden` on BottomTabBar; `hidden md:flex` on desktop nav. Architecture Pattern 1. |
| NAV-02 | Tapping "More" opens a bottom sheet listing Accounts, Categories, Rules, Transfers, Reports | `vaul` Drawer component as `MoreSheet`; triggered from BottomTabBar. Architecture Pattern 2. |
| NAV-03 | Desktop horizontal navbar hidden on mobile; bottom tab bar hidden on desktop | `hidden md:flex` on `<nav>` links; `flex md:hidden` on BottomTabBar. Architecture Pattern 1. |
| NAV-04 | Active tab is visually highlighted and updates on navigation | React Router `useLocation()` hook to derive active tab; compare pathname to tab routes. |
| NAV-05 | "More" sheet auto-closes when user navigates to a page | `useEffect` on `useLocation()` inside `MoreSheet` or parent; resets `open` state on route change. Pitfall 8. |
| LAYOUT-01 | Viewport meta tag includes `viewport-fit=cover` | One-line change to `index.html`. Required for `env(safe-area-inset-*)` to work. |
| LAYOUT-02 | Bottom tab bar respects `env(safe-area-inset-bottom)` | `pb-safe` custom utility in `app.css` via `@layer utilities`; applied to BottomTabBar. Stack research confirms no plugin needed. |
| LAYOUT-03 | Main content has bottom padding to clear the fixed tab bar on mobile | `pb-[calc(4rem+env(safe-area-inset-bottom,0px))]` on `<main>` at mobile breakpoint, or simpler `pb-20 md:pb-6` in Layout. |
| LAYOUT-04 | Layout uses `min-h-dvh` instead of `min-h-screen` | Replace `min-h-screen` in `Layout.tsx` root `<div>`. Tailwind v4 has `min-h-dvh` natively. Pitfall 5. |
| LAYOUT-05 | No horizontal scroll at 375px viewport width | Audit `<main>` and existing components for `min-w-*` or fixed widths that exceed 375px. The nav restructure is the primary fix. |
| TOUCH-01 | All interactive elements have minimum 44x44px tap targets on mobile | Tab bar items need `h-11 w-full flex flex-col items-center justify-center` (44px = `h-11`). Pitfall 2. |
</phase_requirements>

---

## Standard Stack

### Core (No New Installs Beyond What's Decided)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tailwindcss` | ^4.2.2 | Already installed. `md:hidden`, `max-md:hidden`, `min-h-dvh`, `pb-safe` (via `@layer utilities`) | CSS-first, zero runtime cost |
| `react-router` | ^7.13.1 | Already installed. `NavLink`, `useLocation` for active state and close-on-navigate | Already the app router |
| `lucide-react` | NEW: ^0.577.0 | Tab bar icons (Home, List, BarChart2, MessageSquare, MoreHorizontal) | Tree-shakeable, zero config with Tailwind v4 |
| `vaul` | NEW: ^1.1.2 | "More" bottom sheet with drag-to-dismiss and iOS scroll lock | React 19 compatible; unstyled — works with Tailwind v4 |

### CSS-Only Additions (in `app.css`)

| Utility | CSS | Purpose |
|---------|-----|---------|
| `.pb-safe` | `padding-bottom: env(safe-area-inset-bottom, 0px)` | iPhone home indicator clearance on tab bar |
| `.min-h-dvh` | Already in Tailwind v4 | iOS Safari dynamic viewport height |

### What's Already in Place (No Changes)

| Concern | Current State |
|---------|---------------|
| Tailwind responsive breakpoints | `md:` = 768px is the mobile/desktop split point. Existing desktop code uses `md:` prefix extensively — safe to add `max-md:` for mobile overrides. |
| Modal pattern | `fixed inset-0 bg-black/50 flex items-center justify-center z-50` — Phase 24 converts these; Phase 21 does NOT touch modals. |
| `<Outlet />` in `<main>` | Unchanged. All pages render through this. |

### Installation

```bash
npm install vaul lucide-react --workspace=packages/client
```

---

## Architecture Patterns

### Recommended File Changes

```
packages/client/
├── index.html                          MODIFY — add viewport-fit=cover
├── src/
│   ├── styles/
│   │   └── app.css                     MODIFY — add pb-safe @layer utility
│   └── components/
│       ├── Layout.tsx                  MODIFY — dvh, nav visibility, main padding, add BottomTabBar
│       ├── BottomTabBar.tsx            NEW — 5 tabs + More trigger
│       └── MoreSheet.tsx               NEW — vaul Drawer with secondary nav links
```

No other files change in Phase 21.

### Pattern 1: CSS-Only Nav Visibility

Both `<nav>` (desktop) and `<BottomTabBar>` (mobile) are always in the DOM. CSS controls visibility. No JavaScript breakpoint hooks.

```tsx
// Layout.tsx — after modification
<div className="min-h-dvh bg-gray-50">
  {/* Desktop nav — hidden on mobile */}
  <nav className="hidden md:block bg-gray-900 text-white">
    <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-8">
        <h1 className="text-lg font-bold">Minerva Money</h1>
        <div className="flex gap-4">
          {/* existing NavLinks — unchanged */}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SyncStatus />
        <SyncButton />
      </div>
    </div>
  </nav>

  {/* Main content — bottom padding clears tab bar on mobile */}
  <main className="mx-auto max-w-6xl px-4 py-6 pb-20 md:pb-6">
    <Outlet />
  </main>

  {/* Mobile bottom tab bar — hidden on desktop */}
  <BottomTabBar />
</div>
```

**Key change:** `min-h-screen` → `min-h-dvh`. `<nav>` gets `hidden md:block`. `<main>` gets `pb-20 md:pb-6` (or the `calc` variant with safe area). `<BottomTabBar>` is appended inside the root div.

### Pattern 2: Bottom Tab Bar Component

```tsx
// BottomTabBar.tsx
import { NavLink, useLocation } from 'react-router';
import { Home, List, BarChart2, MessageSquare, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import MoreSheet from './MoreSheet';

const PRIMARY_TABS = [
  { to: '/', end: true, icon: Home, label: 'Dashboard' },
  { to: '/transactions', icon: List, label: 'Transactions' },
  { to: '/budget', icon: BarChart2, label: 'Budget' },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
];

export default function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 md:hidden bg-white border-t border-gray-200 pb-safe z-40">
        <div className="flex">
          {PRIMARY_TABS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center min-h-[44px] py-2 text-xs gap-1
                 ${isActive ? 'text-blue-600' : 'text-gray-500'}`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center min-h-[44px] py-2 text-xs gap-1 text-gray-500"
            aria-label="More navigation options"
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
```

### Pattern 3: "More" Sheet with Auto-Close on Navigate

```tsx
// MoreSheet.tsx
import { Drawer } from 'vaul';
import { NavLink, useLocation } from 'react-router';
import { useEffect } from 'react';
import { CreditCard, Tag, Sliders, ArrowLeftRight, BarChart } from 'lucide-react';

const MORE_LINKS = [
  { to: '/accounts', icon: CreditCard, label: 'Accounts' },
  { to: '/categories', icon: Tag, label: 'Categories' },
  { to: '/rules', icon: Sliders, label: 'Rules' },
  { to: '/transfers', icon: ArrowLeftRight, label: 'Transfers' },
  { to: '/reports', icon: BarChart, label: 'Reports' },
];

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function MoreSheet({ open, onClose }: MoreSheetProps) {
  const location = useLocation();

  // Close sheet whenever route changes (NAV-05)
  useEffect(() => {
    onClose();
  }, [location.pathname]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl pb-safe">
          <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-4" />
          <nav className="px-4 pb-6 space-y-1">
            {MORE_LINKS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className="flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-gray-700 hover:bg-gray-100"
              >
                <Icon size={20} />
                <span className="text-base font-medium">{label}</span>
              </NavLink>
            ))}
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

**Why `vaul` Drawer vs custom Sheet:** vaul handles iOS rubber-banding animation, drag handle gesture, body scroll lock, and backdrop interaction correctly out of the box. The "More" sheet is the only sheet needed in Phase 21. Phases 22–24 may add more, but this is the first.

### Pattern 4: Safe Area Inset Utility

```css
/* packages/client/src/styles/app.css */
@import "tailwindcss";

@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
```

Then in `BottomTabBar.tsx` the nav element uses `pb-safe` as a class. On non-notched devices (desktop, older iPhones) `env(safe-area-inset-bottom, 0px)` resolves to `0px` — no change.

### Pattern 5: Viewport Meta Tag Update

```html
<!-- packages/client/index.html — current -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- After — add viewport-fit=cover (LAYOUT-01) -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

Note: `initial-scale=1.0` → `initial-scale=1` (equivalent; drop the `.0`). This is required for `env(safe-area-inset-*)` to have any effect on iPhone.

### Pattern 6: Main Content Bottom Padding

The `<main>` in `Layout.tsx` needs padding on mobile that accounts for both the tab bar height (~56px ≈ `h-14`) and the safe area inset:

```tsx
// Simple approach (preferred for Phase 21):
<main className="mx-auto max-w-6xl px-4 py-6 pb-20 md:pb-6">

// Or with safe area awareness (for iPhone):
<main className="mx-auto max-w-6xl px-4 py-6 md:pb-6"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
```

The inline style is only needed if testing reveals the `pb-20` (80px) is insufficient on newer iPhones. `pb-20` (80px) = 56px tab bar + 24px buffer is usually sufficient even on iPhone 14 Pro (home indicator ~34px). Use `pb-24` (96px) if iPhones with large safe areas show content clipped.

**Recommendation:** Start with `pb-20 md:pb-6`. Add the `calc()` variant only if needed.

### Anti-Patterns to Avoid

- **Using `useWindowSize` or `useMediaQuery` for nav switching:** Causes flash of wrong nav on load. CSS-only `hidden md:flex` / `flex md:hidden` is correct.
- **Adding `hidden md:flex` to just the nav links `<div>` without hiding the full `<nav>`:** Leaves a dark bar on mobile with only the app title — visually broken. The full `<nav>` must get `hidden md:block`.
- **Omitting `pb-safe` on the tab bar:** On iPhone X and later, the tab bar will be obscured by the home indicator.
- **Forgetting the close-on-navigate effect in `MoreSheet`:** Sheet stays open when the user taps a link — the most common "More" sheet bug.
- **Using `100vh` / `min-h-screen` on the root div:** Safari's toolbar behavior makes this unreliable. `min-h-dvh` is the correct replacement.
- **Giving the "More" sheet a lower `z-index` than the tab bar:** Sheet appears behind the tab bar. Tab bar = `z-40`, sheet backdrop = `z-50`, sheet content = `z-50`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bottom sheet with drag-to-dismiss | Custom CSS + touch event handlers | `vaul` | iOS rubber-banding, proper scroll lock, backdrop interaction, React 19 compat — all handled by vaul. Correct implementation from scratch is 300+ lines. |
| Body scroll lock when sheet opens | Manual `document.body.style.overflow` management | `vaul` | vaul handles this internally. Hand-rolling misses iOS Safari's `-webkit-overflow-scrolling: touch` edge cases. |
| Tab bar icons | Inline SVGs or emoji | `lucide-react` | Consistent stroke widths, accessible `aria-label`, tree-shakeable, named exports work directly with TypeScript. |

**Key insight:** The `vaul` library exists precisely for this "simple-looking but iOS-tricky" bottom sheet problem. The MoreSheet is the only component in Phase 21 where a library is preferred over a hand-rolled solution. Everything else (tab bar, viewport fixes, CSS utilities) is pure Tailwind + standard HTML.

---

## Common Pitfalls

### Pitfall 1: Content Hidden Behind Tab Bar (CRITICAL)
**What goes wrong:** Fixed `bottom-0` tab bar obscures the bottom of page content on short-content pages (Accounts, Settings-type pages). Developers test on Dashboard (long content) and miss the issue.
**Why it happens:** `position: fixed` removes elements from document flow. The bottom of `<main>` renders behind the tab bar with no natural clearance.
**How to avoid:** Add `pb-20 md:pb-6` to `<main>` in `Layout.tsx` as the first step, before the tab bar is functional. Test by loading the Accounts page at 375px and scrolling to the very bottom.
**Warning signs:** Submit buttons clipped, last list item not reachable.

### Pitfall 2: Both Navbars Visible Simultaneously
**What goes wrong:** `hidden md:flex` is applied to the nav links `<div>` but the `<nav>` element itself remains — a 48px dark bar with only the Minerva Money title appears above the page content on mobile.
**Why it happens:** The `<nav>` has multiple independent children: `<h1>`, nav links `<div>`, and sync controls `<div>`. Hiding the links wrapper leaves the bar visible.
**How to avoid:** Apply `hidden md:block` to the entire `<nav>` element (or restructure it to show a minimal mobile header). The app title is not needed on mobile — the bottom tab bar is self-identifying navigation.
**Warning signs:** Dark bar visible at top of screen on 375px while bottom tab bar also appears.

### Pitfall 3: More Sheet Stays Open After Navigation
**What goes wrong:** User taps "Reports" in the More sheet. Navigation to `/reports` occurs but the More sheet stays open, overlaying the Reports page.
**Why it happens:** React state (`moreOpen: true`) is not reset by React Router navigation.
**How to avoid:** `useEffect(() => { onClose(); }, [location.pathname])` inside `MoreSheet`. This is the single most important behavioral requirement for NAV-05.
**Warning signs:** Tapping a More sheet link navigates but sheet is still visible on the destination page.

### Pitfall 4: iOS Safari `100vh` / `min-h-screen` Layout Break
**What goes wrong:** Root `<div className="min-h-screen">` uses `100vh`. On iOS Safari, `100vh` includes the browser chrome but the page layout bleeds under the toolbar. When the user scrolls and Safari hides its toolbar, `100vh` suddenly becomes too small and content jumps.
**Why it happens:** `100vh` = layout viewport height on iOS, which does not change when the toolbar hides/shows. `dvh` = dynamic viewport height, which updates correctly.
**How to avoid:** Replace `min-h-screen` with `min-h-dvh`. Tailwind v4 supports `min-h-dvh` natively with no custom CSS needed.
**Warning signs:** Page content jumping when scrolling triggers Safari toolbar hide/show.

### Pitfall 5: Tab Bar Items Below 44px (TOUCH-01)
**What goes wrong:** Tab bar items render at approximately 32px tall (icon + label with tight padding). Tapping the correct tab item requires precision; adjacent tabs are hit instead.
**Why it happens:** Default `py-2` + 20px icon + 12px text = ~44px theoretically, but if line-height or gap is wrong the actual tap area is smaller. Without an explicit `min-h-[44px]` guard, pixel rounding can clip the height.
**How to avoid:** Set `min-h-[44px]` explicitly on each tab item (the NavLink and the More button). Use `flex-1` on the tab container so the full available width is the tap zone.
**Warning signs:** Computed height in DevTools is 40px or 36px rather than 44px+.

### Pitfall 6: `vaul` z-index Stacking with Tab Bar
**What goes wrong:** vaul's `Drawer.Overlay` and `Drawer.Content` use default z-index values that may be lower than the tab bar's `z-40`, causing the More sheet to render behind the tab bar.
**Why it happens:** vaul does not set z-index by default (it inherits or uses the stacking context). The tab bar at `z-40` can be above an unstyled vaul drawer.
**How to avoid:** Set `z-50` on both `Drawer.Overlay` and `Drawer.Content` via className. The tab bar uses `z-40`, the sheet backdrop uses `z-50`, the sheet content uses `z-50`. This ensures the sheet appears on top.
**Warning signs:** More sheet renders but the tab bar is visible on top of the sheet.

### Pitfall 7: `max-md:` vs `md:` Cascade Order Confusion
**What goes wrong:** Combining `md:hidden` (show on desktop, hide on mobile) with `max-md:flex` (flex on mobile) can produce unexpected results if the developer doesn't understand Tailwind v4's cascade layer order.
**Why it happens:** The existing codebase uses desktop-first classes. Adding mobile-first `max-md:` modifiers can interact in non-obvious ways. The key: in Tailwind v4, both `md:` and `max-md:` utilities are generated correctly in `@layer utilities` — they do not conflict if you use one or the other per property, not both.
**How to avoid:** For nav visibility: use `hidden md:block` (one property, mobile hides, desktop shows) — don't add `max-md:block` alongside. For tab bar: use `fixed bottom-0 inset-x-0 md:hidden` — the `md:hidden` overrides at desktop width. Verify at 767px (just under breakpoint) and 768px (just at breakpoint) in DevTools.
**Warning signs:** Component visible on both mobile and desktop, or on neither.

---

## Code Examples

### Complete `app.css` After Phase 21

```css
/* packages/client/src/styles/app.css */
/* Source: Tailwind v4 CSS-first config + MDN env() docs */
@import "tailwindcss";

@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
```

### Complete `index.html` viewport change

```html
<!-- Source: MDN viewport-fit, Apple HIG safe area docs -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

### Active Tab Detection via `useLocation`

```tsx
// Source: React Router v7 docs — useLocation
import { useLocation } from 'react-router';

function isTabActive(tabPath: string, end: boolean, currentPath: string): boolean {
  if (end) return currentPath === tabPath;
  return currentPath.startsWith(tabPath);
}
```

Alternatively, use React Router's `NavLink` which handles `isActive` automatically — preferred since it's already used in the desktop nav.

### vaul Drawer Basic Pattern

```tsx
// Source: vaul docs — https://github.com/emilkowalski/vaul
import { Drawer } from 'vaul';

<Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
    <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl">
      {/* content */}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

`Drawer.Root` manages open state and calls `onOpenChange(false)` when the user drags to dismiss or clicks the backdrop.

### Tab Bar Layout for 44px Targets

```tsx
// flex-1 ensures each tab gets equal width; min-h-[44px] ensures tap target height
<NavLink
  to="/transactions"
  className={({ isActive }) =>
    `flex-1 flex flex-col items-center justify-center min-h-[44px] py-2 gap-1 text-xs
     ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`
  }
>
  <List size={20} />
  <span>Transactions</span>
</NavLink>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `min-h-screen` / `100vh` for full-height layouts | `min-h-dvh` (dynamic viewport height) | Safari 15.4 (2022), Tailwind v3.2+ | Eliminates iOS Safari toolbar overlap; no more content jump on scroll |
| `100svh` as the "safe" mobile height | `dvh` (updates when keyboard opens/closes) | 2023 CSS specification | `svh` is too short when toolbar is hidden; `dvh` is the correct general-purpose replacement |
| `env(safe-area-inset-bottom)` only with viewport-fit | Always paired with `viewport-fit=cover` in viewport meta | iOS 11.1 (2017) | Without `viewport-fit=cover`, `env()` returns 0 even on notched iPhones |
| Custom gesture listeners for sheet dismiss | `vaul` library | ~2022 (vaul 0.x), production-stable v1.x 2024 | Eliminates 300+ lines of edge-case touch event handling |
| `tailwind-plugin-safe-area` npm package | `@layer utilities` in `app.css` | Tailwind v4 CSS-first config (2024) | No plugin dependency; 3 lines of CSS achieves the same result |

---

## Open Questions

1. **Tab bar height: 56px vs 64px**
   - What we know: The success criteria says "minimum 44x44px tap targets." The current desktop nav uses `py-3` rows (≈48px). Tab bars in iOS apps are typically 49–83pt depending on device.
   - What's unclear: Whether `pb-20` (80px bottom padding on `<main>`) is sufficient or whether `pb-24` (96px) is needed once safe area inset is added on iPhone 14 Pro (34px home indicator).
   - Recommendation: Build with `pb-20 md:pb-6`. Test in iOS Simulator at 375px. Increase to `pb-24` if any content is clipped.

2. **Desktop nav `<h1>` "Minerva Money" on mobile**
   - What we know: The current `<nav>` contains `<h1 className="text-lg font-bold">Minerva Money</h1>`. If we add `hidden md:block` to the entire `<nav>`, this title disappears on mobile.
   - What's unclear: Whether a mobile header with just the app title is needed, or whether the bottom tab bar provides sufficient context.
   - Recommendation: Hide the full `<nav>` on mobile (`hidden md:block`). No mobile header needed — the bottom tab bar's active state shows current location. If a page title is needed later, individual page components can add a `<h1>` at the top of their content. The success criteria for Phase 21 does not mention a mobile page title.

3. **SyncButton / SyncStatus accessibility on mobile**
   - What we know: Both are currently only in the desktop `<nav>`. Hiding the nav on mobile hides them too. The roadmap recommends keeping them desktop-only for Phase 21 simplicity.
   - What's unclear: Whether this creates a usability gap significant enough to block the phase.
   - Recommendation: Exclude SyncButton from the mobile tab bar in Phase 21 (sync runs automatically; manual sync is a power-user action). The Dashboard page shows last sync time. If needed, Phase 25 can add sync controls to a mobile Dashboard header.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `packages/client/src/components/Layout.tsx`, `packages/client/index.html`, `packages/client/src/styles/app.css`, `packages/client/package.json` — confirmed current state of all files to be modified
- `.planning/research/STACK.md` (2026-03-23) — vaul v1.1.2, lucide-react v0.577.0, Tailwind v4 `@layer utilities` for safe area pattern
- `.planning/research/ARCHITECTURE.md` (2026-03-23) — component map, Layout.tsx before/after structure, CSS-only responsive visibility pattern
- `.planning/research/PITFALLS.md` (2026-03-23) — 10 pitfalls documented, mobile viewport and nav patterns
- `.planning/REQUIREMENTS.md` — NAV-01 through NAV-05, LAYOUT-01 through LAYOUT-05, TOUCH-01 requirements
- `.planning/ROADMAP.md` — Phase 21 success criteria, tab list (Dashboard, Transactions, Budget, Chat, More)

### Secondary (MEDIUM confidence)

- `vaul` GitHub / npm: React 19 in peerDependencies as of v1.1.1; `Drawer.Root`, `Drawer.Portal`, `Drawer.Overlay`, `Drawer.Content` API — confirmed in STACK.md research
- MDN: `env(safe-area-inset-bottom, 0px)` requires `viewport-fit=cover` — well-established, confirmed in PITFALLS.md

### Tertiary (LOW confidence)

- Specific safe area inset values for iPhone 14 Pro (34px home indicator) — based on training knowledge; verify in iOS Simulator if precise `pb-` sizing matters

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — vaul and lucide-react versions confirmed in prior project research; Tailwind v4 classes verified against installed version
- Architecture: HIGH — all files inspected directly; Layout.tsx structure fully known; component organization follows established codebase pattern
- Pitfalls: HIGH — prior project-level pitfall research is detailed and codebase-specific; all pitfalls verified against actual code patterns in use

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (vaul and lucide-react have stable APIs; Tailwind v4 CSS-first approach is stable)
