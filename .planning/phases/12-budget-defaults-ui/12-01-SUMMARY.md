---
phase: 12-budget-defaults-ui
plan: 01
subsystem: ui
tags: [react, trpc, tanstack-query, budget, defaults]

requires:
  - phase: 08-budget-ui
    provides: BudgetPage with allocation grid and AllocationCell component
provides:
  - Default monthly allocation column in budget grid
  - Click-to-edit default values using existing AllocationCell pattern
  - Set/delete mutations wired to budget.defaults tRPC procedures
affects: []

tech-stack:
  added: []
  patterns:
    - "Parallel useQuery for independent data (summary + defaults)"
    - "Save-or-delete pattern: zero amount triggers delete mutation"

key-files:
  created:
    - packages/client/src/pages/BudgetPage.test.ts
  modified:
    - packages/client/src/pages/BudgetPage.tsx

key-decisions:
  - "Default column placed between Category and Allocated for natural reading order"
  - "Unset defaults show $0.00 in muted gray (text-gray-400) to distinguish from explicitly set values"
  - "groupCategories exported and accepts optional defaultsMap for testability"
  - "No optimistic updates for defaults — simple invalidation on mutation success"

patterns-established:
  - "Client-side test pattern: export pure data functions from page components for unit testing"

requirements-completed: [BUDG-05, BUDG-06]

duration: 5min
completed: 2026-03-22
---

# Phase 12: Budget Defaults UI Summary

**Budget grid now shows a Default column where users can set per-category default monthly allocations that the auto-funding scheduler uses.**

## What Changed

BudgetPage.tsx extended from 4-column to 5-column grid (Category, Default, Allocated, Spent, Available). Each category row shows its default allocation with click-to-edit via the existing AllocationCell component. Saving a non-zero value calls `budget.defaults.set`; saving zero calls `budget.defaults.delete`. Group headers display default subtotals.

## Key Implementation Details

- `groupCategories()` now accepts an optional `defaultsMap` parameter and computes `totalDefault` per group
- Two new mutations (`setDefaultMut`, `deleteDefaultMut`) with cache invalidation on `budget.defaults.list` query key
- `handleSetDefault()` routes to set or delete mutation based on whether amount is zero
- Categories without a saved default display `$0.00` in muted gray (`text-gray-400`)

## Tests Added

6 tests for `groupCategories` covering: grouping by name, totals computation, default totals with/without defaults map, partial defaults, and empty input.

## Self-Check: PASSED

- [x] Default column renders in budget grid
- [x] Click-to-edit works for default values
- [x] Save calls budget.defaults.set mutation
- [x] Zero-amount save calls budget.defaults.delete mutation
- [x] Group headers show default subtotals
- [x] All 225 tests pass (219 existing + 6 new)
