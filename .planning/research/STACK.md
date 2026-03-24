# Stack Research

**Domain:** Mobile-friendly UI — bottom tab navigation, card layouts, touch targets, bottom sheets/modals, responsive breakpoints
**Researched:** 2026-03-23
**Confidence:** HIGH

## Context: Subsequent Milestone

This is a subsequent milestone. The core stack (React 19, React Router v7, Vite 6, Tailwind CSS v4, tRPC, TanStack Query, Recharts, better-sqlite3) is validated and unchanged. This document covers only what v2.2 adds.

**v2.2 goal:** Make the existing desktop web app fully functional on iPhone (375–430px viewport) without introducing a component library or heavy new dependencies.

**Existing patterns to preserve:**
- Custom Tailwind utility classes throughout (no shadcn, no MUI, no Radix primitives in use)
- All modals use `fixed inset-0 bg-black/50 flex items-center justify-center z-50` pattern
- `Layout.tsx` owns the top nav bar and `<Outlet />` — this is the natural insertion point for a bottom tab bar
- Tailwind v4 uses CSS-first config (`@import "tailwindcss"` only, no `tailwind.config.js`)

---

## Recommended Stack

### New Dependencies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `vaul` | ^1.1.2 | Bottom sheets (mobile modal replacement) | Unstyled drawer built on Radix Dialog. Handles iOS rubber-banding, drag-to-dismiss, snap points. Used in production by Vercel. Explicitly supports React 19 in peerDependencies as of v1.1.1. No default styles — integrates with existing Tailwind classes. |
| `lucide-react` | ^0.577.0 | Tab bar icons and touch-friendly action icons | Tree-shakeable SVG icons. Zero runtime dependencies. Already the de facto pairing with Tailwind custom-component stacks. Replaces ad-hoc text labels or emoji in the bottom tab bar. |

### No New Dev Dependencies

Tailwind v4 handles all responsive utilities natively. No additional PostCSS plugins or build tools are needed.

---

## CSS-Only Additions (no packages)

These capabilities are handled directly in `app.css` or component Tailwind classes — no packages required.

### 1. Safe Area Insets (iOS notch / home indicator)

Tailwind v4 does not provide `pb-safe` utilities out of the box, but the `@layer utilities` pattern in `app.css` is idiomatic for v4 and requires no plugin:

```css
/* packages/client/src/styles/app.css */
@import "tailwindcss";

@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .pt-safe {
    padding-top: env(safe-area-inset-top, 0px);
  }
}
```

Requires `viewport-fit=cover` in `index.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

### 2. Bottom Tab Bar

Pure Tailwind + React Router `NavLink`. Fixed to bottom of viewport, `z-50`, uses `pb-safe` for iPhone home indicator clearance. No library needed.

### 3. Responsive Breakpoints

Tailwind v4 ships `sm:` (640px), `md:` (768px), `lg:` (1024px) breakpoints. The mobile-first pattern `class="..." md:hidden` and `class="hidden md:flex"` is sufficient for toggling between card layout (mobile) and table layout (desktop).

### 4. 44px Touch Targets

Use `min-h-[44px] min-w-[44px]` Tailwind utilities on interactive elements. No library needed — this is a CSS size constraint.

### 5. Full-Screen Sheet Modals on Mobile

`vaul` provides the sheet/drawer primitive. On desktop, the existing centered modal pattern (`fixed inset-0 ... max-w-4xl`) is retained. On mobile, modals are replaced with vaul drawers that slide up from the bottom. A shared wrapper component handles the responsive switch.

---

## Installation

```bash
# New packages (client workspace only)
npm install vaul lucide-react --workspace=packages/client
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `vaul` | `@radix-ui/react-dialog` directly | If you're building a component library with full Radix primitives throughout. vaul wraps Radix Dialog and adds mobile-specific UX (drag handle, snap points, iOS scroll locking) that the raw dialog primitive doesn't provide. |
| `vaul` | Custom CSS `transform: translateY` sheet | Viable for simple cases but requires hand-rolling gesture detection, spring animations, and backdrop interaction — vaul handles all of this correctly across iOS Safari, Chrome Android, and desktop. |
| `lucide-react` | `heroicons` | When already using Tailwind UI / Headless UI components. Either works; lucide has a larger icon set and more active release cadence. |
| `lucide-react` | Inline SVGs | Viable for small fixed icon sets. lucide eliminates manual SVG maintenance and provides consistent stroke widths. |
| CSS `@layer utilities` for safe area | `tailwindcss-safe-area` npm plugin | The plugin is unnecessary overhead for a two-utility addition. The v4 CSS-first approach makes `@layer utilities` the idiomatic choice. |
| Tailwind responsive prefixes | CSS media queries | Tailwind breakpoints compile to the same output. The `sm:hidden`/`md:flex` pattern keeps mobile styles co-located with component markup rather than split into separate `.css` files. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `shadcn/ui` | Adds Radix UI primitives, `class-variance-authority`, `clsx`, and `tailwind-merge` dependencies. Conflicts with Tailwind v4 CSS-first config (shadcn targets v3 config format as of early 2026). Replacing existing custom components with shadcn components is out of scope. | Existing custom Tailwind components + vaul for sheets only |
| `@radix-ui/react-*` primitives (beyond vaul's bundled usage) | No existing Radix primitives in the codebase. Adding them introduces a new patterns layer without solving a concrete problem. | Custom Tailwind components for all non-sheet UI |
| `framer-motion` | 80KB+ bundle addition for animations that can be handled with Tailwind's `transition` utilities and CSS `transform`. vaul already provides sheet animation. | `transition-transform duration-300` Tailwind utilities |
| `react-spring` | Same animation concern as framer-motion, with a more complex API. | Tailwind transition utilities |
| `tailwindcss-safe-area` plugin | Two-line `@layer utilities` addition achieves the same result without a package dependency. | CSS `env(safe-area-inset-*)` in `app.css` |
| `@ionic/react` or `Capacitor` | Native app shell frameworks — the goal is a mobile-responsive web page, not a hybrid app. | Tailwind responsive breakpoints + vaul |
| `react-native-web` | Native component abstraction. The app is a standard React web app and must remain one. | — |

---

## Integration Notes

### vaul with Existing Modal Pattern

Existing modals (e.g., `ManualLinkModal`, `SplitModal`) use `fixed inset-0 bg-black/50 flex items-center justify-center z-50`. The migration path is:

1. Create a `Sheet` wrapper component that renders a vaul `Drawer.Root` on mobile and the existing centered modal container on desktop.
2. Detect mobile with a `useMediaQuery` hook checking `max-width: 767px`, or use a CSS-only approach where the same vaul `Drawer` is always rendered but styled differently at `md:` breakpoint.
3. The pure CSS approach is simpler: render `Drawer.Content` with `class="fixed bottom-0 inset-x-0 rounded-t-xl md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-2xl md:rounded-xl"`. This makes vaul handle drag-to-dismiss on mobile while appearing centered on desktop.

### lucide-react with Tailwind v4

No configuration required. Import icons directly:
```tsx
import { Home, CreditCard, PieChart, MessageSquare, MoreHorizontal } from 'lucide-react';
```
Size with `className="w-5 h-5"` or `size={20}` prop. Both work with Tailwind v4.

### Layout.tsx Changes

The bottom tab bar lives inside `Layout.tsx` alongside the existing top nav. Pattern:

```tsx
{/* Existing top nav — hide on mobile */}
<nav className="hidden md:block bg-gray-900 ...">...</nav>

{/* Bottom tab bar — show on mobile only */}
<nav className="fixed bottom-0 inset-x-0 md:hidden bg-white border-t pb-safe z-50">
  {/* 5 primary tabs + More */}
</nav>

{/* Main content — add bottom padding on mobile to clear the tab bar */}
<main className="mx-auto max-w-6xl px-4 py-6 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-6">
  <Outlet />
</main>
```

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vaul@1.1.2` | React 19 | Explicit in peerDependencies: `"react": "^16.8 \|\| ^17.0 \|\| ^18.0 \|\| ^19.0.0"` |
| `vaul@1.1.2` | Tailwind CSS v4 | vaul is unstyled — all styling is consumer-provided via className. Zero conflict with v4 CSS-first config. |
| `lucide-react@0.577.0` | React 19 | No peerDependency conflicts. Tree-shaking via named imports works with Vite 6. |
| `lucide-react@0.577.0` | Tailwind CSS v4 | SVG icon sizing via `w-5 h-5` Tailwind classes works identically in v4. |
| CSS `env(safe-area-inset-*)` | Safari iOS 11.1+ | All modern iOS Safari versions support `env()`. The fallback `0px` handles desktop. |

---

## Sources

- [vaul npm](https://www.npmjs.com/package/vaul) — v1.1.2 current, React 19 peerDependency confirmed
- [vaul GitHub releases](https://github.com/emilkowalski/vaul/releases/tag/v1.1.2) — React 19 added to peerDeps in v1.1.1
- [lucide-react npm](https://www.npmjs.com/package/lucide-react) — v0.577.0 current as of March 2026
- [Tailwind CSS v4 docs — Compatibility](https://tailwindcss.com/docs/compatibility) — CSS-first config, no tailwind.config.js
- [Tailwind CSS safe-area discussion](https://github.com/tailwindlabs/tailwindcss/discussions/12536) — confirmed `@layer utilities` approach for v4
- Direct inspection: `packages/client/src/styles/app.css`, `packages/client/package.json`, `packages/client/src/components/Layout.tsx`, `packages/client/src/components/ManualLinkModal.tsx`

---
*Stack research for: Minerva Money v2.2 Mobile-Friendly UI*
*Researched: 2026-03-23*
