---
phase: 25-remaining-pages
plan: 02
subsystem: ui
tags: [tailwind, responsive, mobile, cards, dual-render]

requires:
  - phase: 24-modal-conversions
    provides: vaul Drawer bottom sheet for RuleForm
  - phase: 21-responsive-shell
    provides: max-md breakpoint pattern
provides:
  - RulesPage mobile card layout with dual-render (table desktop, cards mobile)
  - Verified DashboardPage and AccountsPage mobile compatibility
affects: []

tech-stack:
  added: []
  patterns: [dual-render table/card pattern for mobile]

key-files:
  created: []
  modified:
    - packages/client/src/pages/RulesPage.tsx

key-decisions:
  - "DashboardPage already uses grid-cols-1 on mobile — no changes needed"
  - "AccountsPage already stacks cards with space-y-3 — no changes needed"

patterns-established:
  - "Dual-render: max-md:hidden on table wrapper, md:hidden on card list for mobile/desktop switching"

requirements-completed: [PAGE-06, PAGE-01, PAGE-02]

duration: 2min
completed: 2026-03-23
---

# Plan 25-02: Rules Card Layout + Dashboard/Accounts Audit Summary

**RulesPage dual-render with mobile cards showing name, conditions, category, score, and 44px action buttons; Dashboard and Accounts verified clean at 375px**

## Performance

- **Duration:** 2 min
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- RulesPage table hidden on mobile with max-md:hidden, replaced by card list (md:hidden)
- Rule cards display name, conditions summary, target category, specificity score, and edit/delete actions
- Edit and Delete buttons have 44px minimum tap targets on mobile
- Create Rule button has 44px mobile tap target
- DashboardPage audited — already uses grid-cols-1 on mobile, no overflow at 375px
- AccountsPage audited — already stacks vertically with space-y-3, no overflow at 375px

## Task Commits

1. **Task 1: Add mobile card layout to RulesPage** - `ad3a6b4` (feat)
2. **Task 2: Audit DashboardPage and AccountsPage** - No changes needed (both already mobile-friendly)

## Files Created/Modified
- `packages/client/src/pages/RulesPage.tsx` - Added mobile card list, max-md:hidden on table, 44px tap targets

## Decisions Made
- DashboardPage and AccountsPage required no changes — both already render correctly at 375px
- Used React fragment to wrap sibling table and card list in ternary expression

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
- JSX syntax error from HTML entity `&rarr;` — replaced with Unicode escape `{'\u2192'}` and wrapped sibling elements in React fragment

## Next Phase Readiness
- All pages in the app are now mobile-friendly, ready for phase verification

---
*Phase: 25-remaining-pages*
*Completed: 2026-03-23*
