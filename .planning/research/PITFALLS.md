# Pitfalls Research

**Domain:** Adding mobile-friendly UI to existing desktop-first React + Tailwind personal budgeting app
**Researched:** 2026-03-23
**Confidence:** HIGH (patterns verified against existing codebase structure; well-documented in community post-mortems for React + Tailwind mobile retrofits)

## Critical Pitfalls

### Pitfall 1: Bottom Tab Bar Overlapping Page Content

**What goes wrong:**
A `fixed bottom-0` tab bar is added and navigation works, but the bottom 56–64px of every page is permanently obscured. The last transaction card, the last budget row, the submit button on forms — all unreachable. On iPhone Safari, the situation is worse: the browser's own bottom bar appears and disappears as the user scrolls, meaning the overlap amount varies dynamically. The fix of adding `pb-16` to `<main>` is missed or added inconsistently.

**Why it happens:**
`fixed` elements are removed from document flow entirely. Developers test scrolling on the dashboard (which has enough content to reveal the problem) but miss short pages (Accounts, Settings) where the fixed bar overlaps the only content on screen. The Safari dynamic toolbar compounds this because the visual viewport height changes on scroll — `100vh` does not account for the toolbar.

**How to avoid:**
- Add `pb-20` (or `pb-safe` with CSS env vars) to the `<main>` element, not individual pages. This is a layout-level concern and belongs in `Layout.tsx`.
- Use `min-h-[calc(100dvh-56px)]` for the main content area rather than `min-h-screen` — `dvh` (dynamic viewport height) updates as Safari's toolbar appears/disappears.
- On mobile, hide the top navbar entirely and let the bottom tab bar be the sole navigation; do not stack both.
- Wrap tab bar in a `<div className="pb-safe">` using `padding-bottom: env(safe-area-inset-bottom)` via a Tailwind v4 custom utility to handle iPhone home indicator.

**Warning signs:**
- Submit buttons on forms are clipped at the bottom of the screen.
- The last row of a table or last card in a list disappears under the tab bar.
- iOS Safari bottom bar flickers and content jumps as the user scrolls.

**Phase to address:**
Bottom tab bar phase — add `pb-safe` padding to `Layout.tsx` `<main>` as the first step, before converting any individual pages.

---

### Pitfall 2: Touch Targets Below 44px Minimum

**What goes wrong:**
Existing desktop buttons use `px-3 py-1` (approximately 28–32px tall). Category picker dropdowns, inline "Edit" links, the "Split" action column in the transactions table — all render as small text links that are tappable by mouse but miss-tappable on touch. Users repeatedly tap the wrong row or can't trigger the action at all.

**Why it happens:**
`py-1` (`4px` top + `4px` bottom + 16px line height = ~24px) passes visual inspection on desktop. The 44px minimum (Apple HIG) is not enforced by any linter, browser warning, or Tailwind class. The problem is invisible until tested on an actual phone.

**How to avoid:**
- Audit all interactive elements and apply `min-h-[44px]` as a rule for anything the user taps on mobile.
- Tab bar icons must be `h-11` (44px) or larger, including the hit area, not just the icon glyph.
- The existing `CategoryPicker` and inline edit buttons in the transactions table will need `py-3` minimum on mobile — use `max-md:py-3` to avoid breaking desktop.
- For text-only links used as actions (e.g., "Edit", "Confirm", "Cancel"), wrap in a `<button className="min-h-[44px] px-3 flex items-center">` rather than a bare anchor.

**Warning signs:**
- Any `py-1` or `py-0.5` class on a button or interactive element.
- Icon-only buttons without explicit `h-11 w-11` constraints.
- Dropdown triggers and select elements without `h-11` on mobile.

**Phase to address:**
Touch target audit phase — scan all interactive components for `py-1` / `py-0.5` and apply `max-md:py-3` overrides before shipping any mobile page.

---

### Pitfall 3: Table-to-Card Conversion Creates Horizontal Scroll Traps

**What goes wrong:**
The existing transactions table has columns: Date, Payee, Amount, Account, Category, Actions. The naive mobile approach is `overflow-x-auto` on the table wrapper. This works but creates a horizontal scroll zone inside the page — users swipe right intending to go back (iOS swipe gesture) and instead scroll the table. Alternatively, the table is hidden on mobile (`hidden md:block`) and a card layout added, but the card layout replicates all the same data in a format too dense for a 375px screen.

**Why it happens:**
`overflow-x-auto` is a one-line fix that appears to solve the problem. The horizontal-scroll-trap UX issue only surfaces on actual iPhone hardware when the swipe-back gesture conflicts with table scroll. Dense card layouts happen when developers copy desktop data fields 1:1 into the card without thinking about mobile information hierarchy.

**How to avoid:**
- Never use `overflow-x-auto` on tables that are full-width page content on mobile. Use a card layout instead.
- Mobile transaction cards should show: Date (small, secondary), Payee (primary bold), Amount (right-aligned, prominent), Category (badge/chip). Account, Memo, and Split details are secondary — show behind a tap/expand or omit.
- Implement as `hidden md:table` / `block md:hidden` pattern on the table vs. card container — not on every row.
- Card tap to expand pattern: tapping a transaction card expands it inline to show account, memo, category picker, and actions. This avoids the need to fit all data in the collapsed card view.

**Warning signs:**
- Any `overflow-x-auto` wrapping a full-width table on mobile.
- Transaction cards that try to show 5+ data fields in a single collapsed view.
- Desktop-width columns (`w-32`, `w-48`) not suppressed at `max-md:` breakpoint.

**Phase to address:**
Transaction mobile layout phase — build the card layout component alongside the existing table, gated behind `block md:hidden`.

---

### Pitfall 4: Modals Are Not Full-Screen on Mobile (Or Are, But Unusable)

**What goes wrong:**
**Scenario A:** The existing `SplitModal` and `ManualTransactionForm` modals use `max-w-md mx-auto` centering. On a 375px screen this creates a 375px-wide modal with 0 side margins — it fits but feels cramped and the bottom actions (Save/Cancel) are below the fold with the keyboard open.

**Scenario B:** The modal is converted to `fixed inset-0` full screen, but the keyboard opens and shifts the viewport — the input being typed into scrolls off-screen because iOS reflows the visual viewport (not the layout viewport) when the software keyboard appears. The modal content above the keyboard is not scrollable because the developer forgot `overflow-y-auto` on the modal body.

**Why it happens:**
Modal libraries handle viewport/keyboard interactions automatically. Custom modals (as in this codebase) require manual handling of: keyboard-triggered viewport resize, scroll locking the body behind the modal, and ensuring the modal itself is scrollable when content exceeds the available height.

**How to avoid:**
- Full-screen sheet pattern: `fixed inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl overflow-y-auto` — a bottom sheet that slides up, scrollable within, with the header pinned at top.
- Body scroll lock when modal opens: add `overflow-hidden` to `document.body` on mount, remove on unmount. Without this, background content scrolls while modal is open.
- Never rely on `vh` units for modal height inside iOS Safari — use `dvh` or `svh` instead: `max-h-[90svh]`.
- Put the primary action (Save) at the bottom of the sheet and ensure `pb-safe` accounts for the home indicator.
- For forms: wrap form content in a scrollable `div` with a fixed footer containing Save/Cancel buttons, rather than making the entire sheet scroll.

**Warning signs:**
- Any modal using `transform: translate(-50%, -50%)` absolute centering — these break entirely when the keyboard opens.
- Modal body without `overflow-y-auto` — content gets clipped on small screens.
- Missing `overflow-hidden` on `<body>` when modal is open — background scrolls through.
- Form inputs near the bottom of a modal that scroll off-screen when keyboard opens.

**Phase to address:**
Modal/sheet phase — convert modals to bottom sheet pattern before the form usability work, since forms inside modals depend on correct sheet behavior.

---

### Pitfall 5: iOS Safari Viewport Height Causes Full-Height Layout Breaks

**What goes wrong:**
The existing `min-h-screen` on the root `div` in `Layout.tsx` uses `100vh`. On iOS Safari, `100vh` equals the viewport height including the browser chrome — but the browser chrome is visible, so the actual usable area is less. The page overflows or the bottom tab bar sits behind the browser bottom bar. The converse: when Safari hides its toolbar on scroll, `100vh` is now too short and content jumps.

Additionally, the Chat page (`ChatPage.tsx`) likely uses `h-screen` or similar to create a full-height chat interface. This will break badly on mobile: the keyboard opens, shrinks the visual viewport, and the chat input is hidden behind the keyboard with no way to reach it.

**Why it happens:**
`100vh` is reliable on desktop browsers. The iOS Safari toolbar behavior (`dvh` vs `svh` vs `lvh`) was only standardized in 2023 — many developers still use `vh` from muscle memory. The Chat page full-height pattern is specifically problematic because it requires a fixed-height container with an internal scroll area.

**How to avoid:**
- Replace `min-h-screen` in `Layout.tsx` with `min-h-dvh` (Tailwind v4 has `min-h-dvh` natively).
- For the Chat page: use `h-dvh` for the outer container, `flex flex-col`, scrollable message area with `flex-1 overflow-y-auto`, and a fixed input area that stays above the keyboard.
- Test the Chat page specifically with the iOS simulator keyboard open — it's the single highest-risk page for this pitfall.
- Do not use `100svh` (smallest viewport height) for full-page layouts — it's too short when Safari's toolbar is hidden.

**Warning signs:**
- `h-screen` or `min-h-screen` on any full-height layout component.
- Chat input disappearing when keyboard opens.
- Page content jumping when scrolling causes Safari toolbar to hide/show.

**Phase to address:**
Layout foundation phase (before any page conversions) — replace `min-h-screen` with `min-h-dvh` in `Layout.tsx`, and convert the Chat page full-height layout to use `h-dvh` + flex column.

---

### Pitfall 6: Recharts Charts Are Not Responsive at 375px

**What goes wrong:**
The `ReportsPage.tsx` uses `<ResponsiveContainer>` with fixed percentage widths. `ResponsiveContainer` works — it resizes — but the content inside does not adapt: the `PieChart` legend shows all category names in a single-column list that extends far below the chart on mobile, the `BarChart` has 12 months of bars that become 25px wide each and unreadable, and the `XAxis` tick labels overlap because they were designed for a 900px-wide axis.

**Why it happens:**
`ResponsiveContainer` makes the chart container responsive but does not make chart content responsive. Font sizes, tick density, legend position, and bar minimum widths are all static. Developers see the chart resize correctly and assume the job is done.

**How to avoid:**
- Pass different `width` calculations or use Tailwind breakpoints in chart rendering — but since JSX doesn't take Tailwind classes directly on Recharts elements, use a `useBreakpoint()` hook that reads `window.matchMedia('(max-width: 768px)')` and pass props conditionally.
- On mobile: reduce tick count on `XAxis` with `interval="preserveStartEnd"` or a computed interval, reduce font size to 10–11px, move legend to `bottom` position instead of `right`.
- For the pie chart on mobile: hide the legend or switch to a simpler format; use `cx="50%"` `cy="40%"` to leave room for the legend below.
- For the bar chart with many months: consider showing only the last 6 months on mobile, or allow horizontal scroll within a constrained chart container (unlike table scroll, a chart-specific scroll zone is less likely to conflict with swipe gestures).
- Set a `minHeight` on `ResponsiveContainer` to prevent the chart from collapsing to 0px during initial render.

**Warning signs:**
- X-axis labels overlapping at mobile width.
- Legend extending vertically below the visible area.
- Chart container collapsing to 0 height on first render.
- Bar chart bars thinner than 8px.

**Phase to address:**
Reports mobile phase — add a `useIsMobile()` hook in a shared lib and use it to pass conditional props to Recharts components.

---

### Pitfall 7: Tailwind v4 `max-md:` Variant Syntax Confusion

**What goes wrong:**
Tailwind v4 changes how `max-` breakpoint variants work. In v3, `max-md:hidden` meant "hidden when viewport is less than md". In v4, the same syntax still works but the underlying `@media` query is generated differently, and mixing `md:` (mobile-first) with `max-md:` (desktop-first) in the same component can produce unexpected interactions when the v4 CSS cascade order differs from v3. Developers sometimes add `max-md:` variants expecting v3 behavior and get subtle layout bugs.

More concretely: if the existing code uses `md:flex` (show as flex at md+) and the new code adds `max-md:flex-col` (stack vertically below md), the two classes interact correctly only if the cascade order is predictable — which it is in Tailwind v4 with `@layer utilities`, but developers who don't know this assume conflicts.

**Why it happens:**
The project is Tailwind v4 (`^4.2.2`). Tailwind v4 uses a CSS-first approach (`@import "tailwindcss"`) and generates utilities via cascade layers. Community tutorials and most StackOverflow answers still reference v3 `tailwind.config.js` patterns. v4's `max-md:` variants are documented but the differences from v3 are subtle and easy to overlook.

**How to avoid:**
- Establish a project convention early: prefer mobile-first (use `md:` to add desktop styles) over desktop-first (use `max-md:` to override desktop). The existing codebase is desktop-first, but new mobile work should prefer `max-md:` overrides rather than rewriting existing classes.
- Test each breakpoint class in isolation before combining — don't trust that visual inspection at md+ width confirms max-md behavior.
- Use the browser DevTools "responsive design mode" with precise widths (375px, 390px, 430px for iPhone) rather than just dragging the window.
- Prefer `max-md:` for structural layout changes (hide/show, stack vs. row) and keep existing desktop classes untouched where possible to minimize regression risk.

**Warning signs:**
- A component that looks right at md+ breaks at 375px but looks correct at 500px (suggests a `sm:` breakpoint conflict).
- Classes added with `max-md:` having no visible effect (check if the same property is set by a later utility in the cascade without a breakpoint qualifier).

**Phase to address:**
Layout foundation phase — establish the `max-md:` convention and verify it works with a simple test component before applying it to production pages.

---

### Pitfall 8: "More" Overflow Sheet for Extra Nav Items Is Easy to Get Wrong

**What goes wrong:**
The bottom tab bar has 5 primary tabs and a "More" overflow. The overflow sheet (a bottom drawer or popover) is opened by tapping "More". Common failures:
- The sheet opens but does not close when tapping a nav item inside it, because the click handler triggers navigation but the sheet state remains open.
- The sheet is not closed when the back/swipe-back gesture is used to navigate away.
- Body scroll is not locked while the sheet is open, so the background scrolls behind it.
- The "More" sheet uses the same `fixed` positioning as the tab bar, creating a z-index stacking conflict.

**Why it happens:**
The "More" overflow pattern is not native to React Router v7 or any component in this stack. It must be built from scratch. Developers implement the tap-to-open correctly but forget the close-on-navigate and close-on-browser-back cases.

**How to avoid:**
- Use React Router's `useLocation()` in a `useEffect` to close the sheet whenever the route changes: the sheet closes automatically on navigation without needing explicit close calls in each link.
- Add a transparent backdrop `div` behind the sheet and above the main content but below the tab bar — tapping the backdrop closes the sheet.
- Lock body scroll while the sheet is open (same pattern as modals).
- Give the sheet `z-[60]` and the backdrop `z-[50]` — one level above the tab bar's `z-[40]`.

**Warning signs:**
- Background content scrolling while the More sheet is open.
- Navigating via a More sheet link leaves the sheet visible on the new page.
- Tapping outside the More sheet does not close it.

**Phase to address:**
Bottom tab bar phase — build the More sheet with close-on-navigate behavior from the start, not as an afterthought.

---

### Pitfall 9: Forgetting the Desktop Navbar When Adding Mobile Nav

**What goes wrong:**
The bottom tab bar is added and works on mobile. But the existing top navbar in `Layout.tsx` is still rendered on all screen sizes. On desktop it shows correctly. On mobile, both the top navbar and bottom tab bar render simultaneously — the top navbar is either squished (9 links in `flex-wrap` at 375px) or partially hidden behind overflow. The developer hides the nav links on mobile with `max-md:hidden` but forgets the containing `<nav>` element, leaving a dark bar taking 48px of vertical space with just the app title and sync controls.

**Why it happens:**
The top navbar has multiple independent elements: the logo, the nav links, and the sync status/button. Hiding `max-md:hidden` on the links wrapper leaves the nav bar visible. A complete solution requires either hiding the entire `<nav>` on mobile or repurposing the top bar as a mobile header (title + sync button only, without nav links).

**How to avoid:**
- On mobile, transform the top navbar into a slimmer header: `<header>` with just the page title and sync icon, no nav links. The nav links move entirely to the bottom tab bar.
- Apply `max-md:hidden` to the nav links `<div className="flex gap-4">` AND restructure the nav bar to show a mobile header instead: `max-md:py-2` (slimmer), hide sync status text (show icon only).
- Do this in `Layout.tsx` in one pass — don't patch individual nav links one at a time.

**Warning signs:**
- Both a horizontal navbar and a bottom tab bar visible simultaneously on mobile.
- The top nav area taking up 48px+ on mobile with only the app title visible.
- Sync button and sync status overflowing on 375px width.

**Phase to address:**
Bottom tab bar phase — the first step should be conditionally hiding the top navbar links on mobile in the same commit that adds the bottom tab bar.

---

### Pitfall 10: Budget Page Inline Editing Breaks on Mobile

**What goes wrong:**
The Budget page uses inline editing — clicking an allocation amount triggers an input field in the table cell. On mobile, tapping a cell to edit triggers the software keyboard, which shrinks the visual viewport and may scroll the cell off-screen. If the inline input is positioned with `absolute` (a common pattern for "edit in place"), it can be clipped by the table's `overflow-hidden` ancestor. The input's hit area is often smaller than 44px.

**Why it happens:**
Inline editing in table cells is a desktop-native pattern (double-click to edit). On mobile it conflicts with tap-to-scroll, the keyboard viewport shift, and the smaller touch targets of dense table rows. The pattern works on desktop but requires fundamental restructuring for mobile.

**How to avoid:**
- On mobile, don't use inline table editing. Instead: tapping a category row opens a bottom sheet with the category name, current allocation, and a prominent number input. The sheet has Save/Cancel at the bottom.
- The bottom sheet approach sidesteps all inline editing issues because the input is in a predictable, full-width, keyboard-aware context.
- For the desktop table, keep the existing inline edit pattern untouched — the mobile sheet is an addition, not a replacement.

**Warning signs:**
- `absolute`-positioned inputs inside table cells.
- Input fields narrower than the full card width on mobile.
- `td` elements with `overflow-hidden` containing edit controls.

**Phase to address:**
Budget mobile phase — the inline edit table pattern should be entirely replaced with a bottom sheet pattern on mobile, gated behind `max-md:`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `overflow-x-auto` on tables instead of card layout | One line to "fix" table overflow | Horizontal scroll trap conflicts with iOS swipe-back gesture | Never for full-page tables — use card layout |
| `hidden md:block` on desktop table + no mobile replacement | Easy to hide the problem | Page shows no transactions on mobile | Never — always build the mobile alternative in the same phase |
| `100vh` / `h-screen` for full-height layouts | Works on desktop/Chrome | Broken on iOS Safari (toolbar overlap, keyboard shrink) | Never — use `dvh` or `svh` |
| Skipping touch target audit until QA | Saves time during implementation | Widespread tappability failures across all pages | Never — do the audit before shipping each page |
| Adding mobile nav without hiding desktop nav | Quick implementation | Both navbars visible simultaneously on mobile | Never — handle both in the same commit |
| Using Recharts without mobile-specific prop customization | Chart renders without extra code | Unreadable at 375px (overlapping labels, tiny bars) | Never — add mobile props when adding chart pages |
| Inline table editing on mobile | Reuses existing desktop logic | Keyboard covers the cell being edited; < 44px targets | Never — use bottom sheet pattern on mobile |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tailwind v4 + `max-md:` | Expecting v3 `tailwind.config.js` `screens` customization behavior | Use Tailwind v4 `@custom-variant` in the CSS file for custom breakpoints; standard `max-md:` works but cascade order must be verified |
| Recharts + ResponsiveContainer | Assuming `ResponsiveContainer` makes chart content responsive | `ResponsiveContainer` only resizes the container; add explicit mobile props for tick count, font sizes, and legend position |
| React Router v7 + bottom sheet | Sheet stays open after navigation | Use `useLocation()` in `useEffect` to close sheet on route change |
| iOS Safari + `fixed` positioning | Fixed elements jump when toolbar hides/shows | Use `env(safe-area-inset-bottom)` for bottom padding; test with actual device or precise iOS simulator |
| iOS keyboard + `vh` units | Keyboard shrinks visual viewport, `100vh` element no longer fits | Use `dvh` (dynamic viewport height) which updates when keyboard opens/closes |
| `@dnd-kit` + touch screens | Drag handles that are too small to trigger drag without accidentally scrolling | Ensure drag handles meet 44px minimum; test on touch device — dnd-kit has `activationConstraint` for distance/delay to prevent accidental activation |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rendering all transactions as cards (no virtualization) | Scroll jank on Transactions page with 500+ transactions | For card lists exceeding ~100 items, use `react-window` or pagination; the existing table has no virtualization either — cards make this worse because they are taller | At ~200+ transactions with complex card markup |
| Recharts re-rendering on every scroll event | CPU usage spikes while scrolling past charts on the Reports page | Wrap chart sections in `React.memo`; ensure data props are stable references (don't recreate arrays inline) | On devices with limited GPU compositing (older iPhones) |
| Full-screen sheet animation on low-end devices | Sheet open/close stutters | Use `transform: translateY` (GPU-accelerated) not `height` animation for sheet open/close; prefer `transition-transform` over `transition-all` | On iPhone SE (A13) or older — still in use |

## Security Mistakes

No new security concerns introduced by mobile UI work. Existing security posture (no auth, private home network, API keys server-side) is unchanged. The mobile UI is purely client-side presentation.

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Bottom tab bar without active state indicator | User loses sense of current location | Use `useLocation()` or React Router `NavLink` isActive to apply distinct active styling (filled icon vs. outline, or indicator dot) |
| Card tap target ambiguity | User taps a transaction card expecting expand behavior but accidentally triggers category picker | Distinguish tap zones: the body of the card expands/navigates, explicit action buttons (Category, Split) are clearly demarcated with icons and 44px targets |
| No empty state on mobile card views | Filtered views show blank space with no explanation | Add explicit empty state messages ("No transactions in this period") — desktop tables show empty rows; card views show nothing |
| Sheet forms without keyboard accessory | User can't dismiss keyboard from form without tapping outside | Consider a keyboard dismiss button in the header of form sheets; iOS does not always show a "Done" key for text inputs |
| Budget progress bars too thin to read on mobile | User cannot see remaining budget at a glance | Progress bars should be `h-2` minimum on mobile, with percentage or remaining amount shown as text beside or below the bar |
| Sync controls buried after navbar collapse | User can't find "Sync Now" on mobile | SyncButton must be accessible from the mobile header or from a prominent location on the Dashboard — not hidden in a desktop-only nav area |

## "Looks Done But Isn't" Checklist

- [ ] **Bottom tab bar:** All page content is visible above the tab bar — test on a short-content page (Accounts) with a real device viewport
- [ ] **Safe area inset:** Tab bar has `padding-bottom: env(safe-area-inset-bottom)` — verify on iPhone with home indicator (iPhone X and later)
- [ ] **Desktop navbar hidden on mobile:** No nav links or double navigation bars visible at 375px
- [ ] **Sync controls on mobile:** SyncButton and SyncStatus are accessible on mobile — not hidden inside a desktop-only nav element
- [ ] **Touch targets:** Every tappable element is at least 44px tall — verify by inspecting computed height in DevTools at mobile width
- [ ] **Modal body scroll:** Full-screen sheets have `overflow-y-auto` on the content area — verify by opening a form with many fields on a 375px viewport
- [ ] **Body scroll lock:** Background content does not scroll when a modal or sheet is open
- [ ] **Chat page keyboard:** Chat input remains visible and usable when iOS keyboard is open — test with iPhone simulator keyboard
- [ ] **Viewport height:** No `h-screen` or `min-h-screen` or `100vh` remains on any full-height layout element — all converted to `dvh`
- [ ] **Charts at 375px:** No overlapping axis labels, no legend overflow below chart container, no bars thinner than 8px
- [ ] **More sheet close-on-navigate:** Tapping a link in the More sheet navigates AND closes the sheet
- [ ] **Table hidden on mobile:** The transactions table has `hidden md:table` and the card list has `block md:hidden` — not both visible at 375px

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Content hidden behind tab bar | LOW | Add `pb-20` to `Layout.tsx` `<main>` — one-line fix, test all pages after |
| iOS Safari toolbar overlap on full-height layout | MEDIUM | Replace `h-screen`/`vh` with `dvh` across Layout and ChatPage; verify in iOS simulator |
| Horizontal scroll trap from `overflow-x-auto` table | MEDIUM | Build card layout for the affected page; hide table with `hidden md:table` |
| Touch targets too small | MEDIUM | Audit all interactive elements; add `min-h-[44px]` via `max-md:min-h-[44px]` — time-consuming but mechanical |
| Modal keyboard visibility on iOS | HIGH | Refactor to bottom sheet pattern with scrollable content area and fixed footer — requires component rewrite |
| Chart unreadable at 375px | MEDIUM | Add `useIsMobile()` hook and conditional Recharts props — one pass per chart component |
| More sheet not closing on navigate | LOW | Add `useEffect` on `useLocation()` to reset sheet state — single hook call |
| Both navbars visible simultaneously | LOW | Add `max-md:hidden` to the nav links wrapper in `Layout.tsx`; restructure mobile header in the same commit |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Content hidden behind fixed tab bar | Bottom tab bar phase | Scroll to bottom of Accounts page on 375px — no content clipped |
| Tab bar + iOS home indicator overlap | Bottom tab bar phase | Test on iPhone 14 simulator — tab bar above home indicator |
| Desktop navbar + mobile tab bar both visible | Bottom tab bar phase | At 375px: no nav links visible at top, 5 tabs visible at bottom |
| Sync controls inaccessible on mobile | Bottom tab bar phase | SyncButton reachable without desktop navbar |
| Touch targets below 44px | Touch target audit phase (before any page ships) | DevTools computed height on all buttons ≥ 44px at 375px |
| Table horizontal scroll trap | Transaction card layout phase | At 375px: no horizontal scrollbar on Transactions page |
| Modal content clipped on keyboard open | Modal/sheet phase | Open SplitModal on 375px with keyboard open — Save button visible |
| Body not scroll-locked behind modals | Modal/sheet phase | Background content does not scroll while sheet is open |
| iOS `100vh` viewport break | Layout foundation phase | No layout jump when Safari toolbar hides/shows on scroll |
| Chat input hidden by keyboard | Layout foundation phase | Chat input visible and usable with iOS keyboard open |
| Recharts unreadable at 375px | Reports mobile phase | No overlapping labels; chart readable at 375px without zooming |
| More sheet not closing on navigate | Bottom tab bar phase | Navigate via More sheet — sheet is closed on arrival at new page |
| Budget inline editing unusable on mobile | Budget mobile phase | Tapping a budget allocation on 375px opens a bottom sheet — not an inline input |

## Sources

- [Apple Human Interface Guidelines: Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — 44pt minimum touch target, safe area insets. HIGH confidence.
- [Apple HIG: Adaptivity and Layout](https://developer.apple.com/design/human-interface-guidelines/foundations/layout/) — mobile-first design principles. HIGH confidence.
- [iOS Safari viewport height behavior (dvh/svh/lvh)](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) — WebKit blog on new viewport units. HIGH confidence.
- [MDN: env() — safe-area-inset-bottom](https://developer.mozilla.org/en-US/docs/Web/CSS/env) — iOS notch/home indicator insets. HIGH confidence.
- [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide) — changes to max-breakpoint variants and cascade layer behavior. HIGH confidence.
- [Recharts ResponsiveContainer docs](https://recharts.org/en-US/api/ResponsiveContainer) — container-only responsiveness, does not adapt chart content. HIGH confidence.
- [React Router v7 useLocation](https://reactrouter.com/en/main/hooks/use-location) — for close-on-navigate patterns. HIGH confidence.
- Codebase inspection: `packages/client/src/components/Layout.tsx`, `TransactionsPage.tsx`, `BudgetPage.tsx`, `ReportsPage.tsx`, `SplitModal.tsx`, `app.tsx`, `client/package.json` — React 19, Tailwind v4, React Router v7, Recharts v3, @dnd-kit. HIGH confidence.

---
*Pitfalls research for: Minerva Money v2.2 mobile-friendly UI retrofit*
*Researched: 2026-03-23*
