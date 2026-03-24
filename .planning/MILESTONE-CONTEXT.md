# Milestone Context

**Source:** Brainstorm session (Mobile-Friendly UI)
**Design:** .planning/designs/2026-03-23-mobile-friendly-ui-design.md

## Milestone Goal

Make Minerva Money fully functional on iPhone (375-430px) by adding targeted mobile breakpoint overrides to the existing desktop layout. Desktop UI remains unchanged. Uses Tailwind `max-md:` variants and a bottom tab bar navigation pattern.

## Features

### Bottom Tab Bar Navigation

On screens below `md` (768px), the top navbar collapses into a bottom tab bar fixed to the screen bottom with 5 visible tabs: Dashboard, Transactions, Budget, Chat, and More (which opens a sheet with Accounts, Categories, Rules, Transfers, Reports). Add a `BottomTabBar` component in `Layout.tsx`. Top nav links hidden on mobile. Simple inline SVG icons, no library dependency.

### Transaction Cards

Replace the Transactions table with card-based layout on mobile. Each card shows merchant name, amount, date, account, and tappable category badge. Filters collapse into a "Filter" button opening a slide-up sheet. Touch-friendly pagination.

### Budget Page Mobile Layout

Switch Budget from table to stacked category cards grouped by category group. Progress bars with color-coded status. Tappable categories expand inline for allocation editing. Sticky month selector and summary bar.

### Forms, Modals & Touch Targets

All form inputs get 44px minimum touch targets. Forms stack vertically on mobile. Modals become full-screen sheets. All buttons meet 44x44px minimum tap area.

### Remaining Pages

Dashboard already responsive (minor tweaks). Accounts stack naturally. Reports charts use ResponsiveContainer. Chat input fixed above tab bar. Categories and Rules get card layouts on mobile.
